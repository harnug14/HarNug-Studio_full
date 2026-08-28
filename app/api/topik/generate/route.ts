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
          temperature: 0.9,
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
      kategori = "Curious Human History",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
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

    let referenceContextText = "";
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => `[CONTOH POLA ${idx + 1}]: "${e.title}"\nNaskah:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== POLA GAYA CHANNEL "${profileRes.data.profile_name}" ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK SUDAH ADA DI DATABASE (DILARANG MENGULANG TEMA INI):\n${daftarJudul}`;
    }

    let blacklistUser = "";
    if (topikDitolak && topikDitolak.trim()) {
      blacklistUser = `\n⛔ BLACKLIST SPESIFIK DARI PENGGUNA: "${topikDitolak}". DILARANG KERAS!`;
    }

    let tavilyContext = "";
    try {
      const searchQuery = topikDisukai
        ? `bizarre origins human history oddities ${topikDisukai}`
        : `bizarre origins of everyday objects forgotten ancient professions weird historical customs unusual events`;
      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA RISET WEB]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily fallback:", e);
    }

    const systemPrompt = `Kamu adalah Lead Content Director & Topic Architect untuk YouTube Shorts Curious Human History (Gaya Dafiology).

🎯 4 PILAR KATEGORI UTAMA (BERIKAN KOMBINASI SEIMBANG DARI PILAR INI):
1. "Asal-Usul Benda": Benda/fashion sehari-hari dengan asal-usul tak terduga (High Heels, Dasi, Kacamata Hitam, Bantal).
2. "Profesi Kuno": Pekerjaan nyata masa lalu yang terdengar gila (Groom of the Stool, Whipping Boy, Jam Alarm Manusia).
3. "Tradisi & Perilaku": Kebiasaan/tren absurd masa lalu (Sewa Nanas, Pengadilan Hewan, Tradisi Gardyloo).
4. "Peristiwa & Taktik": Taktik aneh atau peristiwa paradoks masa lalu (Taktik Kucing Pelusium, Operasi Cepat Liston).

⛔ ATURAN KETAT:
- WAJIB melampirkan label "kategori" yang tepat pada setiap kandidat.
- DILARANG mengulang subjek/benda yang sudah ada di riwayat database.
- DILARANG topik klise pasaran (Dancing plague, radithor, wallpaper arsenik, banjir sirup boston, bubuk mumi).

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Dafiology (Padat, Ironis, Hook Kuat)",
      "kategori": "Asal-Usul Benda",
      "penjelasan": "Uraian 2-3 kalimat mengenai fakta otentik dan alasan kenapa ini sangat menarik.",
      "skor": { "total": 49 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50."
    }
  ]
}`;

    const userPrompt = `${referenceContextText}
${riwayatTopikText}
${blacklistUser}
${tavilyContext}

Instruksi:
Hasilkan ${jumlah} ide topik video YouTube Shorts berkualitas tinggi yang berbobot dan seimbang antar-kategori (Benda, Profesi, Tradisi, Taktik). Output murni JSON.`;

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
