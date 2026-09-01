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
 * GOOGLE GEMINI REQUEST
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

          // Sedikit lebih rendah supaya fakta tidak terlalu
          // banyak diimprovisasi oleh model.
          temperature: 0.55,
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
 * GEMINI API
 * ============================================================
 */
async function callGeminiApi(
  supabase: any,
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  return await callGeminiWithRotation(
    supabase,
    async (apiKey) => {
      return await requestGoogleGemini(
        apiKey,
        userPrompt,
        systemPrompt
      );
    }
  );
}

/**
 * ============================================================
 * TAVILY REAL-TIME RESEARCH
 * ============================================================
 *
 * Tavily tetap menjadi sumber riset eksternal utama.
 *
 * Timeout dibuat supaya route tidak menggantung terlalu lama.
 */
async function fetchTavilyFast(
  query: string,
  timeoutMs = 5500
): Promise<string> {
  if (!query || !query.trim()) {
    return "";
  }

  try {
    const tavilyPromise = fetchTavilySearchResults(query);

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error("Tavily timeout")),
        timeoutMs
      )
    );

    return await Promise.race([
      tavilyPromise,
      timeoutPromise,
    ]);
  } catch (e) {
    console.warn(
      "[Naskah] Tavily search fallback:",
      e
    );

    return "";
  }
}

/**
 * ============================================================
 * WORD COUNT
 * ============================================================
 */
