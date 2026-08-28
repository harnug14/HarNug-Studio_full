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
    let isProfileMode = false;

    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
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
      blacklistUser = `\n⛔ BLACKLIST KHUSUS PENGGUNA: "${topikDitolak}". DILARANG KERAS!`;
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

🎯 4 PILAR KATEGORI UTAMA:
1. "Asal-Usul Benda": Benda/fashion sehari-hari dengan asal-usul tak terduga.
2. "Profesi Kuno": Pekerjaan nyata masa lalu yang terdengar janggal/unik.
3. "Tradisi & Perilaku": Kebiasaan/tren absurd masa lalu.
4. "Peristiwa & Taktik": Taktik aneh atau peristiwa unik masa lalu.

⚖️ ATURAN GAYA BAHASA (ANTI-VULGAR & ANTI-LEBAY):
1. DILARANG VULGAR/JOROK KASAR: Hindari kata-kata jorok vulgar yang rawan kena filter sensor YouTube (contoh: jangan gunakan kata "nyebokin", gunakan istilah yang lebih wajar dan santun seperti "membersihkan" atau "merawat").
2. DILARANG LEBAY/HIPERBOLA BOMBATIS: Hindari kata-kata heboh berlebihan yang terdengar 'cringe' (contoh: jangan gunakan kata "Jabatan Paling Mengguncang Jagat Raya", dll).
3. GUNAKAN BAHASA LUGAS, SANTAI, DAN CERDAS: Judul harus terasa memancing rasa ingin tahu secara alami dan proporsional.

⛔ ATURAN ANTI-DUPLIKASI:
DILARANG mengulang subjek/benda yang sudah ada di riwayat database.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Dafiology (Lugas, Cerdas, Alami, Hook Kuat)",
      "kategori": "Profesi Kuno",
      "penjelasan": "Uraian 2-3 kalimat mengenai fakta otentik dan alasan kenapa ini sangat menarik secara historis.",
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
Hasilkan ${jumlah} ide topik video YouTube Shorts berkualitas tinggi yang berbobot, seimbang antar-kategori, dan menggunakan gaya bahasa yang lugas (anti-vulgar & anti-lebay). Output murni JSON.`;

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
