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
      kategori = "Curious Human History & Asal-Usul",
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
            .select("id, profile_name, channel_analysis_entries(title, full_script)")
            .eq("id", referenceProfileId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("topik")
        .select("judul")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    let isProfileMode = false;
    let channelName = "Dafiology";
    let referenceContextText = "";

    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name;

      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => `[SAMPEL NASKAH ASLI ${idx + 1}]: "${e.title}"\nNaskah:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== CONTOH POLA KONTEN ASLI CHANNEL "${channelName}" ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK DI DATABASE (DILARANG MENGULANG INI):\n${daftarJudul}`;
    }

    const combinedRejected = [
      ...(topikDitolak ? [topikDitolak] : []),
      ...(Array.isArray(rejectedHistory) ? rejectedHistory : []),
      "Dancing Plague 1518",
      "Radithor",
      "Scheele Green",
      "Banjir Molasses Boston",
      "Bubuk Mumi",
    ];

    const blacklistText = `\n\n⛔ DAFTAR BLACKLIST (DILARANG MUNCUL LAGI):\n${combinedRejected.slice(0, 80).map((r) => `- ${r}`).join("\n")}`;

    // 💡 TAVILY: RISET SEJARAH ASAL-USUL BENDA, PROFESI, & TRADISI KUNO
    let tavilyContext = "";
    try {
      const searchQuery = topikDisukai
        ? `bizarre origins human history oddities ${topikDisukai}`
        : `bizarre origins of everyday objects forgotten ancient professions weird historical customs`;

      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA RISET WEB]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily fallback:", e);
    }

    // 💡 SYSTEM PROMPT RESMI FOKUS MURNI DAFIOLOGY
    const systemPrompt = `Kamu adalah Lead Content Director & Topic Architect untuk YouTube Shorts Curious Human History (Gaya Dafiology).

🎯 4 PILAR KATEGORI UTAMA (WAJIB BERIKAN KOMBINASI DARI 4 PILAR INI):
1. "Asal-Usul Benda": Benda/fashion/alat sehari-hari dengan asal-usul tak terduga di masa lalu (misal: Dasi, High Heels, Kacamata, Bantal, Jam Alarm).
2. "Profesi Kuno": Pekerjaan nyata masa lalu yang terdengar gila/unik (misal: Groom of the Stool, Whipping Boy, Knocker-up).
3. "Tradisi & Perilaku": Kebiasaan/tren absurd manusia zaman dulu (misal: Sewa Nanas, Pengadilan Hewan, Tradisi Gardyloo).
4. "Peristiwa & Taktik": Taktik aneh atau peristiwa sejarah unik (misal: Taktik Kucing Pelusium, Operasi Cepat Liston).

⚖️ ATURAN GAYA BAHASA & KUALITAS:
1. GAYA BAHASA: Lugas, santai, cerdas, dan memikat penonton secara alami.
2. DILARANG VULGAR KASAR & DILARANG LEBAY/CLICKBAIT BOMBATIS.
3. DILARANG MENGULANG SUBJEK/TOPIK yang sudah ada di database.
4. LABEL KATEGORI: WAJIB memilih salah satu dari 4 kategori di atas secara tepat!

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Dafiology (Lugas, Cerdas, Hook Kuat)",
      "kategori": "Asal-Usul Benda", // WAJIB SALAH SATU: "Asal-Usul Benda" | "Profesi Kuno" | "Tradisi & Perilaku" | "Peristiwa & Taktik"
      "channelRef": "Dafiology",
      "penjelasan": "Uraian 2-3 kalimat mengenai fakta otentik dan alasan kenapa ini sangat menarik.",
      "skor": { "total": 49 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50 sesuai standar Dafiology."
    }
  ]
}`;

    const userPrompt = `${referenceContextText}
${riwayatTopikText}
${blacklistText}
${tavilyContext}

INSTRUKSI:
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MENIRU FORMULA DAFIOLOGY.
- Berikan variasi seimbang dari 4 pilar kategori (Asal-Usul Benda, Profesi Kuno, Tradisi & Perilaku, Peristiwa & Taktik).
- Pastikan topik baru belum ada di database.
- Output murni JSON.`;

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

    const parsedData: any = parseJsonResponse(rawResponse, { candidates: [] });

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
