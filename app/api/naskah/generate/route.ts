import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { fetchTavilySearchResults } from "@/lib/tavily";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAIN_MODEL = "gemini-3.6-flash";

/* =========================================================
   TYPES
========================================================= */

type FactStatus =
  | "VERIFIED"
  | "PROBABLE"
  | "UNCERTAIN"
  | "DISPUTED"
  | "LEGEND"
  | "UNSUPPORTED"
  | "CONTRADICTED";

interface VerifiedFact {
  claim: string;
  status: FactStatus;
  confidence: number;
  evidence: string;
  usableInScript: boolean;
  qualification?: string;
}

interface FactVerificationResult {
  topic: string;
  coreFacts: VerifiedFact[];
  rejectedClaims: string[];
  disputedClaims: string[];
  unknowns: string[];
  historicalContext: string;
  safeNarrativeAngle: string;
}

/* =========================================================
   GOOGLE GEMINI REQUEST
========================================================= */

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
          temperature: 0.45,
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

/* =========================================================
   GEMINI WRAPPER
========================================================= */

async function callGeminiApi(
  supabase: any,
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  return await callGeminiWithRotation(supabase, async (apiKey) => {
    return await requestGoogleGemini(
      apiKey,
      userPrompt,
      systemPrompt
    );
  });
}

/* =========================================================
   TAVILY
   Tavily = EVIDENCE SEARCH, BUKAN SUMBER KEBENARAN MUTLAK
========================================================= */

async function fetchTavilyFast(
  query: string,
  timeoutMs = 4500
): Promise<string> {
  if (!query || !query.trim()) return "";

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
    console.warn("[Naskah] Tavily search fallback:", e);
    return "";
  }
}

/* =========================================================
   JSON SAFE PARSER
========================================================= */

