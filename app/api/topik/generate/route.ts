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
      kategori = "Umum & Edukasi",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
      rejectedHistory = [],
    } = await req.json();

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
        .limit(100),
    ]);

    let isProfileMode = false;
    let channelName = "Framework Murni";
    let referenceContextText = "";
    let sampleTitles: string[] = [];

    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name;
      sampleTitles = profileRes.data.channel_analysis_entries.map((e: any) => e.title).filter(Boolean);

      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => `[SAMPEL NASKAH ${idx + 1}]: "${e.title}"\nNaskah:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== CONTOH POLA KONTEN CHANNEL "${channelName}" ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK DI DATABASE USER (DILARANG MENGULANG INI):\n${daftarJudul}`;
    }

    // Blacklist komprehensif termasuk penolakan pengguna & klise internet
    const combinedRejected = [
      ...(topikDitolak ? [topikDitolak] : []),
      ...(Array.isArray(rejectedHistory) ? rejectedHistory : []),
      "Kekuatan super setelah koma",
      "Savant syndrome ajaib",
      "Tersambar petir jadi jenius",
      "Selamat kecelakaan berkali-kali",
      "Tinggal di bandara / runway",
      "Menjual Menara Eiffel",
      "Groom of the stool",
      "Perang Emu",
      "Kaki teratai",
      "Cornflakes hawa nafsu",
      "Sirup heroin bayer"
    ];

    const blacklistText = `\n\n⛔ DAFTAR MERAH / DILARANG KERAS MUNCUL:\n${combinedRejected.slice(0, 60).map((r) => `- ${r}`).join("\n")}`;

    let tavilyContext = "";
    try {
      let searchQuery = "";
      if (isProfileMode) {
        const titleHints = sampleTitles.slice(0, 2).join(" ").replace(/[^a-zA-Z0-9\s]/g, "").slice(0, 80);
        searchQuery = topikDisukai
          ? `fakta unik nyata menarik ${topikDisukai}`
          : `fakta unik otentik ${titleHints}`;
      } else {
        searchQuery = topikDisukai
          ? `${kategori} fakta unik ${topikDisukai}`
          : `${kategori} fakta unik menarik otentik`;
      }

      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA RISET WEB]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily error:", e);
    }

    const systemPrompt = isProfileMode
      ? `Kamu adalah Content Strategist kelas dunia.
TUGAS UTAMA:
Pelajari seluruh sampel naskah dari channel "${channelName}" di bawah. Identifikasi niche spesifiknya, gaya berceritanya, pola konflik, dan formula judulnya.
Hasilkan ide topik baru yang 100% KONSISTEN dengan tema dan gaya channel "${channelName}".

⛔ LARANGAN MUTLAK KONTEN SENSASIONALISME / KLISE:
- DILARANG mitos kekuatan super / mendadak jenius setelah koma / petir.
- DILARANG kisah selamat kecelakaan berkali-kali yang tidak masuk akal.
- DILARANG kisah basi tinggal di bandara atau trik penipuan usang.
- DILARANG mengulang topik dari database user.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Konkret Sesuai Pola ${channelName}",
      "kategori": "Kisah Nyata",
      "channelRef": "${channelName}",
      "penjelasan": "Uraian fakta otentik 2-3 kalimat mengenai peristiwa/sosok tersebut.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50 sesuai standar ${channelName}."
    }
  ]
}`
      : `Kamu adalah Content Strategist untuk YouTube Shorts spesialis kategori "${kategori}".

⛔ LARANGAN MUTLAK:
- DILARANG topik mitos fiksi/kekuatan super/sensasionalisme clickbait basi.
- DILARANG mengulang topik yang sudah ada di database.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Menarik & Konkret",
      "kategori": "Umum",
      "channelRef": "Framework Murni",
      "penjelasan": "Uraian ringkas fakta otentik.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50."
    }
  ]
}`;

    const userPrompt = `${referenceContextText}
${riwayatTopikText}
${blacklistText}
${tavilyContext}

Hasilkan ${jumlah} ide topik berkualitas tinggi dalam format JSON murni.`;

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

    const parsedData: any = parseJsonResponse(rawResponse, { candidates: [] });

    // Pastikan setiap kandidat membawa channelRef yang konsisten
    const formattedCandidates = (parsedData.candidates || []).map((c: any) => ({
      ...c,
      channelRef: c.channelRef || channelName,
    }));

    return NextResponse.json({ data: formattedCandidates });
  } catch (err: any) {
    console.error("Error generating topic candidates:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat kandidat topik" },
      { status: 500 }
    );
  }
}
