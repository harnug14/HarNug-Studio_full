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

    // 2. Rangkai konteks referensi dari Menu Referensi: DNA Gaya (pola eksplisit) sebagai acuan
    //    utama, ditambah judul-judul asli untuk formula judul dan sebagai bahan anti-duplikasi.
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length > 0) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name || "Referensi";

      const entries = profileRes.data.channel_analysis_entries;
      const styleDna = profileRes.data.style_dna;
      const dnaEntryCount = profileRes.data.style_dna_entry_count || 0;

      sampleTitlesList = entries
        .map((e: any) => e.title || e.video_title || e.judul || "")
        .filter(Boolean);

      if (styleDna && dnaEntryCount === entries.length) {
        const dnaBlock = `
=== DNA GAYA CHANNEL "${channelName}" (HASIL ANALISIS POLA - ACUAN UTAMA) ===
1. POLA HOOK PEMBUKA: ${styleDna.hookPattern || "-"}
2. STRUKTUR BEAT NASKAH: ${(styleDna.strukturBeat || []).map((s: string, i: number) => `${i + 1}) ${s}`).join(" -> ") || "-"}
3. GAYA BAHASA: ${styleDna.gayaBahasa || "-"}
4. DIKSI/FRASA KHAS: ${(styleDna.diksiKhas || []).join(", ") || "-"}
5. RINGKASAN KARAKTER: ${styleDna.ringkasanKarakter || "-"}
6. HAL YANG DIHINDARI: ${(styleDna.halYangDihindari || []).join("; ") || "-"}

=== CONTOH JUDUL ASLI CHANNEL "${channelName}" (untuk mempelajari formula judul) ===
${sampleTitlesList.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

        referenceContextText = `\n\n${dnaBlock}`;
      } else {
        styleDnaMissing = true;

        const samples = entries
          .map((e: any, idx: number) => {
            const entryTitle = e.title || e.video_title || e.judul || `Contoh ${idx + 1}`;
            const fullScript =
              e.full_script || e.script || e.naskah || e.transcript || e.content || "";
            return `[CONTOH KONTEN ASLI ${idx + 1} - "${channelName}"]:\nJudul: "${entryTitle}"\nNaskah Utuh:\n${fullScript}`;
          })
          .join("\n\n---\n\n");

        referenceContextText = `\n\n=== DATA ACUAN UTAMA DARI MENU REFERENSI CHANNEL "${channelName}" ===\n${samples}`;
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

    const systemPrompt = isProfileMode
      ? `Kamu adalah Content Strategist & DNA Cloner untuk YouTube Shorts.
TUGAS UTAMA:
Di bawah ada "DNA GAYA" channel "${channelName}" (hasil bedah pola konten secara eksplisit) beserta contoh judul aslinya.
JADIKAN DNA GAYA SEBAGAI ACUAN UTAMA - setiap butir di dalamnya adalah instruksi konkret tentang tema, sudut pandang, dan karakter channel ini, bukan sekadar deskripsi umum.
Pelajari juga formula judul dari contoh judul asli yang disertakan.
Hasilkan ide topik video baru yang 100% KONSISTEN dengan karakter konten dari channel "${channelName}".

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
}`
      : `Kamu adalah Content Strategist untuk YouTube Shorts spesialis kategori "${kategori}".

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

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

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
    });
  } catch (err: any) {
    console.error("[Topik API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat kandidat topik" },
      { status: 500 }
    );
  }
}
