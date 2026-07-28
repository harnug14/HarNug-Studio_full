import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";

const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;

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

    let referenceContextText = "";
    let isProfileMode = false;

    if (referenceProfileId) {
      const { data: channelProfile } = await supabase
        .from("channel_analysis")
        .select("profile_name, channel_analysis_entries(title, full_script)")
        .eq("id", referenceProfileId)
        .single();

      if (channelProfile && channelProfile.channel_analysis_entries?.length) {
        isProfileMode = true;
        const samples = channelProfile.channel_analysis_entries
          .map((e: any, idx: number) => `Contoh ${idx + 1}: ${e.title}\nNaskah: ${e.full_script}`)
          .join("\n\n---\n\n");
        referenceContextText = `\n\nREFERENSI PROFIL CHANNEL KALIBRASI ("${channelProfile.profile_name}"):\nAnalisis pola niche, gaya, tone, dan tema dari contoh-contoh naskah berikut:\n\n${samples}`;
      }
    }

    // AMBIL RIWAYAT TOPIK YANG SUDAH ADA DI TOPIC BANK USER — supaya AI tidak mengulang ide yang sama/mirip.
    // Ini kunci fix untuk bug "ide selalu itu-itu lagi, cuma beda judul".
    const { data: existingTopics } = await supabase
      .from("topik")
      .select("judul, catatan")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    let riwayatTopikText = "";
    if (existingTopics && existingTopics.length > 0) {
      const daftarJudul = existingTopics
        .map((t: any, idx: number) => `${idx + 1}. ${t.judul}`)
        .join("\n");
      riwayatTopikText = `\n\n--- DAFTAR TOPIK YANG SUDAH PERNAH DIHASILKAN/DISIMPAN SEBELUMNYA (WAJIB DIHINDARI) ---\n${daftarJudul}\n\nATURAN WAJIB SOAL DAFTAR DI ATAS: setiap kandidat topik baru yang kamu hasilkan sekarang WAJIB memiliki INTI CERITA/FAKTA/SUDUT PANDANG yang BENAR-BENAR BERBEDA dari semua judul di daftar itu. DILARANG KERAS menghasilkan topik yang isi/substansinya sama tapi cuma judulnya dipoles beda kata-kata (misalnya "Sejarah High Heels untuk Perang" vs "Asal Usul High Heels di Medan Tempur" adalah PELANGGARAN karena inti ceritanya sama persis). Kalau kamu merasa ide yang mau kamu tulis mirip dengan salah satu di daftar itu, WAJIB cari sudut pandang, fakta, atau kejadian lain yang sama sekali berbeda untuk kategori/tema yang diminta.`;
    }

    const systemPrompt = `Kamu adalah seorang Expert YouTube Shorts Content Strategist & Topic Validator tingkat dunia.
Tugasmu adalah menghasilkan ide topik video YouTube Shorts berkualitas tinggi berdasarkan parameter atau data kalibrasi channel.

--- ATURAN HUKUM UTAMA ---
1. KUALITAS > KUANTITAS. Prioritaskan ide topik yang benar-benar kuat, relevan, dan berpotensi tinggi.
2. DILARANG KERAS membahas: SARA, Politik, Agama, Konspirasi berbahaya, atau Kekerasan Grafis.
3. SEMUA TOPIC CANDIDATE WAJIB DIVALIDASI DENGAN RUBRIK 50 POIN BERIKUT:
   - Relevansi/Familiaritas Audiens (/10)
   - Potensi Visual (/10)
   - Kekuatan Struktur/Timeline (/10)
   - Potensi Hook (/10)
   - Potensi Viral (/10)
4. TOTAL SKOR WAJIB ATAS ATAU SAMA DENGAN 40/50. JIKA TOTAL SKOR < 40/50, IDE TERSEBUT WAJIB DITOLAK DAN TIDAK BOLEH DIMASUKKAN DALAM OUTPUT!
5. WAJIB HINDARI CONTOH YANG TERLALU UMUM/KLISE: jangan langsung menarik ke contoh paling terkenal/paling sering dibahas untuk suatu tema (misalnya kalau diminta "fenomena alam unik", jangan otomatis selalu balik ke Tardigrada atau Cordyceps). Aktif cari sudut pandang, kejadian, atau fakta yang JARANG diangkat kreator lain, bukan yang paling ikonik/mudah ditebak.
6. Tulis jawaban DALAM FORMAT JSON PERSIS berikut tanpa pembungkus markdown apapun (pure JSON object):
{
  "candidates": [
    {
      "judul": "Judul Ide Topik yang Menarik dan Konkret",
      "penjelasan": "Penjelasan singkat 2-3 kalimat kenapa topik ini sangat menarik dan bagaimana eksekusinya.",
      "skor": {
        "relevansi": 9,
        "visual": 9,
        "struktur": 8,
        "hook": 9,
        "viral": 8,
        "total": 43
      },
      "alasanKelulusan": "Penjelasan singkat kenapa topik ini lolos ambang batas 40/50 poin."
    }
  ]
}${riwayatTopikText}`;

    const userPrompt = isProfileMode
      ? `PROFIL CHANNEL DIPIILIH:${referenceContextText}

Instruksi Tambahan:
Analisis pola niche, durasi ideal, tone, dan tema dari naskah-naskah contoh channel di atas. Hasilkan 5 kandidat ide topik baru yang SANGAT KONSISTEN dengan pola channel referensi tersebut namun dengan sudut pandang/topik orisinal yang baru.

Tolong hasilkan kandidat ide topik yang lolos validasi skor >= 40/50 poin sekarang dalam format JSON murni.`
      : `Parameter Ideation Topic (Manual):
- Kategori Prioritas: ${kategori}
- Target Durasi Video: ${durasi}
- Topik yang Disukai / Fokus: ${topikDisukai || "Bebas/Menyesuaikan"}
- Topik yang Ditolak / Dihindari: ${topikDitolak || "Tidak ada khusus"}
- Target Jumlah Kandidat Lolos Validasi: ${jumlah} kandidat

Tolong hasilkan kandidat ide topik yang lolos validasi skor >= 40/50 poin sekarang dalam format JSON murni.`;

    const rawResponse = await callGeminiWithRotation(supabase, async (apiKey) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }],
              },
            ],
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 1.1,
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
      }

      const json = await response.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    });

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