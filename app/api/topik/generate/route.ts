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
      kategori = "Curious Human History & Bizarre Past Norms",
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
        .map((e: any, idx: number) => `[CONTOH POLA DAFIOLOGY ${idx + 1}]: "${e.title}"\nNaskah:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== WAJIB ADOPSI TOTAL POLA CHANNEL: "${profileRes.data.profile_name}" ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK SUDAH ADA DI DATABASE (DILARANG MENGULANG TEMA/SUBJEK INI):\n${daftarJudul}`;
    }

    let blacklistUser = "";
    if (topikDitolak && topikDitolak.trim()) {
      blacklistUser = `\n⛔ DITOLAK USER SECARA SPESIFIK: "${topikDitolak}". DILARANG KERAS!`;
    }

    // 💡 TAVILY SEARCH: Gali domain sejarah yang benar-benar fresh dan liar
    let tavilyContext = "";
    try {
      const searchQuery = topikDisukai
        ? `bizarre historical facts origins paradox ${topikDisukai}`
        : `obscure bizarre historical events ancient medical practices weird laws forgotten inventions human history`;
      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA RISET FAKTA SEJARAH WEB]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily fallback:", e);
    }

    const systemPrompt = `Kamu adalah Lead Content Director & Topic Architect untuk channel YouTube Shorts "Dafiology" (Curious Human History).

🎯 FORMULA TOPIK WAJIB ALAS DAFIOLOGY:
1. PARADOKS & IRONI MASA LALU: Menyoroti hal yang kita anggap normal/sepele hari ini, tapi di masa lalu punya asal-usul gila, berbahaya, atau konyol.
2. WAJIB VARIASI DOMAIN (JANGAN MONOTON):
   - Operasi & Pengobatan Medis Kuno yang Ekstrem (Bukan mumi/radium).
   - Hukum & Hukuman Absurd Abad Pertengahan / Zaman Kuno.
   - Profesi Nyata yang Gila di Masa Lalu.
   - Sanitasi, Kebiasaan Tidur/Makan yang Melanggar Logika Modern.
   - Taktik Perang Konyol & Keputusan Fatal Pemimpin Dunia.
3. GAYA JUDUL KHAS DAFIOLOGY:
   - "[Subjek Unik]: [Fakta/Ironi Mengejutkan yang Bikin Melongo]!"

⛔ ATURAN ANTI-DUPLIKASI SUBJEK MUTLAK:
Periksa daftar topik database user di bawah. JIKA SEBUAH SUBJEK SUDAH ADA (misal: "Kulkas/Es", "Shampo/Rambut", "Popok"), KAMU DILARANG KERAS MEMBUAT TOPIK TERKAIT SUBJEK ITU LAGI DENGAN ALASAN APA PUN! Wajib pilih subjek/benda/peristiwa yang 100% berbeda!

⛔ DAFTAR KLISE PASARAN (DILARANG):
- Dancing Plague 1518
- Radithor / Air Radioaktif
- Scheele's Green / Wallpaper Arsenik
- Banjir Molasses Boston
- Bubuk Mumi
- Garpu dianggap setan

FORMAT JSON OUTPUT PERSIS (pure JSON object):
{
  "candidates": [
    {
      "judul": "Judul Khas Dafiology (Padat, Ironis, Hook Kuat)",
      "penjelasan": "Uraian 2-3 kalimat mengenai fakta otentik, tokoh/zaman terjadinya, dan kenapa ini memicu rasa penasaran tinggi.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kenapa topik ini 100% sesuai formula Dafiology dan bebas duplikasi subjek."
    }
  ]
}`;

    const userPrompt = `${referenceContextText}
${riwayatTopikText}
${blacklistUser}
${tavilyContext}

INSTRUKSI EKSEKUSI:
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MENIRU GAYA DAFIOLOGY.
- JANGAN mengulang subjek/tema yang sudah ada di daftar database di atas (Kulkas, Rambut, dll WAJIB DIHINDARI).
- Pastikan setiap kandidat membahas domain sejarah yang berbeda-beda dan kaya intrik manusiawi.
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
