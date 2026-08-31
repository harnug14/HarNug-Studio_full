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
          temperature: 0.8,
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

// Timeout helper untuk mencegah bottleneck Tavily memicu 504
async function fetchTavilyWithTimeout(query: string, timeoutMs = 5000): Promise<string> {
  try {
    const tavilyPromise = fetchTavilySearchResults(query);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Tavily timeout")), timeoutMs)
    );
    return await Promise.race([tavilyPromise, timeoutPromise]);
  } catch (e) {
    console.warn("[Topik] Tavily search fallback/timeout:", e);
    return "";
  }
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
      kategori = "Curious History",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
      rejectedHistory = [],
    } = await req.json();

    // 1. Ambil data profil beserta seluruh entri (*) secara universal
    const [profileRes, historyRes] = await Promise.all([
      referenceProfileId
        ? supabase
            .from("channel_analysis")
            .select("*, channel_analysis_entries(*)")
            .eq("id", referenceProfileId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("topik")
        .select("judul")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    let isProfileMode = false;
    let channelName = "Framework Murni";
    let referenceContextText = "";
    let sampleTitlesList: string[] = [];

    // 2. Ekstraksi fleksibel (mendeteksi title/video_title/judul & full_script/script/naskah/transcript)
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length > 0) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name || "Referensi";

      const entries = profileRes.data.channel_analysis_entries;

      sampleTitlesList = entries
        .map((e: any) => e.title || e.video_title || e.judul || "")
        .filter(Boolean);

      const samples = entries
        .slice(0, 8)
        .map((e: any, idx: number) => {
          const entryTitle = e.title || e.video_title || e.judul || `Contoh ${idx + 1}`;
          const entryScript =
            e.full_script || e.script || e.naskah || e.transcript || e.content || "";
          return `[CONTOH KONTEN ASLI ${idx + 1} - "${channelName}"]:\nJudul: "${entryTitle}"\nNaskah Utuh:\n${entryScript}`;
        })
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== DATA ACUAN UTAMA DARI MENU REFERENSI CHANNEL "${channelName}" ===\n${samples}`;
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
        .slice(0, 40)
        .map((r: string) => `- ${r}`)
        .join("\n");
      blacklistText = `\n\n⛔ DAFTAR TOPIK DITOLAK PENGGUNA (JANGAN DIBUAT LAGI):\n${list}`;
    }

    // 3. Riset fakta web real-time Tavily (dengan pelindung timeout)
    let tavilyContext = "";
    let searchQuery = "";

    if (isProfileMode) {
      const sampleKeywords = sampleTitlesList.slice(0, 3).join(" ").replace(/[^a-zA-Z0-9\s]/g, "").slice(0, 60);
      searchQuery = topikDisukai
        ? `fakta unik sejarah menarik ${topikDisukai}`
        : `fakta unik sejarah misteri ${sampleKeywords}`;
    } else {
      searchQuery = topikDisukai
        ? `${kategori} fakta sejarah unik ${topikDisukai}`
        : `${kategori} fakta sejarah unik menarik`;
    }

    const tavilyRes = await fetchTavilyWithTimeout(searchQuery, 5000);
    if (tavilyRes) {
      tavilyContext = `\n\n[DATA FAKTA RISET WEB REAL-TIME TAVILY]:\n${tavilyRes}`;
    }

    // 4. System Prompt murni berbasis data referensi
    const systemPrompt = isProfileMode
      ? `Kamu adalah Content Strategist & Storyteller YouTube Shorts.
TUGAS UTAMA:
Pelajari seluruh contoh naskah dan judul asli dari channel "${channelName}" yang terlampir di bawah.
Tiru gaya bertutur, tema unik (sejarah/asal-usul/fakta manusia), sudut pandang (curiosity hook), dan ritme penceritaannya.
Hasilkan ide topik baru yang 100% KONSISTEN dengan DNA channel "${channelName}".

ATURAN WAJIB:
- Gunakan bahasa Indonesia yang santai, cerdas, mengalir, dan memikat (anti-lebay/clickbait murahan).
- Kategori topik harus relevan (misal: "Asal-Usul Benda", "Profesi Kuno", "Tradisi & Perilaku", "Peristiwa & Taktik", "Curious History").
- Dilarang mengulang topik yang sudah ada di database atau daftar ditolak.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Sesuai Gaya Channel Referensi",
      "kategori": "Kategori Sesuai Topik",
      "channelRef": "${channelName}",
      "penjelasan": "Uraian fakta singkat 2 kalimat mengenai inti cerita dan daya tariknya.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan topik sesuai DNA channel."
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
      "penjelasan": "Uraian fakta singkat 2 kalimat.",
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
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MENGADOPSI DNA KONTEN CHANNEL REFERENSI DI ATAS.
Format murni JSON valid.`
      : `Parameter:
- Kategori: ${kategori}
- Durasi: ${durasi}
- Preferensi: ${topikDisukai || "Bebas"}
- Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah: ${jumlah}
${riwayatTopikText}
${blacklistText}
${tavilyContext}

Hasilkan ${jumlah} ide topik dalam format JSON valid.`;

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
    console.error("[Topik API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat kandidat topik" },
      { status: 500 }
    );
  }
}
