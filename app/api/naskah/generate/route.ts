import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { fetchTavilySearchResults } from "@/lib/tavily";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAIN_MODEL = "gemini-3.6-flash";

/**
 * ============================================================
 * GEMINI REQUEST
 * ============================================================
 */

async function requestGoogleGemini(
  apiKey: string,
  userPrompt: string,
  systemPrompt: string
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
          temperature: 0.7,
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

  let json: any;

  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error("Respons Gemini bukan JSON valid.");
  }

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

/**
 * ============================================================
 * TAVILY
 * ============================================================
 *
 * Tavily tetap menjadi sumber riset real-time.
 *
 * Gemini TIDAK menganggap hasil Tavily sebagai naskah.
 * Hasil Tavily hanya menjadi bahan riset untuk dianalisis.
 */

async function fetchTavilyFast(
  query: string,
  timeoutMs = 4500
): Promise<string> {
  if (!query || !query.trim()) return "";

  try {
    const tavilyPromise = fetchTavilySearchResults(query);

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Tavily timeout")), timeoutMs)
    );

    return await Promise.race([tavilyPromise, timeoutPromise]);
  } catch (e) {
    console.warn("[Naskah] Tavily search fallback:", e);
    return "";
  }
}

/**
 * ============================================================
 * UTILITIES
 * ============================================================
 */

