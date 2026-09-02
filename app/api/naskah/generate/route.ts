import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { fetchTavilySearchResults } from "@/lib/tavily";
import { analyzeStyleDna } from "@/lib/gemini/analyzeStyleDna";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAIN_MODEL = "gemini-3.6-flash";
const REFERENCE_TEMPERATURE = 0.7; // mode referensi: konsisten meniru
const GENERIC_TEMPERATURE = 0.75; // mode tanpa referensi
const MAX_SAMPLE_CHARS = 20000; // batas aman total karakter naskah contoh
const ANALYSIS_TIMEOUT_MS = 25000; // batas waktu penulis ringkasan, anti-504

/**
 * ============================================================
 * GOOGLE GEMINI REQUEST
 * ============================================================
 */
async function requestGoogleGemini(
  apiKey: string,
  userPrompt: string,
  systemPrompt: string,
  temperature: number
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MAIN_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
          temperature,
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

  return (
    json.candidates?.[0]?.content?.parts?.[0]?.text ||
    "{}"
  );
}

/**
 * ============================================================
 * GEMINI API WRAPPER
 * ============================================================
 */
async function callGeminiApi(
  supabase: any,
  userPrompt: string,
  systemPrompt: string,
  temperature: number
): Promise<string> {
  return await callGeminiWithRotation(
    supabase,
    async (apiKey) => {
      return await requestGoogleGemini(
        apiKey,
        userPrompt,
        systemPrompt,
        temperature
      );
    }
  );
}

// Batas waktu: kalau pekerjaan tidak selesai dalam X detik, anggap gagal (anti-504)
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Waktu analisis habis")), ms)
    ),
  ]);
}

/**
 * ============================================================
 * TAVILY REAL-TIME RESEARCH
 * ============================================================
 */
async function fetchTavilyFast(
  query: string,
  timeoutMs = 5000
): Promise<string> {
  if (!query || !query.trim()) {
    return "";
  }

  try {
    const tavilyPromise =
      fetchTavilySearchResults(query);

    const timeoutPromise = new Promise<string>(
      (_, reject) =>
        setTimeout(
          () => reject(new Error("Tavily timeout")),
          timeoutMs
        )
    );

    return await Promise.race([
      tavilyPromise,
      timeoutPromise,
    ]);
  } catch (error) {
    console.warn(
      "[Naskah] Tavily research fallback:",
      error
    );

    return "";
  }
}

// Ambil judul + naskah dari entri referensi (kompatibel beberapa nama kolom)
function getEntryField(e: any): { title: string; fullScript: string } {
  return {
    title: e?.title || e?.video_title || e?.judul || "",
    fullScript:
      e?.full_script || e?.script || e?.naskah || e?.transcript || e?.content || "",
  };
}

// Susun blok naskah contoh: SEMUA entri dikirim selama masih muat batas karakter
function buildSamplesText(entries: any[]): string {
  const parts: string[] = [];
  let used = 0;
  entries.forEach((e: any, idx: number) => {
    const { title, fullScript } = getEntryField(e);
    const block = `--- NASKAH REFERENSI ${idx + 1} ---\nJudul: "${title || `Contoh ${idx + 1}`}"\nNaskah:\n${fullScript}\n`;
    if (parts.length > 0 && used + block.length > MAX_SAMPLE_CHARS) return;
    parts.push(block);
    used += block.length;
  });
  return parts.join("\n\n====================\n\n");
}

/**
 * ============================================================
 * MAIN POST
 * ============================================================
 */