function countWords(text: string): number {
  if (!text || !text.trim()) {
    return 0;
  }

  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

/**
 * ============================================================
 * POST
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
        { error: "Belum login" },
        { status: 401 }
      );
    }

    const {
      topikId = null,
      judulTopik = "",
      catatanTopik = "",
      tone = "Natural & Antusias",
      targetPanjang = "45-60 detik",
      referenceProfileId = null,
    } = await req.json();

    /**
     * ========================================================
     * VALIDASI TOPIK
     * ========================================================
     */
    if (
      !judulTopik ||
      !judulTopik.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Judul topik wajib diisi",
        },
        { status: 400 }
      );
    }

    const cleanJudul =
      judulTopik.trim();

    const escapedJudul =
      cleanJudul.replace(/"/g, "'");

    /**
     * ========================================================
     * RESOLVE REFERENCE PROFILE
     * ========================================================
     */
    let targetProfileId =
      referenceProfileId;

    // Safety fallback:
    // Jika UI belum mengirim referenceProfileId,
    // coba ambil dari data topik lama.
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
            /\[(.*?)\]/g
          )
        )
          .map((m: any) =>
            m[1]
              ? String(m[1]).trim()
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
     * LOAD PROFILE + REAL-TIME RESEARCH
     * ========================================================
     *
     * Tavily WAJIB dijalankan untuk memperoleh bahan fakta
     * terbaru/eksternal sebelum Gemini menulis naskah.
     */
    const tavilyQuery =
      `historical facts origin chronology ` +
      `"${cleanJudul}" ` +
      `history primary sources dates people invention`;

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
        5500
      ),
    ]);

    /**
     * ========================================================
     * REFERENCE / STYLE DNA
     * ========================================================
     */
    let isProfileMode = false;

    let channelName =
      "Framework Murni";

    let referenceContextText =
      "";

    let styleDnaMissing =
      false;

    if (
      profileRes.data &&
      profileRes.data
        .channel_analysis_entries
        ?.length > 0
    ) {
      isProfileMode = true;

      channelName =
        profileRes.data
          .profile_name ||
        "Referensi";

      const entries =
        profileRes.data
          .channel_analysis_entries;

      const styleDna =
        profileRes.data.style_dna;

      const dnaEntryCount =
        profileRes.data
          .style_dna_entry_count ||
        0;

      /**
       * Gunakan DNA gaya jika masih sinkron
       * dengan jumlah reference entry.
       */
      if (
        styleDna &&
        dnaEntryCount ===
          entries.length
      ) {
        const dnaBlock = `
=== DNA GAYA CHANNEL "${channelName}" ===

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

8. HAL YANG HARUS DIHINDARI:
${
  (styleDna.halYangDihindari || [])
    .join("; ") || "-"
}

9. RINGKASAN KARAKTER:
${styleDna.ringkasanKarakter || "-"}
`;

        referenceContextText =
          `\n\n${dnaBlock}`;
      } else {
        /**
         * DNA belum tersedia / sudah tidak sinkron.
         *
         * Tetap fallback ke reference script,
         * tetapi AI diberi instruksi JELAS bahwa
         * reference hanya untuk gaya, bukan sumber fakta.
         */
        styleDnaMissing = true;

        const samples =
          entries
            .map(
              (
                e: any,
                idx: number
              ) => {
                const entryTitle =
                  e.title ||
                  e.video_title ||
                  e.judul ||
                  `Video Asli ${
                    idx + 1
                  }`;

                const fullScript =
                  e.full_script ||
                  e.script ||
                  e.naskah ||
                  e.transcript ||
                  e.content ||
                  "";

                return `
--- CONTOH NASKAH REFERENSI ${
                  idx + 1
                } ---

Judul:
"${entryTitle}"

Naskah:
${fullScript}
`;
              }
            )
            .join(
              "\n\n====================\n\n"
            );

        referenceContextText = `
=== REFERENSI GAYA CHANNEL "${channelName}" ===

PERINGATAN:
Naskah di bawah HANYA digunakan untuk mempelajari
gaya, ritme, struktur, dan karakter penulisan.

JANGAN mengambil fakta, angka, nama, tanggal,
klaim sejarah, atau detail cerita dari naskah referensi.

Semua fakta untuk topik baru harus berasal dari
hasil riset dan pengetahuan yang dapat diverifikasi.

${samples}
`;
      }
    }

    /**
     * ========================================================
     * TAVILY CONTEXT
     * ========================================================
     */
    const tavilyContext =
      tavilyRes
        ? `
=== HASIL RISET WEB REAL-TIME TAVILY ===

Gunakan hasil berikut sebagai bahan riset fakta
untuk topik "${cleanJudul}".

${tavilyRes}

=== AKHIR HASIL RISET TAVILY ===
`
        : `
=== RISET TAVILY TIDAK TERSEDIA ===

Tavily tidak memberikan hasil dalam batas waktu.
Jangan mengarang fakta untuk menggantikan hasil riset.

Gunakan hanya fakta yang benar-benar diketahui
dengan tingkat keyakinan tinggi dan hindari detail
spesifik yang tidak dapat dipastikan.
`;

    /**
     * ========================================================
     * SYSTEM PROMPT
     * ========================================================
     *
     * PRIORITAS:
     *
     * 1. Akurasi fakta
     * 2. Kelengkapan informasi penting
     * 3. Koherensi cerita
     * 4. Storytelling
     * 5. Gaya channel
     * 6. Durasi ideal
     *
     * Jumlah kata BUKAN hard limit.
     */
    const baseSystemRules = `
Kamu adalah penulis naskah YouTube Shorts
profesional untuk konten sejarah dan fakta unik.

TOPIK:
"${escapedJudul}"

PRINSIP UTAMA:

AKURASI FAKTA LEBIH PENTING DARIPADA JUMLAH KATA.

Jangan memangkas fakta penting hanya untuk memenuhi
target jumlah kata.

Jangan menambahkan detail hanya agar cerita terasa
lebih dramatis.

Jangan mengubah dugaan, legenda, klaim populer,
atau ketidakpastian sejarah menjadi fakta pasti.

Jika sebuah detail tidak didukung oleh hasil riset
atau tidak memiliki dasar yang cukup kuat, JANGAN
menyajikannya sebagai fakta.

Jika sumber sejarah memiliki perbedaan pendapat,
gunakan formulasi yang mencerminkan ketidakpastian
tersebut.

Jangan mengarang:
- tanggal
- nama tokoh
- lokasi
- mekanisme
- angka
- bahan
- kutipan
- asal-usul istilah
- klaim sebab-akibat
- klaim bahwa sesuatu "pasti" terjadi

Hasil Tavily adalah bahan riset utama.
Reference channel hanya digunakan untuk STYLE,
bukan sebagai sumber fakta.

==================================================
TARGET DURASI
==================================================

Target ideal:
45-60 detik.

Kisaran 130-160 kata adalah TARGET IDEAL,
BUKAN BATAS.

Jika fakta penting membutuhkan lebih dari 160 kata,
BIARKAN lebih panjang.

Jika cerita secara alami selesai sebelum 130 kata
tanpa kehilangan informasi penting, JANGAN menambah
kalimat filler hanya untuk mengejar jumlah kata.

JANGAN:
- memangkas fakta penting
- menghapus konteks yang dibutuhkan
- menghilangkan tahun penting
- menghilangkan tokoh penting
- menghilangkan mekanisme penting
- menyederhanakan fakta sampai menjadi menyesatkan

Utamakan:
AKURASI > KELENGKAPAN > KELANCARAN > DURASI.

==================================================
STRUKTUR STORYTELLING
==================================================

Naskah harus terasa seperti satu cerita yang
mengalir, bukan kumpulan fakta.

Gunakan struktur sesuai kebutuhan topik:

HOOK
→ KONTEKS
→ FAKTA UTAMA
→ MEKANISME / PENJELASAN
→ KONSEKUENSI
→ DETAIL MENARIK
→ PENUTUP

Tidak semua bagian harus selalu ada jika tidak
relevan dengan fakta.

Jangan memaksakan struktur jika menyebabkan
informasi penting hilang.

==================================================
GAYA BAHASA
==================================================

Gunakan Bahasa Indonesia yang:
- natural
- luwes
- mudah dinarasikan
- memiliki ritme
- tidak terasa seperti artikel Wikipedia
- tetap informatif
- tidak terlalu formal

Boleh menggunakan humor ringan jika sesuai
dengan karakter channel.

Humor TIDAK BOLEH mengubah fakta sejarah.

Hindari filler.

Hindari kalimat yang hanya ada untuk menambah
jumlah kata.

==================================================
ATURAN PENTING UNTUK SHORTS
==================================================

Narasi harus berupa voiceover murni.

DILARANG menulis:
[Visual]
[Scene]
[Music]
[SFX]
[Camera]
atau instruksi produksi lainnya.

Jangan menggunakan pertanyaan retoris sebagai hook
atau sebagai bagian dari storytelling.

Jangan membuat kalimat pertanyaan hanya untuk
menciptakan engagement.

==================================================
FINAL FACT CHECK INTERNAL
==================================================

Sebelum menghasilkan JSON, lakukan pemeriksaan
internal:

1. Apakah semua tanggal masuk akal?
2. Apakah nama tokoh benar?
3. Apakah urutan sejarah benar?
4. Apakah klaim sebab-akibat benar?
5. Apakah mekanisme yang dijelaskan benar?
6. Apakah ada detail yang sebenarnya hanya legenda?
7. Apakah ada angka yang tidak didukung?
8. Apakah ada fakta yang dibuat lebih dramatis
   daripada bukti sejarahnya?
9. Apakah ada fakta penting yang dipangkas hanya
   karena target jumlah kata?
10. Apakah seluruh naskah tetap sesuai topik?

Jika menemukan konflik antara storytelling dan fakta,
FAKTA HARUS MENANG.

==================================================
OUTPUT
==================================================

Output HARUS JSON valid.

Format:

{
  "judul": "...",
  "isiNaskah": "...",
  "hook": "...",
  "ending": "...",
  "wordCount": 0,
  "estimasiDurasi": "...",
  "factConfidence": "high|medium|low"
}

wordCount harus dihitung dari isiNaskah.

estimasiDurasi harus diperkirakan berdasarkan jumlah
kata aktual, BUKAN dipaksa menjadi 45-60 detik.

factConfidence:
- high = fakta utama memiliki dasar kuat
- medium = terdapat beberapa detail yang memiliki
  ketidakpastian / keterbatasan sumber
- low = bukti sejarah terbatas atau banyak klaim
  yang tidak dapat dipastikan
`;

    /**
     * ========================================================
     * PROFILE MODE
     * ========================================================
     */
    const systemPrompt =
      isProfileMode
        ? `
Kamu adalah Penulis Naskah dan Narator Persona
Resmi dari channel YouTube "${channelName}".

${baseSystemRules}

==================================================
DNA GAYA CHANNEL
==================================================

${referenceContextText}

Gunakan DNA tersebut sebagai acuan gaya.

Jangan menyalin isi cerita reference.
Jangan mengambil fakta dari reference.
Jangan meniru kalimat secara verbatim.

Yang ditiru hanya:
- struktur
- ritme
- gaya bahasa
- karakter narasi
- pola hook
- pola transisi
- pola ending
`
        : `
${baseSystemRules}

Tidak ada reference channel aktif.

Gunakan gaya:
"${tone}"
`;

    /**
     * ========================================================
     * USER PROMPT
     * ========================================================
     */
    const userPrompt = `
${tavilyContext}

${
  referenceContextText
    ? referenceContextText
    : ""
}

${
  catatanTopik
    ? `