function countWords(text: string): number {
  if (!text || !text.trim()) return 0;

  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function extractTargetWordRange(
  targetPanjang: string
): { min: number; max: number } {
  const match = targetPanjang.match(/(\d+)\s*-\s*(\d+)\s*kata/i);

  if (match) {
    return {
      min: Number(match[1]),
      max: Number(match[2]),
    };
  }

  // Default produksi Shorts
  return {
    min: 130,
    max: 160,
  };
}

/**
 * ============================================================
 * POST
 * ============================================================
 */

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Belum login" },
        { status: 401 }
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

    if (!judulTopik || !judulTopik.trim()) {
      return NextResponse.json(
        { error: "Judul topik wajib diisi" },
        { status: 400 }
      );
    }

    const cleanJudul = judulTopik.trim();

    const escapedJudul = cleanJudul.replace(/"/g, "'");

    const {
      min: minWords,
      max: maxWords,
    } = extractTargetWordRange(targetPanjang);

    /**
     * ========================================================
     * 1. RESOLVE REFERENCE PROFILE
     * ========================================================
     */

    let targetProfileId = referenceProfileId;

    // Safety fallback untuk topik lama.
    if (!targetProfileId && topikId) {
      const { data: topikRow } = await supabase
        .from("topik")
        .select("catatan")
        .eq("id", topikId)
        .single();

      if (topikRow?.catatan) {
        const matches = Array.from(
          topikRow.catatan.matchAll(/\[(.*?)\]/g)
        )
          .map((m: any) =>
            m[1] ? String(m[1]).trim() : ""
          )
          .filter(Boolean);

        if (matches.length > 0) {
          const candidateName =
            matches.length >= 2 ? matches[1] : matches[0];

          const { data: foundProfile } = await supabase
            .from("channel_analysis")
            .select("id")
            .eq("user_id", user.id)
            .ilike("profile_name", candidateName)
            .maybeSingle();

          if (foundProfile) {
            targetProfileId = foundProfile.id;
          }
        }
      }
    }

    /**
     * ========================================================
     * 2. RESEARCH QUERY
     * ========================================================
     *
     * Jangan hanya meminta "fakta sejarah".
     *
     * Kita meminta:
     * - asal-usul
     * - kronologi
     * - konteks
     * - bukti
     * - istilah
     * - perubahan
     *
     * Tavily tetap menjadi sumber real-time.
     */

    const tavilyQuery = [
      `"${cleanJudul}"`,
      "history",
      "origin",
      "historical facts",
      "timeline",
      "primary source",
      "reliable source",
    ].join(" ");

    /**
     * ========================================================
     * 3. FETCH PROFILE + TAVILY SECARA PARALEL
     * ========================================================
     */

    const [profileRes, tavilyRes] = await Promise.all([
      targetProfileId
        ? supabase
            .from("channel_analysis")
            .select("*, channel_analysis_entries(*)")
            .eq("id", targetProfileId)
            .single()
        : Promise.resolve({
            data: null,
            error: null,
          }),

      fetchTavilyFast(tavilyQuery, 4500),
    ]);

    /**
     * ========================================================
     * 4. BUILD STYLE DNA
     * ========================================================
     */

    let isProfileMode = false;
    let channelName = "Framework Murni";
    let referenceContextText = "";
    let styleDnaMissing = false;

    if (
      profileRes.data &&
      profileRes.data.channel_analysis_entries?.length > 0
    ) {
      isProfileMode = true;

      channelName =
        profileRes.data.profile_name || "Referensi";

      const entries =
        profileRes.data.channel_analysis_entries;

      const styleDna = profileRes.data.style_dna;

      const dnaEntryCount =
        profileRes.data.style_dna_entry_count || 0;

      if (
        styleDna &&
        dnaEntryCount === entries.length
      ) {
        const dnaBlock = `
=== DNA GAYA CHANNEL "${channelName}" ===

DNA ini adalah hasil analisis pola penulisan dari ${entries.length} naskah referensi.

1. POLA HOOK PEMBUKA:
${styleDna.hookPattern || "-"}

2. STRUKTUR BEAT NASKAH:
${
  (styleDna.strukturBeat || [])
    .map(
      (s: string, i: number) =>
        `${i + 1}) ${s}`
    )
    .join(" -> ") || "-"
}

3. GAYA BAHASA:
${styleDna.gayaBahasa || "-"}

4. DIKSI / FRASA KHAS:
${(styleDna.diksiKhas || []).join(", ") || "-"}

5. TEKNIK TRANSISI:
${styleDna.teknikTransisi || "-"}

6. POLA PENUTUP:
${styleDna.closingPattern || "-"}

7. RITME & PANJANG KALIMAT:
${styleDna.panjangKalimatRataRata || "-"}

8. HAL YANG WAJIB DIHINDARI:
${
  (styleDna.halYangDihindari || [])
    .join("; ") || "-"
}

9. RINGKASAN KARAKTER PENULISAN:
${styleDna.ringkasanKarakter || "-"}
`;

        referenceContextText = `\n${dnaBlock}\n`;
      } else {
        /**
         * Fallback tetap dipertahankan.
         *
         * Namun sekarang naskah referensi diposisikan sebagai
         * bahan observasi gaya, BUKAN sumber isi cerita.
         */

        styleDnaMissing = true;

        const samples = entries
          .map((e: any, idx: number) => {
            const entryTitle =
              e.title ||
              e.video_title ||
              e.judul ||
              `Video Referensi ${idx + 1}`;

            const fullScript =
              e.full_script ||
              e.script ||
              e.naskah ||
              e.transcript ||
              e.content ||
              "";

            return `
--- NASKAH REFERENSI ${idx + 1} ---
Judul: "${entryTitle}"

Naskah:
${fullScript}
`;
          })
          .join("\n\n====================\n\n");

        referenceContextText = `
=== REFERENSI GAYA CHANNEL "${channelName}" ===

Gunakan materi berikut HANYA untuk memahami:
- ritme
- struktur
- cara membuka cerita
- cara melakukan transisi
- cara memberikan payoff
- karakter bahasa

JANGAN mengambil fakta, cerita, tokoh, atau kejadian dari naskah referensi
untuk dimasukkan ke topik baru.

${samples}
`;
      }
    }

    /**
     * ========================================================
     * 5. TAVILY RESEARCH CONTEXT
     * ========================================================
     */

    const tavilyContext = tavilyRes
      ? `
=== HASIL RISET WEB REAL-TIME TAVILY ===

Gunakan data ini sebagai BAHAN RISET, bukan sebagai naskah.

Tugas AI:
- identifikasi fakta
- identifikasi kronologi
- identifikasi fakta paling kuat
- buang informasi yang tidak relevan
- jangan mengarang fakta yang tidak terdapat dalam riset
- jika terdapat konflik informasi, jangan menyatukan dua versi secara sembarangan

HASIL TAVILY:
${tavilyRes}
`
      : `
=== RISET WEB ===

Tavily tidak memberikan hasil yang dapat digunakan.

Jangan mengarang fakta spesifik hanya untuk mengisi kekosongan.
Gunakan pengetahuan internal hanya untuk fakta yang benar-benar diketahui
dengan tingkat keyakinan tinggi.
`;

    /**
     * ========================================================
     * 6. SYSTEM PROMPT
     * ========================================================
     *
     * Ini bagian paling penting yang diubah.
     *
     * Gemini tidak langsung "menulis".
     *
     * Gemini harus menjalankan pipeline editorial internal:
     *
     * RESEARCH
     * -> FACT SELECTION
     * -> STORY ARCHITECTURE
     * -> SCRIPT
     * -> QC
     */

    const systemPrompt = `
Kamu adalah **Senior History Shorts Scriptwriter, Story Editor,
Fact Checker, dan Narrative Director** untuk channel "${channelName}".

Tugasmu bukan sekadar menghasilkan teks 130-160 kata.

Tugasmu adalah mengubah bahan riset sejarah menjadi cerita pendek
yang terasa natural, menarik, padat, akurat, dan memiliki alur.

============================================================
PRINSIP UTAMA
============================================================

Prioritasmu harus selalu:

1. Kebenaran fakta
2. Kualitas cerita
3. Kejelasan
4. Hook
5. Escalation
6. Payoff
7. Ritme
8. Efisiensi kata

JUMLAH KATA BUKAN TUJUAN UTAMA.

Batas ${minWords}-${maxWords} kata adalah BATAS PRODUKSI.

Jangan menambahkan kalimat filler hanya untuk mencapai jumlah kata.

============================================================
PIPELINE BERPIKIR WAJIB
============================================================

Sebelum menghasilkan output final, lakukan proses berikut
SECARA INTERNAL:

STEP 1 — UNDERSTAND THE TOPIC

Pahami:
- apa objek/peristiwa yang dibahas
- apa yang membuatnya menarik
- apa konflik atau keanehan utamanya
- apa perubahan historis terpenting

STEP 2 — FACT EXTRACTION

Dari hasil Tavily:
- identifikasi fakta utama
- identifikasi tanggal/periode
- identifikasi tempat
- identifikasi tokoh jika relevan
- identifikasi sebab-akibat
- identifikasi perubahan dari masa lalu ke masa berikutnya

Jangan memasukkan semua fakta.

STEP 3 — FACT PRIORITIZATION

Pilih hanya fakta yang benar-benar membantu cerita.

Prioritaskan fakta yang:
- mengejutkan
- konkret
- mudah dipahami
- relevan dengan premis
- membantu escalation
- menghasilkan payoff

Buang fakta yang hanya menambah informasi tetapi tidak memperkuat cerita.

STEP 4 — STORY ARCHITECTURE

Sebelum menulis, susun struktur:

HOOK
↓
SETUP
↓
ESCALATION
↓
PAYOFF
↓
CLOSING

HOOK:
Langsung masuk ke kejadian, fakta, atau gambaran yang menarik.

SETUP:
Berikan konteks secukupnya.

ESCALATION:
Informasi harus berkembang.
Jangan hanya menumpuk fakta.

PAYOFF:
Berikan fakta/konsekuensi yang paling kuat setelah buildup.

CLOSING:
Akhiri dengan kalimat yang terasa sebagai penyelesaian cerita.

Jangan menambahkan closing generik hanya karena naskah harus memiliki ending.

STEP 5 — WRITE

Setelah struktur cerita jelas, baru tulis naskah.

Naskah harus terasa seperti manusia sedang menceritakan sesuatu,
bukan seperti ensiklopedia yang dipotong menjadi Shorts.

============================================================
ATURAN NASKAH WAJIB
============================================================

1. Tidak boleh menggunakan kalimat berbentuk pertanyaan.

Termasuk:
- pertanyaan langsung
- pertanyaan retoris
- "Tahukah kamu..."
- "Pernahkah kamu..."
- "Bisa dibayangkan?"
- "Kenapa?"
- "Bagaimana?"

Jangan gunakan pertanyaan untuk membuat hook.

2. Jangan menggunakan filler AI.

Hindari pembukaan seperti:
- "Tahukah kamu..."
- "Pernahkah kamu membayangkan..."
- "Hal ini mungkin terdengar..."
- "Yang lebih mengejutkan..."
- "Ternyata..."
- "Pada zaman dahulu..."
jika tidak benar-benar diperlukan oleh gaya channel.

3. Jangan menulis seperti Wikipedia.

Hindari pola:
fakta A -> fakta B -> fakta C -> fakta D.

Setiap informasi harus memiliki hubungan dengan cerita.

4. Jangan memaksakan semua hasil Tavily masuk ke naskah.

Tavily adalah sumber riset.

Bukan checklist fakta.

5. Jangan mengarang detail.

Jangan menciptakan:
- tanggal
- nama
- tempat
- kutipan
- kebiasaan
- motif
- statistik
- asal-usul
yang tidak didukung oleh informasi yang tersedia.

6. Jangan mengulang fakta yang sama.

7. Jangan menjelaskan sesuatu dua kali dengan kata berbeda.

8. Jangan menggunakan bahasa terlalu akademis.

9. Jangan menggunakan bahasa terlalu hiperbolis jika faktanya tidak mendukung.

10. Humor boleh digunakan jika natural dan sesuai dengan fakta.

11. Gunakan bahasa yang mudah divisualisasikan.

12. Setiap kalimat harus mempunyai fungsi storytelling.

============================================================
VISUALIZABILITY RULE
============================================================

Naskah nantinya akan diproses oleh Visual Director.

Karena itu, prioritaskan informasi yang dapat diterjemahkan menjadi visual konkret:

- manusia
- benda
- tempat
- tindakan
- perubahan fisik
- situasi
- lingkungan
- kontras masa lalu dan sekarang

Namun JANGAN menulis instruksi visual seperti:

[Scene]
[Visual]
[Camera]
[Shot]

Naskah tetap merupakan voiceover murni.

============================================================
STYLE DNA
============================================================

Jika DNA Gaya tersedia, gunakan DNA tersebut sebagai referensi
gaya dan ritme.

Namun:

DNA Gaya TIDAK BOLEH mengalahkan:
- fakta
- storytelling
- naturalness
- clarity

Jangan melakukan imitasi mekanis.

Jangan menyalin struktur kalimat dari contoh secara literal.

Yang ditiru adalah POLA, bukan kalimat.

============================================================
ENDING
============================================================

Ending harus menyelesaikan cerita.

Pilih salah satu jika cocok:

- payoff
- historical consequence
- ironic contrast
- perubahan menuju kondisi modern
- punchline natural

Jangan memaksakan pertanyaan kepada penonton.

Jangan menggunakan closing generik seperti:
"Dan itulah sejarahnya."

============================================================
WORD COUNT
============================================================

Target:
${minWords}-${maxWords} kata.

Setelah menulis, hitung jumlah kata secara internal.

Jika terlalu panjang:
hapus informasi yang paling tidak penting.

JANGAN memotong kalimat secara brutal.

Jika terlalu pendek:
tambahkan konteks yang benar-benar memperkuat cerita.

JANGAN menambahkan filler.

============================================================
SELF-QC INTERNAL
============================================================

Sebelum memberikan output final, lakukan pemeriksaan internal:

FACT CHECK
- Apakah ada fakta yang tidak didukung?
- Apakah kronologi masuk akal?
- Apakah ada klaim yang terlalu absolut?

STORY CHECK
- Apakah hook menarik?
- Apakah cerita berkembang?
- Apakah ada escalation?
- Apakah payoff terasa earned?
- Apakah ending menyelesaikan cerita?

LANGUAGE CHECK
- Apakah terdengar natural?
- Apakah ada kalimat terlalu panjang?
- Apakah ada repetisi?
- Apakah ada filler?

QUESTION CHECK
- Pastikan TIDAK ADA kalimat pertanyaan.

WORD COUNT CHECK
- Pastikan berada pada ${minWords}-${maxWords} kata.

VISUAL CHECK
- Apakah cerita mudah diterjemahkan menjadi visual?
- Apakah setiap kalimat memiliki informasi yang berguna?

Jika gagal pada salah satu pemeriksaan, revisi secara internal
sebelum memberikan output.

============================================================
OUTPUT
============================================================

Kembalikan HANYA JSON valid:

{
  "judul": "${escapedJudul}",
  "isiNaskah": "Naskah voiceover final.",
  "hook": "Kalimat hook.",
  "ending": "Kalimat ending.",
  "wordCount": 145,
  "estimasiDurasi": "50 detik"
}

Jangan memasukkan:
- story architecture
- analisis
- reasoning
- catatan editor
- sumber
- komentar
di dalam isiNaskah.

Semua itu harus digunakan secara INTERNAL sebelum menghasilkan naskah.
`;

    /**
     * ========================================================
     * 7. USER PROMPT
     * ========================================================
     */

    const userPrompt = `
TOPIK UTAMA:
"${escapedJudul}"

TONE:
${tone}

TARGET DURASI:
${targetPanjang}

TARGET JUMLAH KATA:
${minWords}-${maxWords} kata

${referenceContextText}

${tavilyContext}

${
  catatanTopik
    ? `
=== CATATAN DARI TOPIK ===
${catatanTopik}
`
    : ""
}

============================================================
TUGAS
============================================================

Tulis naskah YouTube Shorts untuk topik:

"${escapedJudul}"

Jalankan seluruh pipeline editorial secara internal:

Research
→ Fact Selection
→ Story Architecture
→ Scriptwriting
→ Self-QC

Jangan menampilkan proses berpikir tersebut.

Output hanya JSON valid sesuai schema yang diberikan.
`;

    if (isProfileMode && styleDnaMissing) {
      console.warn(
        `[Naskah] Profil "${channelName}" belum memiliki DNA Gaya yang up-to-date.`
      );
    }

    /**
     * ========================================================
     * 8. GEMINI
     * ========================================================
     */

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

    /**
     * ========================================================
     * 9. PARSE JSON
     * ========================================================
     */

    const parsedData: any = parseJsonResponse(rawResponse, {
      judul: cleanJudul,
      isiNaskah: rawResponse,
      hook: "",
      ending: "",
      wordCount: 0,
      estimasiDurasi: "",
    });

    let scriptText = (
      parsedData.isiNaskah ||
      rawResponse ||
      ""
    ).trim();

    /**
     * ========================================================
     * 10. BASIC OUTPUT CLEANUP
     * ========================================================
     *
     * Jangan mengubah isi secara agresif.
     * Hanya membersihkan kemungkinan formatting yang salah.
     */

    scriptText = scriptText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    if (!scriptText) {
      return NextResponse.json(
        {
          error:
            "Gagal menghasilkan teks naskah dari AI",
        },
        { status: 500 }
      );
    }

    /**
     * ========================================================
     * 11. WORD COUNT VERIFICATION
     * ========================================================
     *
     * Kita tidak memaksa trimming otomatis karena trimming
     * bisa merusak storytelling.
     *
     * Jika AI sedikit meleset, kita tetap menyimpan hasilnya,
     * tetapi memberi metadata bahwa hasil perlu diperiksa.
     */

    const actualWordCount = countWords(scriptText);

    const wordCountWithinTarget =
      actualWordCount >= minWords &&
      actualWordCount <= maxWords;

    /**
     * ========================================================
     * 12. ESTIMATE DURATION
     * ========================================================
     *
     * Estimasi kasar berdasarkan ~2.8 kata/detik.
     */

    const estimatedSeconds = Math.round(
      actualWordCount / 2.8
    );

    const estimatedDuration =
      `${estimatedSeconds} detik`;

    /**
     * ========================================================
     * 13. SAVE TO SUPABASE
     * ========================================================
     */

    const { data: newNaskah, error: insertErr } =
      await supabase
        .from("naskah")
        .insert({
          user_id: user.id,
          judul: cleanJudul,
          isi_naskah: scriptText,
          sumber_topik_id: topikId || null,
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
     * 14. FINAL RESPONSE
     * ========================================================
     */

    return NextResponse.json({
      data:
        newNaskah || {
          id: "temp-" + Date.now(),
          judul: cleanJudul,
          isi_naskah: scriptText,
          sumber_topik_id: topikId || null,
          status: "draft",
          created_at:
            new Date().toISOString(),
        },

      parsed: {
        ...parsedData,

        // Gunakan hasil hitungan aplikasi sebagai
        // sumber kebenaran word count.
        wordCount: actualWordCount,

        estimasiDurasi:
          parsedData.estimasiDurasi ||
          estimatedDuration,
      },

      styleDnaMissing:
        isProfileMode && styleDnaMissing,

      channelName:
        isProfileMode ? channelName : null,

      research: {
        tavilyUsed: Boolean(tavilyRes),
      },

      quality: {
        wordCount: actualWordCount,
        targetMin: minWords,
        targetMax: maxWords,
        withinTarget:
          wordCountWithinTarget,
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
          err.message ||
          "Gagal membuat naskah",
      },
      { status: 500 }
    );
  }
}
