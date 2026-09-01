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
const GENERIC_TEMPERATURE = 0.85; // mode tanpa referensi: bebas
const MAX_SAMPLE_CHARS = 20000; // batas aman total karakter naskah contoh yang dikirim
const ANALYSIS_TIMEOUT_MS = 25000; // batas waktu penulis ringkasan, biar tidak 504

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
  systemPrompt: string,
  temperature: number
): Promise<string> {
  return await callGeminiWithRotation(supabase, async (apiKey) => {
    return await requestGoogleGemini(apiKey, userPrompt, systemPrompt, temperature);
  });
}

// Batas waktu: kalau janji tidak selesai dalam X detik, anggap gagal (biar tidak 504)
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Waktu analisis habis")), ms)
    ),
  ]);
}

// Timeout helper mandiri untuk Tavily agar tidak membekukan proses serverless
async function fetchTavilyFast(query: string, timeoutMs = 4000): Promise<string> {
  if (!query || !query.trim()) return "";
  try {
    const tavilyPromise = fetchTavilySearchResults(query);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Tavily timeout")), timeoutMs)
    );
    return await Promise.race([tavilyPromise, timeoutPromise]);
  } catch (e) {
    console.warn("[Topik] Tavily fallback/timeout:", e);
    return "";
  }
}