export async function POST(req: NextRequest) {
  try {
    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Belum login",
        },
        {
          status: 401,
        }
      );
    }

    const {
      topikId = null,
      judulTopik = "",
      catatanTopik = "",
      tone = "Natural & Antusias",
      targetPanjang = "45-60 detik (130-160 kata)",
      referenceProfileId = null,
    } = await req.json();

    /**
     * --------------------------------------------------------
     * VALIDASI INPUT
     * --------------------------------------------------------
     */
    if (!judulTopik || !judulTopik.trim()) {
      return NextResponse.json(
        {
          error: "Judul topik wajib diisi",
        },
        {
          status: 400,
        }
      );
    }

    const cleanJudul =
      judulTopik.trim();

    const escapedJudul =
      cleanJudul.replace(/"/g, "'");

    /**
     * --------------------------------------------------------
     * RESOLVE REFERENCE PROFILE
     * --------------------------------------------------------
     */
    let targetProfileId =
      referenceProfileId;

    /**
     * Safety fallback:
     * Jika UI belum mengirim referenceProfileId,
     * coba mengambil profile dari topik lama.
     */
    if (!targetProfileId && topikId) {
      const { data: topikRow } =
        await supabase
          .from("topik")
          .select("catatan")
          .eq("id", topikId)
          .single();

      if (topikRow?.catatan) {
        const matches = Array.from(
          topikRow.catatan.matchAll(
            /$$(.*?)$$/g
          )
        )
          .map((match: any) =>
            match[1]
              ? String(match[1]).trim()
              : ""
          )
          .filter(Boolean);

        if (matches.length > 0) {
          const candidateName =
            matches.length >= 2
              ? matches[1]
              : matches[0];

          const {
            data: foundProfile,
          } = await supabase
            .from("channel_analysis")
            .select("id")
            .eq("user_id", user.id)
            .ilike(
              "profile_name",
              candidateName
            )
            .maybeSingle();

          if (foundProfile) {
            targetProfileId =
              foundProfile.id;
          }
        }
      }
    }

    /**
     * ========================================================
     * PARALLEL DATA FETCH
     * ========================================================
     */
    const tavilyQuery =
      `fakta sejarah kronologi asal usul ` +
      `tokoh tahun peristiwa detail nyata ` +
      `${cleanJudul}`;

    const [
      profileRes,
      tavilyRes,
    ] = await Promise.all([
      targetProfileId
        ? supabase
            .from("channel_analysis")
            .select(
              "*, channel_analysis_entries(*)"
            )
            .eq(
              "id",
              targetProfileId
            )
            .single()
        : Promise.resolve({
            data: null,
            error: null,
          }),

      fetchTavilyFast(
        tavilyQuery,
        5000
      ),
    ]);

    /**
     * ========================================================
     * REFERENCE / STYLE DNA
     * ========================================================
     *
     * BARU: jika ringkasan gaya belum ada / ketinggalan zaman,
     * ditulis OTOMATIS di sini (dibatasi 25 detik, anti-504).
     * Ringkasan + SEMUA naskah contoh dikirim bersamaan ke AI.
     */
    let isProfileMode = false;

    let channelName =
      "Framework Murni";

    let referenceContextText =
      "";

    let styleDnaMissing =
      false;

    let dnaAutoAnalyzed =
      false;

    if (
      profileRes.data &&
      profileRes.data
        .channel_analysis_entries
        ?.length > 0
    ) {
      isProfileMode = true;

      channelName =
        profileRes.data.profile_name ||
        "Referensi";

      const entries =
        profileRes.data
          .channel_analysis_entries;

      let styleDna =
        profileRes.data.style_dna;

      const dnaEntryCount =
        profileRes.data
          .style_dna_entry_count || 0;

      const dnaHasContent =
        styleDna &&
        (styleDna.ringkasanKarakter ||
          styleDna.hookPattern);

      const dnaIsFresh =
        dnaHasContent &&
        dnaEntryCount === entries.length;

      if (!dnaIsFresh) {
        // OTOMATIS tulis ringkasan sekarang, dengan batas waktu aman.
        try {
          const entriesForAnalysis = entries.map((e: any) => {
            const f = getEntryField(e);
            return {
              title: f.title,
              fullScript: f.fullScript.slice(0, 2000),
            };
          });

          const freshDna = await withTimeout(
            callGeminiWithRotation(supabase, (apiKey) =>
              analyzeStyleDna(entriesForAnalysis, apiKey, MAIN_MODEL)
            ),
            ANALYSIS_TIMEOUT_MS
          );

          await supabase
            .from("channel_analysis")
            .update({
              style_dna: freshDna,
              style_dna_updated_at: new Date().toISOString(),
              style_dna_entry_count: entries.length,
            })
            .eq("id", profileRes.data.id);

          styleDna = freshDna;
          dnaAutoAnalyzed = true;
        } catch (e) {
          console.warn(
            "[Naskah] Ringkasan gaya tidak selesai tepat waktu, pakai mode naskah asli:",
            e
          );
          styleDnaMissing = true;
        }
      }

      const samplesText = buildSamplesText(entries);

      if (!styleDnaMissing && styleDna) {
        const dnaBlock = `
=== DNA STORYTELLING CHANNEL "${channelName}" ===

PRIORITAS #1: hasil akhir harus terasa seperti episode baru
dari channel "${channelName}", bukan artikel generik.

DNA ini bukan kumpulan kata yang harus disalin.
DNA ini adalah pola perilaku penulisan yang harus diterapkan
secara natural pada cerita baru.

1. POLA HOOK:
${styleDna.hookPattern || "-"}

2. STRUKTUR BEAT:
${
  (styleDna.strukturBeat || [])
    .map(
      (item: string, index: number) =>
        `${index + 1}) ${item}`
    )
    .join(" -> ") || "-"
}

3. GAYA BAHASA:
${styleDna.gayaBahasa || "-"}

4. DIKSI / FRASA KHAS:
${
  (styleDna.diksiKhas || [])
    .join(", ") || "-"
}

5. TEKNIK TRANSISI:
${styleDna.teknikTransisi || "-"}

6. POLA PENUTUP:
${styleDna.closingPattern || "-"}

7. RITME & PANJANG KALIMAT:
${styleDna.panjangKalimatRataRata || "-"}

8. HAL YANG DIHINDARI:
${
  (styleDna.halYangDihindari || [])
    .join("; ") || "-"
}

9. RINGKASAN KARAKTER PENULISAN:
${styleDna.ringkasanKarakter || "-"}

ATURAN PENTING:

- Terapkan POLA, bukan menyalin kalimat.
- Jangan memaksakan diksi khas jika tidak cocok dengan konteks.
- Jangan memasukkan kata atau frasa hanya demi terlihat seperti referensi.
- Jangan membuat naskah terdengar seperti artikel ensiklopedia.
- Pertahankan karakter narasi yang hidup, lisan, natural, dan mudah divisualisasikan.
- Fakta baru harus tetap terasa seperti cerita baru, bukan imitasi mekanis.
`;

        referenceContextText =
          `\n\n${dnaBlock}\n\n=== CONTOH NASKAH ASLI CHANNEL "${channelName}" (bahan peniru gaya terkuat — pelajari ritme, hook, transisi, dan penutupnya) ===\n\n${samplesText}`;
      } else {
        referenceContextText = `
=== REFERENSI NASKAH CHANNEL "${channelName}" ===

Bedah sendiri pola gaya dari naskah asli di bawah:

- ritme
- cara membuka cerita
- cara memperkenalkan fakta
- cara berpindah antar beat
- penggunaan analogi
- tingkat informalitas
- cara membangun eskalasi
- cara menutup cerita

Jangan menyalin isi, fakta, kalimat, atau struktur cerita secara literal.

${samplesText}
`;
      }
    }

    /**
     * ========================================================
     * TAVILY FACT CONTEXT
     * ========================================================
     */
    const tavilyContext =
      tavilyRes
        ? `
=== HASIL RISET WEB REAL-TIME TAVILY ===

Gunakan informasi berikut sebagai SUMBER FAKTA,
bukan sebagai teks yang harus disalin.

${tavilyRes}

ATURAN SUMBER:
- Jangan mengarang fakta yang tidak didukung.
- Jangan mengubah angka, tahun, nama, lokasi,
  urutan sejarah, atau hubungan sebab-akibat.
- Jika terdapat konflik antar sumber, jangan memilih
  klaim yang lebih dramatis hanya karena terdengar menarik.
- Utamakan fakta yang paling dapat dipertanggungjawabkan.
- Tidak semua fakta harus masuk ke naskah.
- Pilih fakta yang paling penting untuk cerita.
`
        : `
=== RISET WEB TIDAK TERSEDIA ===

Tavily tidak memberikan hasil riset.
Jangan mengarang detail sejarah spesifik.

Gunakan hanya pengetahuan yang benar-benar dapat
dipastikan dan hindari klaim presisi yang meragukan.
`;

    /**
     * ========================================================
     * SYSTEM PROMPT
     * ========================================================
     */
    const systemPrompt = isProfileMode
      ? `
Kamu adalah Scriptwriter dan Storytelling Director resmi
untuk channel YouTube "${channelName}".

Tugas utama:
Membuat naskah YouTube Shorts sejarah yang terasa natural,
hidup, mudah didengar, mudah divisualisasikan, dan tetap
akurat secara faktual.

TOPIK:
"${escapedJudul}"

TONE:
"${tone}"

TARGET DURASI:
"${targetPanjang}"

============================================================
PRINSIP UTAMA
============================================================

Naskah bukan artikel ensiklopedia.

Naskah adalah CERITA PENDEK BERBASIS FAKTA.

Prioritas keputusan:

1. AKURASI FAKTA
2. KELENGKAPAN KONTEKS PENTING
3. STORYTELLING
4. NATURALNESS
5. RITME
6. VISUALIZABILITY
7. DURASI
8. JUMLAH KATA

Jumlah kata BUKAN prioritas tertinggi.

130-160 kata adalah TARGET IDEAL untuk 45-60 detik,
BUKAN BATAS KERAS.

Jika fakta penting membutuhkan 170 kata,
jangan memangkas fakta penting hanya demi mencapai 160.

Jika cerita dapat disampaikan secara lengkap dalam 125 kata,
jangan menambahkan filler hanya demi mencapai 130.

============================================================
TAHAP 1 — FACT UNDERSTANDING
============================================================

Pelajari hasil riset Tavily.

Pisahkan:

A. Fakta yang sangat kuat dan dapat digunakan.
B. Fakta yang berguna tetapi perlu konteks.
C. Klaim yang meragukan.
D. Detail yang tidak perlu dimasukkan.

Jangan mengubah klaim menjadi lebih dramatis daripada
bukti yang tersedia.

Jangan mengisi celah informasi dengan imajinasi.

============================================================
TAHAP 2 — FACT PRIORITIZATION
============================================================

Pilih hanya fakta yang membantu cerita.

Setiap fakta yang masuk harus memenuhi setidaknya salah satu:

- menjelaskan apa yang terjadi
- menjelaskan bagaimana sesuatu bekerja
- menjelaskan mengapa sesuatu penting
- menciptakan eskalasi
- memberikan konsekuensi
- memberikan konteks historis penting
- menghasilkan payoff yang menarik

Fakta yang hanya menambah detail teknis tanpa manfaat
storytelling boleh dihilangkan.

============================================================
TAHAP 3 — STORY ARCHITECTURE
============================================================

Sebelum menulis kalimat final, bangun alur mental:

HOOK
↓
SETUP
↓
CORE FACT
↓
ACTION / CONSEQUENCE
↓
ESCALATION
↓
IMPORTANT CONTEXT
↓
PAYOFF / CLOSING

Tidak semua topik harus memiliki seluruh beat secara kaku.

Yang penting alurnya terasa seperti cerita yang bergerak,
bukan daftar fakta.

============================================================
TAHAP 4 — STORYTELLING
============================================================

Gunakan DNA gaya channel (jika ada) dan contoh naskah asli
sebagai POLA PERILAKU utama.

Jangan menyalin kalimat referensi.

Jangan memaksakan kata khas.

Jangan membuat naskah terdengar seperti AI sedang
"meniru gaya".

Hasil akhir harus terasa seperti cerita baru yang secara
alami memiliki karakter channel tersebut.

Gunakan variasi panjang kalimat.

Campurkan kalimat pendek yang memberi impact dengan
kalimat yang membawa informasi.

Gunakan transisi yang terasa alami.

Informasi teknis harus dijelaskan melalui bahasa yang
mudah dibayangkan.

Jika terdapat mekanisme rumit, prioritaskan analogi atau
deskripsi tindakan daripada definisi ensiklopedis.

============================================================
TAHAP 5 — HOOK
============================================================

Hook harus langsung membawa penonton masuk ke situasi.

Hindari pembuka generik seperti:

"Tahukah kamu..."
"Pernahkah kamu..."
"Bayangkan jika..."
"Ini adalah..."
"Pada zaman dahulu..."

KECUALI pola tersebut memang terbukti menjadi bagian
kuat dari DNA channel.

Jangan menggunakan pertanyaan retoris.

Hook harus memberi alasan untuk terus mendengarkan
melalui situasi, fakta aneh, konflik, atau konsekuensi.

============================================================
TAHAP 6 — BAHASA
============================================================

Gunakan Bahasa Indonesia natural untuk voiceover.

Jangan menggunakan gaya "lu/gua".

Minimalkan kata "kamu".

Lebih baik gunakan konstruksi netral seperti:

"orang zaman itu..."
"warga..."
"para pedagang..."
"seorang prajurit..."
"siapa pun yang..."
"pejalan kaki..."
"masyarakat..."

Jangan memaksakan kata "kamu" hanya karena ingin terdengar
akrab.

Hindari bahasa terlalu formal jika DNA channel bersifat
santai.

Hindari bahasa terlalu slang jika tidak sesuai DNA.

============================================================
TAHAP 7 — ANTI-AI WRITING
============================================================

Hindari filler dan frasa dramatis generik seperti:

"misteri abadi"
"hingga saat ini"
"teknologi luar biasa"
"salah satu penemuan paling menakjubkan"
"mengubah dunia selamanya"
"rahasia yang tak terpecahkan"
"luar biasa mengerikan"
"paling mengerikan di dunia"
"teknologi canggih pada zamannya"

Kecuali frasa tersebut benar-benar diperlukan,
didukung fakta, dan sesuai DNA channel.

Jangan menggunakan kata sifat hanya untuk membuat
cerita terdengar dramatis.

Drama harus muncul dari FAKTA dan URUTAN CERITA.

============================================================
TAHAP 8 — TRANSITION QUALITY
============================================================

Setiap kalimat harus memiliki hubungan dengan kalimat
sebelumnya.

Hindari pola:

Fakta A.
Fakta B.
Fakta C.
Fakta D.

Gunakan hubungan seperti:

situasi → tindakan
tindakan → akibat
akibat → eskalasi
eskalasi → konteks
konteks → payoff

Kalimat berikutnya harus terasa sebagai perkembangan
alami dari cerita.

============================================================
TAHAP 9 — VISUALIZABILITY
============================================================

Setiap beat penting harus mudah divisualisasikan.

Utamakan:

- tindakan
- benda
- lingkungan
- interaksi
- perubahan kondisi
- konsekuensi yang terlihat

Daripada penjelasan abstrak.

============================================================
TAHAP 10 — FINAL FACTUAL QC
============================================================

Sebelum output:

Periksa kembali:

- tahun
- abad
- nama tokoh
- lokasi
- urutan kejadian
- fungsi benda
- hubungan sebab-akibat
- klaim absolut
- klaim "pertama"
- klaim "terbesar"
- klaim "satu-satunya"
- klaim "tidak pernah"
- klaim "hingga sekarang"

Jika sebuah klaim tidak cukup kuat,
ubah menjadi formulasi yang lebih akurat.

Jangan mengarang.

============================================================
TAHAP 11 — FINAL STYLE QC
============================================================

Pastikan:

- tidak terdengar seperti Wikipedia
- tidak terdengar seperti artikel berita
- tidak terdengar seperti esai sekolah
- tidak terasa seperti daftar fakta
- tidak penuh filler
- tidak terlalu banyak kata sifat
- tidak menggunakan pertanyaan retoris
- tidak menggunakan "lu/gua"
- minim penggunaan "kamu"
- tetap terasa seperti voiceover manusia
- ritmenya enak dibaca keras
- setiap beat punya fungsi
- TERASA SEPERTI EPISODE BARU DARI CHANNEL "${channelName}"

============================================================
OUTPUT
============================================================

Output HARUS JSON valid.

{
  "judul": "...",
  "isiNaskah": "...",
  "hook": "...",
  "ending": "...",
  "wordCount": 0,
  "estimasiDurasi": "...",
  "factQuality": "high|medium|low"
}

Jangan memasukkan:
[Visual:]
[Scene:]
[Music:]
[Camera:]
atau instruksi produksi lainnya.

isiNaskah hanya berisi voiceover.
`
      : `
Kamu adalah Scriptwriter YouTube Shorts profesional
untuk konten curious history dan fakta unik.

Topik:
"${escapedJudul}"

Tone:
"${tone}"

Target:
"${targetPanjang}"

============================================================
PRINSIP
============================================================

Buat cerita pendek berbasis fakta, bukan artikel ensiklopedia.

Prioritas:

1. Akurasi
2. Konteks penting
3. Storytelling
4. Naturalness
5. Ritme
6. Visualizability
7. Durasi
8. Word count

130-160 kata adalah TARGET IDEAL, bukan batas keras.

Jangan memangkas fakta penting hanya untuk mencapai jumlah
kata tertentu.

============================================================
ALUR KERJA
============================================================

FACT UNDERSTANDING
→ FACT PRIORITIZATION
→ STORY ARCHITECTURE
→ STORYTELLING
→ FACTUAL QC
→ STYLE QC

============================================================
FACT UNDERSTANDING
============================================================

Gunakan Tavily sebagai sumber riset.

Jangan menyalin hasil Tavily.

Pilih fakta yang paling penting untuk cerita.

Jangan mengarang fakta yang tidak tersedia.

============================================================
STORY ARCHITECTURE
============================================================

Bangun alur natural:

HOOK
→ SETUP
→ CORE FACT
→ ACTION / CONSEQUENCE
→ ESCALATION
→ CONTEXT
→ PAYOFF

Tidak harus mengikuti semua beat jika topiknya tidak
membutuhkan.

============================================================
GAYA
============================================================

Bahasa Indonesia natural untuk voiceover.

Jangan menggunakan gaya "lu/gua".

Minimalkan "kamu".

Jangan menggunakan pertanyaan retoris.

Hindari bahasa ensiklopedis.

Gunakan variasi panjang kalimat.

Gunakan fakta untuk menciptakan drama, bukan kata sifat
berlebihan.

============================================================
ANTI-AI
============================================================

Hindari filler seperti:

"misteri abadi"
"hingga saat ini"
"teknologi luar biasa"
"mengubah dunia selamanya"
"rahasia yang tak terpecahkan"

kecuali benar-benar diperlukan oleh fakta.

============================================================
FINAL QC
============================================================

Periksa:

tahun,
tokoh,
lokasi,
urutan kejadian,
fungsi benda,
sebab-akibat,
dan klaim absolut.

Jika fakta meragukan, jangan mengarang.

============================================================
OUTPUT JSON
============================================================

{
  "judul": "...",
  "isiNaskah": "...",
  "hook": "...",
  "ending": "...",
  "wordCount": 0,
  "estimasiDurasi": "...",
  "factQuality": "high|medium|low"
}

isiNaskah hanya voiceover.
`;

    /**
     * ========================================================
     * USER PROMPT
     * ========================================================
     */
    const userPrompt = `
${referenceContextText}

${tavilyContext}

${
  catatanTopik
    ? `
