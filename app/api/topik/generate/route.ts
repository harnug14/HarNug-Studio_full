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
      kategori = "Kisah Individu Nyata & Manusia",
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
    let channelName = "";
    let referenceContextText = "";
    let sampleTitlesList: string[] = [];

    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name;
      sampleTitlesList = profileRes.data.channel_analysis_entries.map((e: any) => e.title).filter(Boolean);

      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => `[CONTOH NASKAH ASLI ${idx + 1}]: "${e.title}"\nNaskah:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== CONTOH POLA & NASKAH ASLI CHANNEL "${channelName}" ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK SUDAH ADA DI DATABASE (DILARANG MENGULANG INI):\n${daftarJudul}`;
    }

    // 💡 DAFTAR BLACKLIST TOTAL (DITOLAK + YANG PERNAH DIABAIKAN USER)
    let blacklistText = "";
    const combinedRejected = [
      ...(topikDitolak ? [topikDitolak] : []),
      ...(Array.isArray(rejectedHistory) ? rejectedHistory : []),
    ];

    if (combinedRejected.length > 0) {
      const list = combinedRejected.slice(0, 60).map((r: string) => `- ${r}`).join("\n");
      blacklistText = `\n\n⛔ DAFTAR TOPIK YANG SUDAH DITOLAK/DIABAIKAN PENGGUNA (DILARANG KERAS MUNCUL LAGI):\n${list}`;
    }

    // 💡 TAVILY: RISET MURNI KISAH INDIVIDU NYATA & KASUS MANUSIA EKSTREM
    let tavilyContext = "";
    try {
      const searchQuery = topikDisukai
        ? `shocking true stories of individuals real people bizarre cases ${topikDisukai}`
        : `shocking true stories of individuals unbelievable bizarre real people cases news strange human decisions`;

      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA KISAH NYATA MANUSIA DARI WEB]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily fallback:", e);
    }

    // 💡 SYSTEM PROMPT MUTLAK: KISAH 1 INDIVIDU NYATA
    const systemPrompt = `Kamu adalah Lead Content Strategist kelas dunia spesialis niche "KISAH INDIVIDU NYATA & AKSI MANUSIA EKSTREM" (Real Human Stories & Bizarre Individuals).

🎯 ATURAN MUTLAK NICHE KISAH MANUSIA (MANDATORI 100%):
1. WAJIB 1 TOKOH INDIVIDU NYATA: Setiap ide topik WAJIB berpusat pada SATU sosok manusia nyata (sebutkan nama tokoh asli, profesi, atau julukannya).
2. FOKUS PADA AKSI / KEPUTUSAN EKSTREM: Ceritakan tindakan nekat, keputusan gila, obsesi aneh, atau kasus hukum unik yang dilakukan oleh orang tersebut.
3. ALUR NYATA & BERBOBOT: Memiliki awal mula kejadian $\rightarrow$ tindakan nekat sang tokoh $\rightarrow$ hasil akhir/hukuman/konsekuensinya.
4. DILARANG: Membahas benda mati, sejarah perang umum, atau peristiwa tanpa tokoh manusia spesifik.

⛔ ATURAN ANTI-REPETISI MUTLAK:
Periksa daftar topik di database dan daftar topik yang diabaikan di bawah. JANGAN PERNAH memunculkan kembali topik atau tokoh yang sudah ada di daftar tersebut!

⚖️ GAYA BAHASA:
- Gunakan bahasa LUGAS, CERDAS, SANTAI, dan memicu rasa heran penonton secara alami.
- Dilarang vulgar kasar & dilarang lebay/clickbait murahan.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Menyoroti Kisah Tokoh Secara Menarik (Lugas & Hook Kuat)",
      "kategori": "Kisah Ekstrem", // Pilih: "Kasus Unik" | "Kisah Ekstrem" | "Sosial & Manusia" | "Tradisi & Perilaku"
      "penjelasan": "Uraian 2-3 kalimat: siapa nama tokohnya, apa tindakan gila/unik yang dilakukannya, dan bagaimana nasib akhirnya.",
      "skor": { "total": 49 },
      "alasanKelulusan": "Alasan kenapa kisah individu ini sangat memikat penonton dan bebas duplikasi."
    }
  ]
}`;

    const userPrompt = `${referenceContextText}
${riwayatTopikText}
${blacklistText}
${tavilyContext}

INSTRUKSI EKSEKUSI:
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MURNI MENCERITAKAN KISAH 1 INDIVIDU NYATA (Tokoh Manusia Spesifik).
${isProfileMode ? `- Sesuaikan tone narasi dan pola judul dengan channel "${channelName}".` : ""}
- Pastikan setiap kandidat menceritakan orang yang berbeda-beda dan belum pernah ada di database.
- Output murni JSON.`;

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
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