// Helper normalisasi deteksi duplikasi
function normalizeText(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/^(visual\s*package|naskah|topik|sejarah|asal[- ]usul)\s*[-:]\s*/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Ambil judul + naskah dari entri referensi (kompatibel dengan beberapa nama kolom)
function getEntryField(e: any): { title: string; fullScript: string } {
  return {
    title: e?.title || e?.video_title || e?.judul || "",
    fullScript: e?.full_script || e?.script || e?.naskah || e?.transcript || e?.content || "",
  };
}

// Susun blok naskah contoh: SEMUA entri dikirim selama masih muat batas karakter
function buildSamplesText(entries: any[]): string {
  const parts: string[] = [];
  let used = 0;
  entries.forEach((e: any, idx: number) => {
    const { title, fullScript } = getEntryField(e);
    const block = `--- CONTOH NASKAH ASLI ${idx + 1} ---\nJudul: "${title || `Contoh ${idx + 1}`}"\nNaskah:\n${fullScript}\n`;
    if (parts.length > 0 && used + block.length > MAX_SAMPLE_CHARS) return;
    parts.push(block);
    used += block.length;
  });
  return parts.join("\n");
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
      kategori = "Curious History",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
      rejectedHistory = [],
    } = await req.json();

    // 1. Jalankan fetch Supabase dan riset Tavily secara PARALEL untuk mencegah 504
    const initialTavilyQuery = topikDisukai
      ? `fakta unik sejarah menarik nyata ${topikDisukai}`
      : `${kategori} fakta sejarah unik menarik nyata`;

    const [profileRes, historyRes, tavilyRes] = await Promise.all([
      referenceProfileId
        ? supabase
            .from("channel_analysis")
            .select("*, channel_analysis_entries(*)")
            .eq("id", referenceProfileId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("topik")
        .select("judul")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500),
      fetchTavilyFast(initialTavilyQuery, 4000),
    ]);

    let isProfileMode = false;
    let channelName = "Framework Murni";
    let referenceContextText = "";
    let sampleTitlesList: string[] = [];
    let styleDnaMissing = false;
    let dnaAutoAnalyzed = false;

    // 2. Rangkai konteks referensi: ringkasan gaya + CONTOH NASKAH ASLI dikirim bersamaan.
    //    Jika ringkasan belum ada / ketinggalan zaman → ditulis otomatis di sini (dibatasi 25 detik).
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length > 0) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name || "Referensi";

      const entries = profileRes.data.channel_analysis_entries;
      let styleDna = profileRes.data.style_dna;
      const dnaEntryCount = profileRes.data.style_dna_entry_count || 0;

      sampleTitlesList = entries.map((e: any) => getEntryField(e).title).filter(Boolean);

      const dnaHasContent = styleDna && (styleDna.ringkasanKarakter || styleDna.hookPattern);
      const dnaIsFresh = dnaHasContent && dnaEntryCount === entries.length;

      if (!dnaIsFresh) {
        // OTOMATIS tulis ringkasan sekarang, dengan batas waktu aman.
        try {
          const entriesForAnalysis = entries.map((e: any) => {
            const f = getEntryField(e);
            return { title: f.title, fullScript: f.fullScript.slice(0, 2000) };
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
          console.warn("[Topik] Ringkasan gaya tidak selesai tepat waktu, pakai mode naskah asli:", e);
          styleDnaMissing = true;
        }
      }

      const samplesText = buildSamplesText(entries);

      if (!styleDnaMissing && styleDna) {
        const dnaBlock = `
=== DNA GAYA CHANNEL "${channelName}" (HASIL ANALISIS POLA - ACUAN UTAMA) ===
1. POLA HOOK PEMBUKA: ${styleDna.hookPattern || "-"}
2. STRUKTUR BEAT NASKAH: ${(styleDna.strukturBeat || []).map((s: string, i: number) => `${i + 1}) ${s}`).join(" -> ") || "-"}
3. GAYA BAHASA: ${styleDna.gayaBahasa || "-"}
4. DIKSI/FRASA KHAS: ${(styleDna.diksiKhas || []).join(", ") || "-"}
5. TEKNIK TRANSISI: ${styleDna.teknikTransisi || "-"}
6. POLA PENUTUP: ${styleDna.closingPattern || "-"}
7. RITME & PANJANG KALIMAT: ${styleDna.panjangKalimatRataRata || "-"}
8. HAL YANG DIHINDARI: ${(styleDna.halYangDihindari || []).join("; ") || "-"}
9. RINGKASAN KARAKTER: ${styleDna.ringkasanKarakter || "-"}

WAJIB: setiap ide topik harus terasa seperti episode baru dari channel "${channelName}".
Terapkan pola hook, sudut pandang, tema, dan karakter di atas secara konsisten.`;

        referenceContextText = `\n\n${dnaBlock}\n\n=== CONTOH NASKAH ASLI CHANNEL "${channelName}" (pelajari juga formula judulnya) ===\n${samplesText}`;
      } else {
        referenceContextText = `\n\n=== DATA ACUAN UTAMA DARI MENU REFERENSI CHANNEL "${channelName}" ===\nBedah pola gaya langsung dari naskah asli di bawah (formula hook, tema, sudut pandang, formula judul), lalu terapkan pada ide baru.\n\n${samplesText}`;
      }
    }

    // 3. Bangun Blacklist Lengkap Anti-Duplikasi
    const existingDbTitles = (historyRes.data || []).map((t: any) => t.judul).filter(Boolean);
    const allForbiddenTitles = Array.from(
      new Set([
        ...existingDbTitles,
        ...sampleTitlesList,
        ...(topikDitolak ? [topikDitolak] : []),
        ...(Array.isArray(rejectedHistory) ? rejectedHistory : []),
      ])
    );

    const blacklistItemsText = allForbiddenTitles
      .slice(0, 200)
      .map((item: string, idx: number) => `${idx + 1}. ${item}`)
      .join("\n");

    const blacklistText = `\n\n⛔ DAFTAR TOPIK YANG SUDAH ADA / DILARANG DIHASILKAN ULANG:\n${blacklistItemsText}`;

    // 4. Konteks Hasil Tavily
    const tavilyContext = tavilyRes
      ? `\n\n[DATA FAKTA RISET WEB REAL-TIME TAVILY]:\n${tavilyRes}`
      : "";

    // 5. System Prompt & Instruksi AI
    const requestedAmount = Math.max(Number(jumlah) || 5, 3);
    const askCount = requestedAmount + 3;

    const systemPromptWithDna = `Kamu adalah Content Strategist & DNA Cloner untuk YouTube Shorts.
TUGAS UTAMA:
Di bawah ada "DNA GAYA" channel "${channelName}" beserta contoh naskah aslinya.
PRIORITAS #1: setiap ide topik harus 100% KONSISTEN dengan karakter konten channel "${channelName}" — tema, sudut pandang, formula judul, dan jenis rasa penasaran yang dibangkitkan harus sama dengan channel tersebut.
DNA dan contoh naskah adalah ACUAN UTAMA, bukan sekadar inspirasi.

ATURAN WAJIB:
- DILARANG KERAS membuat ulang judul atau topik yang ada di daftar larangan.
- DILARANG menyalin judul contoh referensi. Topik harus BARU, segar, dan belum pernah dibahas.
- Gunakan bahasa yang lugas, santai, cerdas, dan memikat (anti-lebay/clickbait murahan).
- Kategori topik harus merefleksikan isi konten (misal: "Asal-Usul Benda", "Profesi Kuno", "Tradisi & Perilaku", "Peristiwa & Taktik", atau "Curious History").

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Sesuai Karakter Menu Referensi",
      "kategori": "Kategori Sesuai Topik",
      "channelRef": "${channelName}",
      "penjelasan": "Uraian singkat 2 kalimat mengenai fakta otentik dan daya tarik ceritanya.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50 sesuai acuan Menu Referensi."
    }
  ]
}`;

    const systemPromptNoDna = `Kamu adalah Content Strategist & DNA Cloner untuk YouTube Shorts.
TUGAS UTAMA:
Di bawah ada NASKAH ASLI dari channel "${channelName}". Bedah sendiri polanya: formula hook, tema yang disukai, sudut pandang, dan formula judul.
PRIORITAS #1: hasilkan ide topik yang 100% KONSISTEN dengan karakter konten channel "${channelName}", terasa seperti episode baru dari channel tersebut.

ATURAN WAJIB:
- DILARANG KERAS membuat ulang judul atau topik yang ada di daftar larangan.
- DILARANG menyalin judul contoh referensi. Topik harus BARU, segar, dan belum pernah dibahas.
- Gunakan bahasa yang lugas, santai, cerdas, dan memikat (anti-lebay/clickbait murahan).

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Sesuai Karakter Menu Referensi",
      "kategori": "Kategori Sesuai Topik",
      "channelRef": "${channelName}",
      "penjelasan": "Uraian singkat 2 kalimat mengenai fakta otentik dan daya tarik ceritanya.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50 sesuai acuan Menu Referensi."
    }
  ]
}`;

    const systemPromptGeneric = `Kamu adalah Content Strategist untuk YouTube Shorts spesialis kategori "${kategori}".

ATURAN MUTLAK ANTI-DUPLIKASI:
- DILARANG KERAS membuat ulang topik yang ada di daftar larangan.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Baru Unik & Konkret",
      "kategori": "${kategori}",
      "channelRef": "Framework Murni",
      "penjelasan": "Uraian fakta singkat 2 kalimat.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50."
    }
  ]
}`;

    const systemPrompt = isProfileMode
      ? styleDnaMissing
        ? systemPromptNoDna
        : systemPromptWithDna
      : systemPromptGeneric;

    const userPrompt = isProfileMode
      ? `${referenceContextText}
${blacklistText}
${tavilyContext}

INSTRUKSI:
Hasilkan ${askCount} ide topik video YouTube Shorts BARU yang 100% MENIRU KARAKTER DAN POLA KONTEN DARI MENU REFERENSI DI ATAS.
Pastikan tidak mengulang daftar larangan.
Format murni JSON valid.`
      : `Parameter:
- Kategori: ${kategori}
- Durasi: ${durasi}
- Preferensi: ${topikDisukai || "Bebas"}
- Ditolak: ${topikDitolak || "Tidak ada"}
${blacklistText}
${tavilyContext}

Hasilkan ${askCount} ide topik baru dalam format JSON valid.`;

    const temperature = isProfileMode ? REFERENCE_TEMPERATURE : GENERIC_TEMPERATURE;

    const rawResponse = await callGeminiApi(supabase, userPrompt, systemPrompt, temperature);

    const parsedData: any = parseJsonResponse(rawResponse, { candidates: [] });
    const rawCandidates: any[] = Array.isArray(parsedData.candidates) ? parsedData.candidates : [];

    // 6. Programmatic Deduplication Filter di Backend
    const normalizedForbiddenSet = new Set(allForbiddenTitles.map(normalizeText));

    const uniqueCandidates = rawCandidates.filter((c: any) => {
      if (!c || !c.judul) return false;
      const normJudul = normalizeText(c.judul);
      if (!normJudul || normJudul.length < 3) return false;

      for (const forbidden of normalizedForbiddenSet) {
        if (!forbidden) continue;
        if (normJudul === forbidden) return false;
        if (normJudul.length > 8 && forbidden.length > 8) {
          if (normJudul.includes(forbidden) || forbidden.includes(normJudul)) {
            return false;
          }
        }
      }
      return true;
    });

    const finalCandidates = uniqueCandidates.slice(0, requestedAmount).map((c: any) => ({
      ...c,
      channelRef: c.channelRef || channelName,
    }));

    return NextResponse.json({
      data: finalCandidates,
      styleDnaMissing: isProfileMode && styleDnaMissing,
      dnaAutoAnalyzed,
    });
  } catch (err: any) {
    console.error("[Topik API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat kandidat topik" },
      { status: 500 }
    );
  }
}
