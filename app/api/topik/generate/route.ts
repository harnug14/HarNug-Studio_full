import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";

// DIBERI WAKTU 60 DETIK AGAR VERCEL TIDAK MEMUTUS PAKSA (0% TIMEOUT 504)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// OTAK UTAMA: MURNI GEMINI 3.6 FLASH
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
        tools: [{ googleSearch: {} }],
        generationConfig: {
          responseMimeType: "application/json",
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
      kategori = "Sejarah Unik & Fakta Kehidupan",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
    } = await req.json();

    // EKSEKUSI KUERI DATABASE PARALEL
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
        .limit(50),
    ]);

    let referenceContextText = "";
    let isProfileMode = false;

    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      
      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => {
          return `Contoh Naskah ${idx + 1}: ${e.title}\nNaskah Utuh:\n${e.full_script || ""}`;
        })
        .join("\n\n---\n\n");

      referenceContextText = `\n\nREFERENSI PROFIL CHANNEL LENGKAP ("${profileRes.data.profile_name}"):\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data
        .map((t: any, idx: number) => `${idx + 1}. ${t.judul}`)
        .join("\n");
      riwayatTopikText = `\n\n--- DAFTAR TOPIK LAMA YANG WAJIB DIHINDARI ---\n${daftarJudul}\n\nSetiap kandidat topik baru WAJIB memiliki INTI CERITA/FAKTA yang BENAR-BENAR BERBEDA dari daftar di atas.`;
    }

    const systemPrompt = `Kamu adalah seorang Expert Content Strategist & Topic Researcher kelas dunia spesialis niche Curious History, Fakta Unik Asal-usul, dan Sejarah Kehidupan Manusia.
Gunakan kapabilitas Google Search untuk mencari dan memvalidasi fakta sejarah otentik, peristiwa unik masa lalu, atau asal-usul barang/kebiasaan sehari-hari yang mengejutkan dan akurat (anti-halusinasi).

Hasilkan ${jumlah} ide topik video YouTube Shorts/Reels berkualitas tinggi yang orisinal, kaya fakta menarik, dan berpotensi viral tinggi.

RUBRIK VALIDASI SKOR (/50):
- Relevansi/Familiaritas Audiens (/10)
- Potensi Visual (/10)
- Kekuatan Struktur/Timeline (/10)
- Potensi Hook (/10)
- Potensi Viral (/10)
Total skor WAJIB >= 40/50.

FORMAT JSON OUTPUT PERSIS (pure JSON object):
{
  "candidates": [
    {
      "judul": "Judul Ide Topik yang Menarik, Memancing Rasa Penasaran, dan Konkret",
      "penjelasan": "Penjelasan singkat 2-3 kalimat mengenai fakta otentik di balik topik ini dan bagaimana eksekusi ceritanya.",
      "skor": { "total": 45 },
      "alasanKelulusan": "Penjelasan singkat kenapa topik ini lolos skor >= 40/50 dan memiliki dasar fakta sejarah yang kuat."
    }
  ]
}${riwayatTopikText}`;

    const userPrompt = isProfileMode
      ? `PROFIL CHANNEL DIPILIH:${referenceContextText}

Instruksi Tambahan:
Analisis seluruh gaya bahasa, tone, topik, dan struktur dari naskah utuh channel di atas. Lakukan validasi fakta via web search, lalu hasilkan ${jumlah} kandidat ide topik baru yang konsisten dengan pola channel referensi tersebut dalam JSON murni.`
      : `Parameter Ideation Topic:
- Kategori Niche: ${kategori}
- Target Durasi Video: ${durasi}
- Topik/Preferensi yang Disukai: ${topikDisukai || "Sejarah unik, asal-usul barang/kebiasaan, peristiwa aneh masa lalu yang nyata"}
- Topik yang Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah Kandidat: ${jumlah} kandidat

Validasi fakta sejarahnya dan hasilkan ${jumlah} kandidat ide topik yang lolos skor >= 40/50 dalam JSON murni sekarang.`;

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
