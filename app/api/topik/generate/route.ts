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

    // 💡 EKSEKUSI KUERI DATABASE PARALEL (PROFIL REFERENSI + 100 RIWAYAT TOPIK)
    const [profileRes, historyRes] = await Promise.all([
      referenceProfileId
        ? supabase
            .from("channel_analysis")
            .select("profile_name, channel_analysis_entries(title, full_script)")
            .eq("id", referenceProfileId)
            .single()
        : Promise.resolve({ data: null }),
      supabase
        .from("topik")
        .select("judul")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    let isProfileMode = false;
    let channelName = "";
    let referenceContextText = "";
    let sampleTitlesList: string[] = [];

    // 💡 EKSTRAKSI DNA DARI KUMPULAN NASKAH DATABASE SECARA MANDIRI
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name;
      
      sampleTitlesList = profileRes.data.channel_analysis_entries
        .map((e: any) => e.title)
        .filter(Boolean);

      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => `[CONTOH NASKAH ASLI ${idx + 1}]: "${e.title}"\nNaskah:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== CONTOH POLA & NASKAH ASLI DARI DATABASE CHANNEL "${channelName}" ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK SUDAH ADA DI DATABASE (DILARANG MENGULANG INI):\n${daftarJudul}`;
    }

    let blacklistText = "";
    const combinedRejected = [
      ...(topikDitolak ? [topikDitolak] : []),
      ...(Array.isArray(rejectedHistory) ? rejectedHistory : []),
    ];

    if (combinedRejected.length > 0) {
      const list = combinedRejected.slice(0, 50).map((r: string) => `- ${r}`).join("\n");
      blacklistText = `\n\n⛔ DAFTAR TOPIK DITOLAK/DIABAIKAN PENGGUNA (DILARANG MUNCUL LAGI):\n${list}`;
    }

    // 💡 TAVILY REAL-TIME DINAMIS (OTOMATIS MENYESUAIKAN TEMA DARI JUDUL-JUDUL CHANNEL BARU)
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
          : `bizarre true facts unique phenomena interesting stories ${titleKeywords}`;
      } else {
        searchQuery = topikDisukai
          ? `${kategori} fakta unik menarik ${topikDisukai}`
          : `${kategori} fakta unik menarik mencengangkan`;
      }

      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA RISET WEB TERBARU VIA TAVILY]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily fallback:", e);
    }

    // 💡 SYSTEM PROMPT UNIVERSAL (OTOMATIS MEMBEDAH DNA CHANNEL APA PUN DI MASA DEPAN)
    const systemPrompt = isProfileMode
      ? `Kamu adalah Master Content Strategist & Channel DNA Cloner kelas dunia.
TUGAS UTAMA:
1. Analisis dan pelajari secara mandiri kumpulan naskah dan judul asli dari channel "${channelName}" yang dilampirkan di bawah.
2. Identifikasi secara cerdas:
   - TEMA & NICHE UTAMA channel tersebut (apakah sejarah kuno, fenomena nyata dunia, sains, misteri, kriminalitas, pop culture, dll).
   - LATAR WAKTU / ERA yang dibahas (apakah zaman kuno, masa kini/modern, atau futuristik).
   - FORMULA JUDUL, HOOK, dan PACING CERITA khas channel tersebut.
3. Hasilkan ide topik baru yang 100% KONSISTEN dengan tema, era, dan karakter channel "${channelName}" tersebut. DILARANG memaksakan tema sejarah jika channel tersebut membahas kasus nyata modern, dan sebaliknya!

⚖️ ATURAN GAYA BAHASA & KUALITAS:
- Tiru gaya bertutur khas channel "${channelName}".
- Gunakan bahasa LUGAS, SANTAI, dan CERDAS (Anti-Vulgar & Anti-Lebay/Clickbait Murahan).
- DILARANG MENGULANG SUBJEK/TOPIK yang sudah ada di database atau yang diabaikan pengguna.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Sesuai Karakter Channel (Lugas, Cerdas, Hook Kuat)",
      "kategori": "Kasus Unik", // Berikan label kategori yang paling relevan dengan subjek topik ini
      "penjelasan": "Uraian singkat 2-3 kalimat mengenai fakta otentik dan daya tarik ceritanya.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kenapa topik ini 100% selaras dengan DNA channel referensi dan bebas duplikasi."
    }
  ]
}`
      : `Kamu adalah Lead Content Strategist & Topic Architect untuk YouTube Shorts spesialis kategori "${kategori}".

⚖️ ATURAN KUALITAS & GAYA BAHASA:
1. Hasilkan ide topik berkualitas tinggi yang berakar pada fakta otentik dan berpotensi viral tinggi.
2. Gunakan bahasa yang LUGAS, CERDAS, dan SANTAI (Anti-Vulgar & Anti-Lebay).
3. DILARANG MENGULANG TEMA/SUBJEK yang sudah ada di database atau yang ditolak pengguna.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Menarik & Konkret",
      "kategori": "Tradisi & Perilaku",
      "penjelasan": "Uraian singkat fakta otentik.",
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

INSTRUKSI EKSEKUSI:
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MENIRU KARAKTER, ERA, DAN TEMA DARI CONTOH NASKAH ASLI CHANNEL "${channelName}".
- Pelajari contoh naskah asli channel di atas secara teliti.
- Pastikan topik baru belum ada di database dan didukung fakta riset web.
- Output murni JSON.`
      : `Parameter Pencarian:
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

    return NextResponse.json({ data: parsedData.candidates || [] });
  } catch (err: any) {
    console.error("Error generating topic candidates:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat kandidat topik" },
      { status: 500 }
    );
  }
}
