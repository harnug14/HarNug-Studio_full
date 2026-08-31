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
          temperature: 0.8,
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

// Timeout helper untuk Tavily agar tidak memicu 504
async function fetchTavilyWithTimeout(query: string, timeoutMs = 5000): Promise<string> {
  try {
    const tavilyPromise = fetchTavilySearchResults(query);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Tavily timeout")), timeoutMs)
    );
    return await Promise.race([tavilyPromise, timeoutPromise]);
  } catch (e) {
    console.warn("[Topik] Tavily search fallback/timeout:", e);
    return "";
  }
}

// Helper normalisasi teks untuk deteksi duplikasi ketat
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

    // 1. Ambil seluruh data profil dan seluruh topik user di database (hingga 1000 entri)
    const [profileRes, historyRes] = await Promise.all([
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
        .limit(1000),
    ]);

    let isProfileMode = false;
    let channelName = "Framework Murni";
    let referenceContextText = "";
    let sampleTitlesList: string[] = [];

    // 2. Ekstraksi naskah referensi asli
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length > 0) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name || "Referensi";

      const entries = profileRes.data.channel_analysis_entries;

      sampleTitlesList = entries
        .map((e: any) => e.title || e.video_title || e.judul || "")
        .filter(Boolean);

      const samples = entries
        .slice(0, 8)
        .map((e: any, idx: number) => {
          const entryTitle = e.title || e.video_title || e.judul || `Contoh ${idx + 1}`;
          const entryScript =
            e.full_script || e.script || e.naskah || e.transcript || e.content || "";
          return `[CONTOH KONTEN ASLI ${idx + 1} - "${channelName}"]:\nJudul: "${entryTitle}"\nNaskah Utuh:\n${entryScript}`;
        })
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== DATA ACUAN GAYA & FORMAT DARI CHANNEL "${channelName}" ===\n${samples}`;
    }

    // 3. Bangun Blacklist Ketat (Topik DB + Judul Contoh Referensi + Riwayat Ditolak)
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
      .map((item: string, idx: number) => `${idx + 1}. ${item}`)
      .join("\n");

    const blacklistText = `\n\n⛔ DAFTAR TOPIK YANG SUDAH ADA / DILARANG DIHASILKAN ULANG (TOTAL: ${allForbiddenTitles.length} TOPIK):\n${blacklistItemsText}`;

    // 4. Riset fakta web real-time Tavily
    let tavilyContext = "";
    let searchQuery = "";

    if (isProfileMode) {
      const sampleKeywords = sampleTitlesList.slice(0, 3).join(" ").replace(/[^a-zA-Z0-9\s]/g, "").slice(0, 60);
      searchQuery = topikDisukai
        ? `fakta unik sejarah menarik ${topikDisukai}`
        : `fakta unik sejarah baru unik ${sampleKeywords}`;
    } else {
      searchQuery = topikDisukai
        ? `${kategori} fakta sejarah unik ${topikDisukai}`
        : `${kategori} fakta sejarah unik menarik baru`;
    }

    const tavilyRes = await fetchTavilyWithTimeout(searchQuery, 5000);
    if (tavilyRes) {
      tavilyContext = `\n\n[DATA FAKTA RISET WEB REAL-TIME TAVILY]:\n${tavilyRes}`;
    }

    // 5. System Prompt & Instruksi AI
    const requestedAmount = Math.max(Number(jumlah) || 5, 3);
    const askCount = requestedAmount + 4; // Generate cadangan agar pas setelah deduplikasi

    const systemPrompt = isProfileMode
      ? `Kamu adalah Content Strategist & Storyteller YouTube Shorts.
TUGAS UTAMA:
Pelajari seluruh contoh naskah dan judul asli dari channel "${channelName}" di bawah.
Tiru gaya bertutur, sudut pandang rasa penasaran (curiosity hook), dan ritme penceritaannya.
Hasilkan ${askCount} ide topik video baru yang 100% KONSISTEN dengan karakter channel "${channelName}".

ATURAN MUTLAK ANTI-DUPLIKASI:
- DILARANG KERAS membuat ulang judul/topik yang terdaftar di daftar larangan.
- DILARANG menyalin judul contoh referensi. Topik harus BARU, segar, dan belum pernah dibahas.
- Gunakan bahasa Indonesia yang santai, cerdas, mengalir, dan memikat.
- Tentukan kategori yang sesuai (misal: "Asal-Usul Benda", "Profesi Kuno", "Tradisi & Perilaku", "Peristiwa & Taktik", atau "Curious History").

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Baru Unik Sesuai Gaya Channel Referensi",
      "kategori": "Kategori Sesuai Topik",
      "channelRef": "${channelName}",
      "penjelasan": "Uraian fakta otentik 2 kalimat mengenai daya tarik cerita.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan topik sesuai DNA channel."
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
Hasilkan ${askCount} ide topik video YouTube Shorts BARU yang meniru gaya channel di atas tetapi TIDAK BOLEH SAMA DENGAN DAFTAR LARANGAN.
Format murni JSON valid.`
      : `Parameter:
- Kategori: ${kategori}
- Durasi: ${durasi}
- Preferensi: ${topikDisukai || "Bebas"}
- Ditolak: ${topikDitolak || "Tidak ada"}
- Target: ${askCount} topik baru
${blacklistText}
${tavilyContext}

Hasilkan ${askCount} ide topik baru yang belum pernah ada dalam format JSON valid.`;

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

    const parsedData: any = parseJsonResponse(rawResponse, { candidates: [] });
    const rawCandidates: any[] = Array.isArray(parsedData.candidates) ? parsedData.candidates : [];

    // 6. PROGRAMMATIC DEDUPLICATION FILTER DI BACKEND
    const normalizedForbiddenSet = new Set(allForbiddenTitles.map(normalizeText));

    const uniqueCandidates = rawCandidates.filter((c: any) => {
      if (!c || !c.judul) return false;
      const normJudul = normalizeText(c.judul);
      if (!normJudul || normJudul.length < 3) return false;

      // Cek apakah persis atau mengandung judul yang sudah ada
      for (const forbidden of normalizedForbiddenSet) {
        if (!forbidden) continue;
        if (normJudul === forbidden) return false;
        // Jika kemiripan sangat tinggi
        if (normJudul.length > 8 && forbidden.length > 8) {
          if (normJudul.includes(forbidden) || forbidden.includes(normJudul)) {
            return false;
          }
        }
      }
      return true;
    });

    // Potong sesuai jumlah permintaan pengguna
    const finalCandidates = uniqueCandidates.slice(0, requestedAmount).map((c: any) => ({
      ...c,
      channelRef: c.channelRef || channelName,
    }));

    return NextResponse.json({ data: finalCandidates });
  } catch (err: any) {
    console.error("[Topik API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat kandidat topik" },
      { status: 500 }
    );
  }
}