=== CATATAN TOPIK ===
${catatanTopik}
=== AKHIR CATATAN TOPIK ===
`
    : ""
}

==================================================
TUGAS
==================================================

Tulis naskah YouTube Shorts baru untuk:

"${escapedJudul}"

Gunakan hasil Tavily sebagai bahan riset fakta.

Jangan mengarang fakta yang tidak ada.

Jangan memangkas informasi penting hanya untuk
mencapai 130-160 kata.

130-160 kata adalah target ideal saja.

Jika cerita membutuhkan 170, 180, atau lebih kata
untuk menyampaikan fakta penting secara utuh,
gunakan jumlah kata tersebut.

Sebaliknya, jangan menambahkan filler hanya untuk
mencapai 130 kata.

Pastikan setiap bagian cerita mempunyai fungsi.

Naskah harus terasa natural saat dibacakan sebagai
voiceover.

Tidak boleh ada kalimat pertanyaan retoris.

Setelah menulis naskah, lakukan fact-check internal
terhadap fakta yang digunakan.

Output HANYA JSON valid sesuai format yang diminta.
`;

    /**
     * ========================================================
     * GENERATE
     * ========================================================
     */
    const rawResponse =
      await callGeminiApi(
        supabase,
        userPrompt,
        systemPrompt
      );

    /**
     * ========================================================
     * PARSE
     * ========================================================
     */
    const parsedData: any =
      parseJsonResponse(
        rawResponse,
        {
          judul: cleanJudul,
          isiNaskah: rawResponse,
        }
      );

    const scriptText =
      (
        parsedData.isiNaskah ||
        rawResponse ||
        ""
      ).trim();

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
     * WORD COUNT SERVER-SIDE
     * ========================================================
     *
     * Jangan percaya wordCount dari AI.
     * Hitung ulang dari teks aktual.
     */
    const actualWordCount =
      countWords(scriptText);

    /**
     * Estimasi kasar voiceover.
     *
     * 150 kata ≈ 55 detik
     * sehingga ±2.7 kata/detik.
     */
    const estimatedSeconds =
      Math.round(
        actualWordCount / 2.7
      );

    const estimatedDuration =
      `${estimatedSeconds} detik`;

    /**
     * ========================================================
     * SIMPAN DATABASE
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

          judul: cleanJudul,

          isi_naskah:
            scriptText,

          sumber_topik_id:
            topikId || null,

          status: "draft",

          created_at:
            new Date().toISOString(),
        },

      parsed: {
        ...parsedData,

        // Selalu gunakan hasil hitungan server,
        // bukan angka dari AI.
        wordCount:
          actualWordCount,

        estimasiDurasi:
          estimatedDuration,
      },

      styleDnaMissing:
        isProfileMode &&
        styleDnaMissing,

      channelName:
        isProfileMode
          ? channelName
          : null,

      research:
        {
          tavilyUsed:
            Boolean(tavilyRes),

          source:
            tavilyRes
              ? "Tavily Real-Time Web Research"
              : "Gemini Knowledge Fallback",

          factPriority:
            "accuracy_over_word_count",
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
      { status: 500 }
    );
  }
}
