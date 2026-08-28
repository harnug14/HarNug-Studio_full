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

    // EKSEKUSI KUERI PARALEL (AMBIL PROFIL CHANNEL DARI DB + 100 TOPIK RIWAYAT)
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

    // 💡 EKSTRAKSI DNA DARI CHANNEL MANA PUN YANG DIPILIH DARI DATABASE
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name;
      
      sampleTitlesList = profileRes.data.channel_analysis_entries.map((e: any) => e.title).filter(Boolean);
      
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
      const list = combinedRejected.slice(0, 40).map((r: string) => `- ${r}`).join("\n");
      blacklistText = `\n\n⛔ DAFTAR TOPIK DITOLAK/DIABAIKAN PENGGUNA (JANGAN DIBUAT LAGI):\n${list}`;
    }

    // 💡 PENCARIAN TAVILY REAL-TIME DINAMIS (MENYESUAIKAN TEMA ASLI CHANNEL)
    let tavilyContext = "";
    try {
      let searchQuery = "";
      if (isProfileMode) {
        // Ambil 2 sampel judul asli channel untuk memandu arah pencarian web
        const titleKeywords = sampleTitlesList.slice(0, 2).join(" ").replace(/[^a-zA-Z0-9\s]/g, "");
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

    // 💡 SYSTEM PROMPT MURNI DINAMIS (OTOMATIS BERADAPTASI KE CHANNEL APA PUN)
    const systemPrompt = isProfileMode
      ? `Kamu adalah Lead Content Strategist & Topic Architect kelas dunia. 
TUGAS UTAMA: Analisis dan ekstrak secara mandiri DNA gaya konten, tema pembahasan, sudut pandang unik, pacing cerita, dan formula judul dari channel "${channelName}" berdasarkan naskah-naskah aslinya di bawah.
Hasilkan ide topik baru yang 100% selaras dengan DNA channel tersebut, berakar pada fakta otentik dari web riset, dan memiliki potensi retensi penonton yang tinggi.

⚖️ ATURAN KUALITAS & GAYA BAHASA:
1. GAYA BAHASA: Tiru gaya bertutur khas channel "${channelName}". Gunakan bahasa yang LUGAS, SANTAI, dan CERDAS.
2. DILARANG VULGAR KASAR & DILARANG LEBAY/HIPERBOLA.
3. DILARANG MENGULANG SUBJEK/TEMA yang sudah ada di database atau yang diabaikan pengguna.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Sesuai Karakter Channel (Lugas, Cerdas, Hook Kuat)",
      "kategori": "Tradisi & Perilaku", // Klasifikasikan ke salah satu: "Asal-Usul Benda" | "Profesi Kuno" | "Tradisi & Perilaku" | "Peristiwa & Taktik"
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
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MENIRU KARAKTER DAN POLA DARI CONTOH NASKAH ASLI CHANNEL "${channelName}".
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