function safeParseJson<T = any>(
  raw: string,
  fallback: T
): T {
  try {
    return parseJsonResponse(raw, fallback) as T;
  } catch {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}

/* =========================================================
   WORD COUNT
========================================================= */

function countWords(text: string): number {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

/* =========================================================
   CLEAN SCRIPT
========================================================= */

function cleanScriptText(text: string): string {
  return String(text || "")
    .replace(/\[Visual:.*?\]/gi, "")
    .replace(/\[Scene:.*?\]/gi, "")
    .replace(/\[Music:.*?\]/gi, "")
    .replace(/\[SFX:.*?\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* =========================================================
   FACT VERIFICATION ENGINE
========================================================= */

async function verifyResearchFacts(
  supabase: any,
  topic: string,
  tavilyContext: string,
  catatanTopik: string
): Promise<FactVerificationResult> {
  const verifierSystemPrompt = `
Kamu adalah HISTORICAL FACT VERIFICATION ENGINE untuk produksi YouTube Shorts.

TUGAS UTAMA:
Menganalisis hasil pencarian web yang diberikan dan menentukan fakta mana yang
benar-benar aman digunakan dalam naskah sejarah.

PRINSIP PALING PENTING:

1. HASIL TAVILY BUKAN FAKTA OTOMATIS.
   Tavily hanya menyediakan bahan pencarian/evidence.
   Jangan menganggap semua klaim di dalam hasil pencarian sebagai benar.

2. JANGAN MENGISI KEKOSONGAN DENGAN PENGETAHUAN YANG TIDAK DIDUKUNG.
   Jika bukti tidak cukup, tandai UNCERTAIN atau UNSUPPORTED.

3. JANGAN MENGUBAH LEGENDA MENJADI FAKTA.
   Jika sebuah cerita historis hanya berupa legenda, folklore, anecdote,
   popular claim, atau etimologi yang diperdebatkan, jangan menyatakannya
   sebagai fakta pasti.

4. JANGAN MENGADA-ADA:
   - angka
   - tanggal
   - nama tokoh
   - ukuran
   - berat
   - mekanisme
   - urutan kejadian
   - kutipan
   - efek medis
   - sebab-akibat
   - detail dramatis

5. BEDAKAN:
   VERIFIED
   PROBABLE
   UNCERTAIN
   DISPUTED
   LEGEND
   UNSUPPORTED
   CONTRADICTED

6. VERIFIED hanya boleh diberikan jika evidence yang tersedia cukup kuat
   untuk mendukung klaim tersebut.

7. PROBABLE bukan berarti VERIFIED.
   Klaim PROBABLE hanya boleh digunakan dalam naskah jika diberi
   kualifikasi yang sesuai.

8. Jika dua sumber bertentangan, jangan memilih salah satunya secara
   sembarangan. Tandai DISPUTED dan jelaskan konflik tersebut.

9. Jika sebuah detail menarik tetapi tidak memiliki dukungan yang cukup,
   LEBIH BAIK DIBUANG daripada diisi dengan tebakan.

10. Tujuan akhir bukan membuat cerita terdengar spektakuler.
    Tujuan akhir adalah membuat cerita menarik TANPA MELAMPAUI BUKTI.

OUTPUT HARUS JSON VALID SAJA.

FORMAT:

{
  "topic": "...",
  "coreFacts": [
    {
      "claim": "...",
      "status": "VERIFIED",
      "confidence": 0.95,
      "evidence": "...",
      "usableInScript": true,
      "qualification": ""
    }
  ],
  "rejectedClaims": [],
  "disputedClaims": [],
  "unknowns": [],
  "historicalContext": "...",
  "safeNarrativeAngle": "..."
}

CONFIDENCE:
0.90-1.00 = bukti sangat kuat
0.75-0.89 = cukup kuat tetapi tetap hati-hati
0.50-0.74 = kemungkinan benar / evidence terbatas
<0.50 = tidak aman sebagai fakta

ATURAN USABLE:
- VERIFIED dengan confidence >= 0.85 → true
- VERIFIED < 0.85 → false
- PROBABLE → false kecuali qualification sangat jelas
- UNCERTAIN → false
- DISPUTED → false
- LEGEND → false
- UNSUPPORTED → false
- CONTRADICTED → false
`;

  const verifierUserPrompt = `
TOPIK:
${topic}

CATATAN TOPIK:
${catatanTopik || "-"}

HASIL RISET TAVILY:
${tavilyContext || "Tidak ada hasil riset yang tersedia."}

ANALISIS BAHAN RISET DI ATAS.

PENTING:
Jangan menambahkan fakta dari ingatan hanya untuk membuat daftar fakta
terlihat lengkap.

Setiap claim yang dinyatakan VERIFIED harus memiliki dukungan yang terlihat
dari bahan riset.

Jika tidak ada bukti yang cukup, masukkan ke unknowns atau rejectedClaims.

Output JSON valid saja.
`;

  const rawVerification = await callGeminiApi(
    supabase,
    verifierUserPrompt,
    verifierSystemPrompt
  );

  const fallback: FactVerificationResult = {
    topic,
    coreFacts: [],
    rejectedClaims: [],
    disputedClaims: [],
    unknowns: [
      "Verifikasi fakta gagal menghasilkan data terstruktur."
    ],
    historicalContext: "",
    safeNarrativeAngle:
      "Jangan membuat klaim historis spesifik tanpa bukti.",
  };

  const parsed = safeParseJson<FactVerificationResult>(
    rawVerification,
    fallback
  );

  if (!parsed.coreFacts) {
    parsed.coreFacts = [];
  }

  return parsed;
}

/* =========================================================
   BUILD APPROVED FACT BLOCK
========================================================= */

function buildApprovedFactBlock(
  verification: FactVerificationResult
): string {
  const approved = (verification.coreFacts || []).filter(
    (fact) =>
      fact &&
      fact.usableInScript === true &&
      fact.status === "VERIFIED" &&
      Number(fact.confidence || 0) >= 0.85
  );

  if (approved.length === 0) {
    return `
=== APPROVED FACTS ===
TIDAK ADA FAKTA YANG MEMENUHI AMBANG VERIFIKASI.

ATURAN:
Jangan mengarang fakta historis untuk mengisi kekosongan.
`;
  }

  return `
=== APPROVED VERIFIED FACTS ===
Hanya fakta di bawah ini yang boleh digunakan sebagai fakta pasti:

${approved
  .map(
    (fact, index) =>
      `${index + 1}. ${fact.claim}
Evidence: ${fact.evidence}
Confidence: ${fact.confidence}`
  )
  .join("\n\n")}

=== HISTORICAL CONTEXT ===
${verification.historicalContext || "-"}

=== SAFE NARRATIVE ANGLE ===
${verification.safeNarrativeAngle || "-"}

=== CLAIMS THAT MUST NOT BE PRESENTED AS FACT ===
${(verification.rejectedClaims || []).join("\n- ") || "-"}

${(verification.disputedClaims || []).join("\n- ") || "-"}

${(verification.unknowns || []).join("\n- ") || "-"}
`;
}

/* =========================================================
   STYLE DNA
========================================================= */

function buildStyleDnaBlock(
  channelName: string,
  styleDna: any,
  entriesLength: number
): string {
  return `
=== DNA GAYA CHANNEL "${channelName}" ===

DNA ini HANYA digunakan untuk meniru:
- struktur
- ritme
- gaya bahasa
- pola hook
- pola transisi
- pola ending
- karakter narasi

DNA GAYA TIDAK BOLEH digunakan sebagai sumber fakta.

1. POLA HOOK:
${styleDna.hookPattern || "-"}

2. STRUKTUR BEAT:
${(styleDna.strukturBeat || [])
  .map((s: string, i: number) => `${i + 1}) ${s}`)
  .join(" -> ") || "-"}

3. GAYA BAHASA:
${styleDna.gayaBahasa || "-"}

4. DIKSI / FRASA KHAS:
${(styleDna.diksiKhas || []).join(", ") || "-"}

5. TRANSISI:
${styleDna.teknikTransisi || "-"}

6. CLOSING:
${styleDna.closingPattern || "-"}

7. RITME:
${styleDna.panjangKalimatRataRata || "-"}

8. HAL YANG DIHINDARI:
${(styleDna.halYangDihindari || []).join("; ") || "-"}

9. KARAKTER PENULISAN:
${styleDna.ringkasanKarakter || "-"}

Jumlah naskah yang dianalisis: ${entriesLength}
`;
}

/* =========================================================
   SCRIPT GENERATOR
========================================================= */

async function generateScript(
  supabase: any,
  topic: string,
  tone: string,
  targetPanjang: string,
  catatanTopik: string,
  factBlock: string,
  referenceContextText: string,
  isProfileMode: boolean,
  channelName: string
): Promise<string> {
  const systemPrompt = isProfileMode
    ? `
Kamu adalah PENULIS NASKAH RESMI channel YouTube "${channelName}".

Tulis YouTube Shorts sejarah berdurasi 45-60 detik,
sekitar 130-160 kata.

DNA GAYA yang diberikan hanya untuk STYLE.
APPROVED VERIFIED FACTS adalah satu-satunya sumber fakta.

==================================================
ATURAN FAKTA — ABSOLUT
==================================================

1. Jangan mengarang fakta.

2. Jangan menambahkan angka, tanggal, nama, ukuran, berat,
   mekanisme, tokoh, lokasi, atau detail sejarah yang tidak ada
   dalam APPROVED VERIFIED FACTS.

3. Jangan mengubah PROBABLE, UNCERTAIN, DISPUTED, LEGEND,
   atau UNSUPPORTED menjadi fakta pasti.

4. Jangan menggunakan "detail dramatis" hanya karena membuat cerita
   lebih menarik jika detail tersebut tidak didukung.

5. Jangan membuat hubungan sebab-akibat yang tidak dibuktikan.

6. Jika sebuah bagian menarik tetapi tidak memiliki bukti cukup,
   BUANG bagian tersebut.

7. Fakta boleh disederhanakan untuk Shorts selama maknanya tidak berubah.

8. Jika fakta memiliki qualification, pertahankan qualification tersebut
   ketika diperlukan agar tidak menyesatkan.

9. Jangan menyebut proses verifikasi, Tavily, AI, sumber, atau database
   dalam naskah.

==================================================
ATURAN GAYA
==================================================

Ikuti DNA gaya channel secara ketat.

Namun:
FAKTA > GAYA.

Jika gaya referensi bertentangan dengan fakta,
fakta harus menang.

==================================================
ATURAN NASKAH
==================================================

- Voiceover murni.
- Tidak ada [Visual].
- Tidak ada [Scene].
- Tidak ada [Music].
- Tidak ada catatan produksi.
- Tidak ada pertanyaan retoris.
- Hindari pembukaan AI generik.
- Narasi harus terasa seperti manusia bercerita.
- Setiap kalimat harus memiliki fungsi.
- Jangan mengulang informasi yang sama.
- Jangan memanjangkan naskah dengan filler.
- Target 130-160 kata.
- Utamakan fakta yang paling menarik dan paling mudah divisualisasikan.

FORMAT JSON PERSIS:

{
  "judul": "...",
  "isiNaskah": "...",
  "hook": "...",
  "ending": "...",
  "wordCount": 145,
  "estimasiDurasi": "50 detik"
}
`
    : `
Kamu adalah SCRIPTWRITER YouTube Shorts profesional
untuk konten curious history dan fakta unik.

Tulis naskah 45-60 detik,
sekitar 130-160 kata.

==================================================
ATURAN FAKTA — ABSOLUT
==================================================

APPROVED VERIFIED FACTS adalah sumber fakta utama.

Jangan mengarang fakta untuk membuat cerita lebih menarik.

Jangan menambahkan:
- angka
- tahun
- nama
- ukuran
- berat
- mekanisme
- sebab-akibat
- detail dramatis

jika tidak ada dukungannya di APPROVED VERIFIED FACTS.

Jangan mengubah:
- PROBABLE
- UNCERTAIN
- DISPUTED
- LEGEND
- UNSUPPORTED

menjadi fakta pasti.

Jika informasi tidak cukup,
lebih baik membuat cerita sedikit lebih sederhana
daripada mengarang.

==================================================
ATURAN NASKAH
==================================================

- Voiceover murni.
- Tidak ada [Visual].
- Tidak ada [Scene].
- Tidak ada [Music].
- Tidak ada catatan produksi.
- Tidak ada pertanyaan retoris.
- Natural & antusias.
- 130-160 kata.
- Padat.
- Tidak repetitif.
- Jangan memakai filler untuk mengejar jumlah kata.

FORMAT JSON PERSIS:

{
  "judul": "...",
  "isiNaskah": "...",
  "hook": "...",
  "ending": "...",
  "wordCount": 145,
  "estimasiDurasi": "50 detik"
}
`;

  const userPrompt = `
TOPIK:
${topic}

TONE:
${tone}

TARGET PANJANG:
${targetPanjang}

CATATAN TOPIK:
${catatanTopik || "-"}

${referenceContextText}

${factBlock}

==================================================
TUGAS
==================================================

Tulis satu naskah Shorts baru.

Gunakan fakta VERIFIED sebagai fondasi cerita.

Jangan memasukkan klaim yang berada di bagian
"CLAIMS THAT MUST NOT BE PRESENTED AS FACT".

Jika jumlah fakta yang tersedia terbatas,
jangan mengarang fakta tambahan.

Buat cerita tetap menarik melalui:
- urutan penyampaian
- pemilihan detail yang paling kuat
- ritme
- transisi
- payoff

bukan dengan menambahkan fakta fiktif.

Output JSON valid saja.
`;

  return await callGeminiApi(
    supabase,
    userPrompt,
    systemPrompt
  );
}

/* =========================================================
   MAIN POST
========================================================= */

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

    /* =====================================================
       1. RESOLVE REFERENCE PROFILE
    ===================================================== */

    let targetProfileId = referenceProfileId;

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
            matches.length >= 2
              ? matches[1]
              : matches[0];

          const { data: foundProfile } =
            await supabase
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

    /* =====================================================
       2. LOAD PROFILE + TAVILY
    ===================================================== */

    const tavilyQuery = `
historical facts chronology origin development evidence
"${cleanJudul}"
`;

    const [profileRes, tavilyRes] =
      await Promise.all([
        targetProfileId
          ? supabase
              .from("channel_analysis")
              .select(
                "*, channel_analysis_entries(*)"
              )
              .eq("id", targetProfileId)
              .single()
          : Promise.resolve({
              data: null,
              error: null,
            }),

        fetchTavilyFast(
          tavilyQuery,
          4500
        ),
      ]);

    /* =====================================================
       3. BUILD STYLE CONTEXT
    ===================================================== */

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
        profileRes.data.profile_name ||
        "Referensi";

      const entries =
        profileRes.data.channel_analysis_entries;

      const styleDna =
        profileRes.data.style_dna;

      const dnaEntryCount =
        profileRes.data.style_dna_entry_count || 0;

      if (
        styleDna &&
        dnaEntryCount === entries.length
      ) {
        referenceContextText =
          buildStyleDnaBlock(
            channelName,
            styleDna,
            entries.length
          );
      } else {
        /*
         * IMPORTANT:
         * Fallback ini tetap mempertahankan behaviour lama.
         * Namun naskah referensi hanya digunakan sebagai STYLE,
         * bukan sumber fakta.
         */

        styleDnaMissing = true;

        const samples = entries
          .map((e: any, idx: number) => {
            const entryTitle =
              e.title ||
              e.video_title ||
              e.judul ||
              `Video Asli ${idx + 1}`;

            const fullScript =
              e.full_script ||
              e.script ||
              e.naskah ||
              e.transcript ||
              e.content ||
              "";

            return `
--- CONTOH GAYA ${idx + 1} ---
Judul: "${entryTitle}"
Naskah:
${fullScript}
`;
          })
          .join("\n\n====================\n\n");

        referenceContextText = `
=== CONTOH GAYA CHANNEL "${channelName}" ===

CONTOH DI BAWAH HANYA BOLEH DIGUNAKAN UNTUK:
- gaya bahasa
- ritme
- struktur
- hook
- transisi
- ending

DILARANG menggunakan contoh ini sebagai sumber
fakta sejarah untuk topik baru.

${samples}
`;
      }
    }

    /* =====================================================
       4. TAVILY EVIDENCE BLOCK
    ===================================================== */

    const tavilyContext = tavilyRes
      ? `
=== TAVILY WEB RESEARCH ===

PERINGATAN:
Data berikut adalah HASIL PENCARIAN WEB.
Data ini BUKAN fakta terverifikasi.

Gunakan hanya sebagai bahan evidence untuk proses
FACT VERIFICATION.

${tavilyRes}
`
      : `
=== TAVILY WEB RESEARCH ===

Tidak ada hasil riset yang berhasil diperoleh.
Jangan mengarang fakta sebagai pengganti.
`;

    /* =====================================================
       5. FACT VERIFICATION
    ===================================================== */

    console.log(
      `[Naskah] Memulai fact verification: ${cleanJudul}`
    );

    const verification =
      await verifyResearchFacts(
        supabase,
        cleanJudul,
        tavilyContext,
        catatanTopik
      );

    console.log(
      `[Naskah] Fact verification selesai. Approved: ${
        verification.coreFacts?.filter(
          (f) =>
            f.usableInScript &&
            f.status === "VERIFIED" &&
            Number(f.confidence) >= 0.85
        ).length || 0
      }`
    );

    const approvedFactBlock =
      buildApprovedFactBlock(
        verification
      );

    /* =====================================================
       6. GENERATE SCRIPT FROM APPROVED FACTS ONLY
    ===================================================== */

    const rawResponse =
      await generateScript(
        supabase,
        cleanJudul,
        tone,
        targetPanjang,
        catatanTopik,
        approvedFactBlock,
        referenceContextText,
        isProfileMode,
        channelName
      );

    /* =====================================================
       7. PARSE SCRIPT
    ===================================================== */

    const parsedData: any =
      safeParseJson(
        rawResponse,
        {
          judul: cleanJudul,
          isiNaskah: rawResponse,
        }
      );

    let scriptText = cleanScriptText(
      parsedData.isiNaskah ||
        rawResponse ||
        ""
    );

    if (!scriptText) {
      return NextResponse.json(
        {
          error:
            "Gagal menghasilkan teks naskah dari AI",
        },
        { status: 500 }
      );
    }

    /* =====================================================
       8. WORD COUNT
    ===================================================== */

    const actualWordCount =
      countWords(scriptText);

    /*
     * Jangan membuat ulang naskah hanya karena word count.
     * Kita hanya mengembalikan jumlah kata aktual agar frontend
     * tidak menampilkan angka palsu dari model.
     */

    const estimatedSeconds =
      Math.round(
        (actualWordCount / 2.7)
      );

    /* =====================================================
       9. SAVE TO SUPABASE
    ===================================================== */

    const { data: newNaskah, error: insertErr } =
      await supabase
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

    /* =====================================================
       10. RESPONSE
    ===================================================== */

    return NextResponse.json({
      data:
        newNaskah || {
          id: "temp-" + Date.now(),
          judul: cleanJudul,
          isi_naskah: scriptText,
          sumber_topik_id:
            topikId || null,
          status: "draft",
          created_at:
            new Date().toISOString(),
        },

      parsed: {
        ...parsedData,
        judul: cleanJudul,
        isiNaskah: scriptText,
        wordCount: actualWordCount,
        estimasiDurasi:
          `${estimatedSeconds} detik`,
      },

      /* ===================================================
         FACT VERIFICATION METADATA
         Bisa digunakan frontend nanti untuk QC.
      =================================================== */

      factVerification: {
        approvedFacts:
          verification.coreFacts?.filter(
            (fact) =>
              fact.usableInScript === true &&
              fact.status === "VERIFIED" &&
              Number(fact.confidence) >= 0.85
          ) || [],

        rejectedClaims:
          verification.rejectedClaims || [],

        disputedClaims:
          verification.disputedClaims || [],

        unknowns:
          verification.unknowns || [],

        historicalContext:
          verification.historicalContext || "",

        safeNarrativeAngle:
          verification.safeNarrativeAngle || "",
      },

      styleDnaMissing:
        isProfileMode &&
        styleDnaMissing,

      channelName:
        isProfileMode
          ? channelName
          : null,

      researchUsed:
        Boolean(tavilyRes),

      factVerificationUsed: true,
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
