import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-pro",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

async function callGeminiApiWithFallback(
  supabase: any,
  userPrompt: string,
  systemPrompt: string,
  temperature: number = 1.0
): Promise<string> {
  let lastError: any = null;

  for (const currentModel of GEMINI_FALLBACK_MODELS) {
    try {
      const rawResponse = await callGeminiWithRotation(supabase, async (apiKey) => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`,
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
          if (response.status === 429) throw new GeminiQuotaError(`Gemini rate-limited (429)`);
          throw new Error(`Gemini Error: ${response.status}`);
        }

        const json = await response.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      });

      if (rawResponse) return rawResponse;
    } catch (err: any) {
      lastError = err;
      break; // Langsung throw tanpa delay loop agar tidak memicu Vercel 504 Timeout
    }
  }

  throw new Error(`Gagal membuat kandidat topik: ${lastError?.message || "Internal Server Error"}`);
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

    // EXEKUSI KUERI DATABASE SECARA PARALEL (Promise.all) UNTUK HEMAT WAKTU
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
      // Ambil 3 sampel naskah kalibrasi paling representatif agar proses AI super cepat (2 detik)
      const samples = profileRes.data.channel_analysis_entries
        .slice(0, 3)
        .map((e: any, idx: number) => {
          const cleanScript = e.full_script ? e.full_script.substring(0, 500) : "";
          return `Contoh ${idx + 1}: ${e.title}\nNaskah: ${cleanScript}`;
        })
        .join("\n\n---\n\n");
      referenceContextText = `\n\nREFERENSI PROFIL CHANNEL KALIBRASI ("${profileRes.data.profile_name}"):\n${samples}`;
    }

    // 50 Riwayat topik lama tetap dibaca utuh untuk hindari duplikasi
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
Analisis pola niche, durasi ideal, tone, dan tema dari contoh channel di atas. Hasilkan ${jumlah} kandidat ide topik baru yang konsisten dengan pola channel referensi tersebut dalam JSON murni.`
      : `Parameter Ideation Topic (Manual):
- Kategori Prioritas: ${kategori}
- Target Durasi Video: ${durasi}
- Topik yang Disukai: ${topikDisukai || "Bebas"}
- Topik yang Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah Kandidat: ${jumlah} kandidat

Hasilkan ${jumlah} kandidat ide topik yang lolos skor >= 40/50 dalam JSON murni sekarang.`;

    const rawResponse = await callGeminiApiWithFallback(
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