=== CATATAN TOPIK ===
${catatanTopik}
`
    : ""
}

============================================================
TUGAS
============================================================

Buat naskah YouTube Shorts baru berdasarkan topik:

"${escapedJudul}"

Jangan menulis ulang hasil riset Tavily secara langsung.

Pertama pahami fakta dan tentukan fakta mana yang paling
penting untuk cerita.

Kemudian susun alur cerita yang memiliki perkembangan
natural.

Setelah itu tulis voiceover final dengan karakter storytelling
yang sesuai DNA channel.

Jangan memangkas informasi penting hanya demi memenuhi
130-160 kata.

Jangan menambahkan informasi hanya demi memperpanjang naskah.

Output HARUS berupa JSON valid sesuai format yang diberikan
system prompt.
`;

    /**
     * ========================================================
     * DEBUG
     * ========================================================
     */
    if (
      isProfileMode &&
      styleDnaMissing
    ) {
      console.warn(
        `[Naskah] Profil "${channelName}" belum memiliki DNA Gaya yang up-to-date.`
      );
    }

    /**
     * ========================================================
     * CALL GEMINI
     * ========================================================
     */
    const temperature = isProfileMode
      ? REFERENCE_TEMPERATURE
      : GENERIC_TEMPERATURE;

    const rawResponse =
      await callGeminiApi(
        supabase,
        userPrompt,
        systemPrompt,
        temperature
      );

    /**
     * ========================================================
     * PARSE JSON
     * ========================================================
     */
    const parsedData: any =
      parseJsonResponse(
        rawResponse,
        {
          judul: cleanJudul,
          isiNaskah:
            rawResponse,
          hook: "",
          ending: "",
          wordCount: 0,
          estimasiDurasi: "",
          factQuality: "medium",
        }
      );

    const scriptText = String(
      parsedData?.isiNaskah ||
        rawResponse ||
        ""
    ).trim();

    /**
     * ========================================================
     * VALIDASI HASIL
     * ========================================================
     */
    if (!scriptText) {
      return NextResponse.json(
        {
          error:
            "Gagal menghasilkan teks naskah dari AI",
        },
        {
          status: 500,
        }
      );
    }

    /**
     * ========================================================
     * SAVE TO SUPABASE
     * ========================================================
     */
    const {
      data: newNaskah,
      error: insertErr,
    } = await supabase
      .from("naskah")
      .insert({
        user_id: user.id,
        judul: cleanJudul,
        isi_naskah: scriptText,
        sumber_topik_id:
          topikId || null,
        status: "draft",
      })
      .select()
      .single();

    if (insertErr) {
      console.error(
        "[Naskah DB Insert Error]:",
        insertErr
      );
    }

    /**
     * ========================================================
     * RESPONSE
     * ========================================================
     */
    return NextResponse.json({
      data:
        newNaskah || {
          id:
            "temp-" +
            Date.now(),

          judul:
            cleanJudul,

          isi_naskah:
            scriptText,

          sumber_topik_id:
            topikId || null,

          status:
            "draft",

          created_at:
            new Date().toISOString(),
        },

      parsed:
        parsedData,

      styleDnaMissing:
        isProfileMode && styleDnaMissing,

      dnaAutoAnalyzed,

      channelName:
        isProfileMode
          ? channelName
          : null,

      research:
        {
          provider:
            "Tavily",

          available:
            Boolean(tavilyRes),

          usedFor:
            "factual research and verification",
        },
    });
  } catch (err: any) {
    console.error(
      "[Naskah API Error]:",
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          "Gagal membuat naskah",
      },
      {
        status: 500,
      }
    );
  }
}
