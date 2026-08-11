import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";

// DIBERI WAKTU 60 DETIK AGAR VERCEL TIDAK MEMUTUS PAKSA (0% TIMEOUT 504)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// OTAK UTAMA TUNGGAL (TIDAK BOLEH DIGANTI/DITURUNKAN)
const MAIN_MODEL = "gemini-3.6-flash";

async function callGeminiApi(
  supabase: any,
  userPrompt: string,
  systemPrompt: string,
  temperature: number = 1.0
): Promise<string> {
  // Key rotation tetap berjalan untuk menjaga kuota API Key, tetapi HANYA memakai Gemini 3.6 Flash
  return await callGeminiWithRotation(supabase, async (apiKey) => {
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
            temperature,
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new GeminiQuotaError(`Gemini Rate Limit Exceeded (429)`);
      }
      throw new Error(`Gemini API Error: Status ${response.status}`);
    }

    const json = await response.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
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
      kategori = "Umum/Edukasi",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
    } = await req.json();

    // EXEKUSI KUERI DATABASE PARALEL
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
      
      // BACA SELURUH NASKAH UTUH TANPA DIPANGKAS SAMA SEKALI
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

    const systemPrompt = `Kamu adalah seorang Expert YouTube Shorts Content Strategist & Topic Validator tingkat dunia.
Hasilkan ${jumlah} ide topik video YouTube Shorts berkualitas tinggi yang orisinal, relevan, dan berpotensi viral.

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
      "judul": "Judul Ide Topik yang Menarik dan Konkret",
      "penjelasan": "Penjelasan singkat 2-3 kalimat kenapa topik ini sangat menarik dan bagaimana eksekusinya.",
      "skor": { "total": 43 },
      "alasanKelulusan": "Penjelasan singkat kenapa topik ini lolos skor >= 40/50."
    }
  ]
}${riwayatTopikText}`;

    const userPrompt = isProfileMode
      ? `PROFIL CHANNEL DIPIILIH:${referenceContextText}

Instruksi Tambahan:
Analisis seluruh gaya bahasa, tone, topik, dan struktur dari naskah utuh channel di atas. Hasilkan ${jumlah} kandidat ide topik baru yang konsisten dengan pola channel referensi tersebut dalam JSON murni.`
      : `Parameter Ideation Topic (Manual):
- Kategori Prioritas: ${kategori}
- Target Durasi Video: ${durasi}
- Topik yang Disukai: ${topikDisukai || "Bebas"}
- Topik yang Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah Kandidat: ${jumlah} kandidat

Hasilkan ${jumlah} kandidat ide topik yang lolos skor >= 40/50 dalam JSON murni sekarang.`;

    // PEMANGGILAN KHUSUS GEMINI 3.6 FLASH
    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt,
      1.0
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
