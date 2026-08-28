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

    // EKSEKUSI KUERI PARALEL (PROFIL REFERENSI + RIWAYAT DATABASE)
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

    // 💡 JIKA MEMILIH REFERENSI CHANNEL (MISAL: JURNAL KUMAL ATAU DAFIOLOGY)
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name;
      
      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => `[CONTOH NASKAH ASLI ${idx + 1}]: "${e.title}"\nNaskah:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== CONTOH POLA & NASKAH ASLI CHANNEL "${channelName}" ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK SUDAH ADA DI DATABASE (DILARANG MENGULANG TEMA INI):\n${daftarJudul}`;
    }

    let blacklistText = "";
    const combinedRejected = [
      ...(topikDitolak ? [topikDitolak] : []),
      ...(Array.isArray(rejectedHistory) ? rejectedHistory : []),
    ];

    if (combinedRejected.length > 0) {
      const list = combinedRejected.slice(0, 40).map((r: string) => `- ${r}`).join("\n");
      blacklistText = `\n\n⛔ DAFTAR TOPIK DITOLAK/DIABAIKAN PENGGUNA (DILARANG MUNCUL LAGI):\n${list}`;
    }

    let tavilyContext = "";
    try {
      const searchQuery = topikDisukai
        ? `fakta unik sejarah menarik ${topikDisukai}`
        : isProfileMode
        ? `fakta unik sejarah aneh menarik ${channelName}`
        : `fakta unik menarik sejarah peradaban manusia`;
      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA RISET WEB TERBARU]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily fallback:", e);
    }

    // 💡 SYSTEM PROMPT 100% DINAMIS (MENYESUAIKAN DENGAN CHANNEL YANG DIPILIH)
    const systemPrompt = isProfileMode
      ? `Kamu adalah Lead Content Strategist & Topic Architect kelas dunia. 
TUGAS UTAMA: Analisis, serap, dan tiru secara presisi DNA gaya konten, tone narasi, sudut pandang unik, dan struktur topik dari channel "${channelName}" berdasarkan contoh-contoh naskah aslinya di bawah.

⚖️ ATURAN KUALITAS & GAYA BAHASA:
1. GAYA BAHASA: Tiru gaya bertutur khas channel "${channelName}". Gunakan bahasa yang LUGAS, CERDAS, dan SANTAI.
2. DILARANG VULGAR KASAR & DILARANG LEBAY/HIPERBOLA.
3. DILARANG MENGULANG TEMA/SUBJEK yang sudah ada di database atau yang ditolak pengguna.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Sesuai Pola ${channelName} (Lugas, Hook Kuat)",
      "kategori": "Asal-Usul Benda", // Pilih salah satu: "Asal-Usul Benda" | "Profesi Kuno" | "Tradisi & Perilaku" | "Peristiwa & Taktik"
      "penjelasan": "Uraian singkat 2-3 kalimat mengenai fakta otentik dan alasan kenapa ini menarik.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50 sesuai pola ${channelName}."
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
      "kategori": "Asal-Usul Benda", // Pilih salah satu: "Asal-Usul Benda" | "Profesi Kuno" | "Tradisi & Perilaku" | "Peristiwa & Taktik"
      "penjelasan": "Uraian singkat 2-3 kalimat mengenai fakta otentik.",
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
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MENIRU GAYA CHANNEL "${channelName}".
- Pelajari pola judul dan naskah channel di atas.
- Pastikan topik bervariasi antar-kategori dan belum ada di database.
- Output murni JSON.`
      : `Parameter Pencarian:
- Kategori: ${kategori}
- Durasi: ${durasi}
- Preferensi: ${topikDisukai || "Fakta unik, sejarah, peristiwa menarik"}
- Topik Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah: ${jumlah} kandidat
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
