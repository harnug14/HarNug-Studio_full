import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { fetchTavilySearchResults } from "@/lib/tavily";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAIN_MODEL = "gemini-3.6-flash";

async function requestGoogleGemini(
  apiKey: string,
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MAIN_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.85,
        },
      }),
    }
  );

  const rawText = await response.text();

  if (!response.ok) {
    let errorDetail = rawText;
    try {
      const errJson = JSON.parse(rawText);
      errorDetail = errJson.error?.message || rawText;
    } catch {}
    throw new Error(`[${response.status}] ${errorDetail}`);
  }

  const json = JSON.parse(rawText);
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}

async function callGeminiApi(
  supabase: any,
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  return await callGeminiWithRotation(supabase, async (apiKey) => {
    return await requestGoogleGemini(apiKey, userPrompt, systemPrompt);
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    const {
      kategori = "Sains & Fakta Unik",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
      rejectedHistory = [],
    } = await req.json();

    // 1. Ambil data profil & entri naskah asli dari Supabase
    const [profileRes, historyRes] = await Promise.all([
      referenceProfileId
        ? supabase
            .from("channel_analysis")
            .select("id, profile_name, channel_analysis_entries(title, full_script)")
            .eq("id", referenceProfileId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("topik")
        .select("judul")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    let isProfileMode = false;
    let channelName = "Framework Murni";
    let referenceContextText = "";
    let sampleTitlesList: string[] = [];

    // 2. Rangkai contoh naskah asli dari database
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name;

      sampleTitlesList = profileRes.data.channel_analysis_entries
        .map((e: any) => e.title)
        .filter(Boolean);

      const samples = profileRes.data.channel_analysis_entries
        .map(
          (e: any, idx: number) =>
            `[CONTOH KONTEN ASLI ${idx + 1} - "${channelName}"]:\nJudul: "${e.title}"\nNaskah Utuh:\n${e.full_script || ""}`
        )
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== DATA ACUAN UTAMA DARI MENU REFERENSI ("${channelName}") ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data
        .map((t: any, idx: number) => `${idx + 1}. ${t.judul}`)
        .join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK DI DATABASE (DILARANG MENGULANG INI):\n${daftarJudul}`;
    }

    let blacklistText = "";
    const combinedRejected = [
      ...(topikDitolak ? [topikDitolak] : []),
      ...(Array.isArray(rejectedHistory) ? rejectedHistory : []),
    ];

    if (combinedRejected.length > 0) {
      const list = combinedRejected
        .slice(0, 60)
        .map((r: string) => `- ${r}`)
        .join("\n");
      blacklistText = `\n\n⛔ DAFTAR TOPIK DITOLAK/DIABAIKAN PENGGUNA (JANGAN DIBUAT LAGI):\n${list}`;
    }

    // 3. Riset fakta web real-time dinamis via Tavily
    let tavilyContext = "";
    try {
      let searchQuery = "";
      if (isProfileMode) {
        const titleKeywords = sampleTitlesList
          .slice(0, 3)
          .join(" ")
          .replace(/[^a-zA-Z0-9\s]/g, "")
          .slice(0, 100);
        searchQuery = topikDisukai
          ? `fakta unik menarik nyata ${topikDisukai}`
          : `fakta unik menarik sejarah ${titleKeywords}`;
      } else {
        searchQuery = topikDisukai
          ? `${kategori} fakta unik menarik ${topikDisukai}`
          : `${kategori} fakta unik menarik sejarah`;
      }

      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA RISET WEB REAL-TIME TAVILY]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily search fallback:", e);
    }

    // 4. System Prompt dinamis sesuai data referensi
    const systemPrompt = isProfileMode
      ? `Kamu adalah Content Strategist dan Analis Konten untuk YouTube Shorts.
TUGAS UTAMA:
Pelajari seluruh contoh judul dan naskah asli dari channel "${channelName}" yang terlampir dari Menu Referensi di bawah.
Identifikasi gaya bertuturnya, tema pembahasannya, sudut pandang ceritanya, dan formula judulnya.
Hasilkan ide topik baru yang 100% KONSISTEN dengan karakter konten dari Menu Referensi tersebut.

ATURAN:
- Gunakan bahasa yang lugas, santai, cerdas, dan memikat (anti-vulgar & anti-lebay/clickbait murahan).
- Kategori topik harus merefleksikan isi konten (misal: "Asal-Usul Benda", "Profesi Kuno", "Tradisi & Perilaku", "Peristiwa & Taktik", atau "Curious History").
- Dilarang mengulang topik yang sudah ada di database atau yang diabaikan pengguna.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Sesuai Karakter Menu Referensi",
      "kategori": "Kategori Sesuai Topik",
      "channelRef": "${channelName}",
      "penjelasan": "Uraian singkat 2-3 kalimat mengenai fakta otentik dan daya tarik ceritanya.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50 sesuai acuan Menu Referensi."
    }
  ]
}`
      : `Kamu adalah Content Strategist untuk YouTube Shorts spesialis kategori "${kategori}".

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Menarik & Konkret",
      "kategori": "${kategori}",
      "channelRef": "Framework Murni",
      "penjelasan": "Uraian fakta otentik.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50."
    }
  ]
}`;

    const userPrompt = isProfileMode
      ? `${referenceContextText}
${riwayatTopikText}
${blacklistText}
${tavilyContext}

INSTRUKSI:
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MENIRU KARAKTER DAN POLA KONTEN DARI MENU REFERENSI DI ATAS.
- Pastikan topik baru didukung oleh fakta riset web dan belum ada di database.
- Output murni JSON.`
      : `Parameter:
- Kategori: ${kategori}
- Durasi: ${durasi}
- Preferensi: ${topikDisukai || "Bebas"}
- Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah: ${jumlah}
${riwayatTopikText}
${blacklistText}
${tavilyContext}

Hasilkan ${jumlah} ide topik berkualitas tinggi dalam format JSON murni.`;

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

    const parsedData: any = parseJsonResponse(rawResponse, { candidates: [] });

    const formattedCandidates = (parsedData.candidates || []).map((c: any) => ({
      ...c,
      channelRef: c.channelRef || channelName,
    }));

    return NextResponse.json({ data: formattedCandidates });
  } catch (err: any) {
    console.error("Error generating topic candidates:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat kandidat topik" },
      { status: 500 }
    );
  }
}
