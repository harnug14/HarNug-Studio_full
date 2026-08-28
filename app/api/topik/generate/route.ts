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
      kategori = "Asal-usul Kebiasaan & Kehidupan Manusia Masa Lalu",
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
        .map((e: any, idx: number) => `Contoh Naskah ${idx + 1}: ${e.title}\nNaskah Utuh:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\nREFERENSI PROFIL CHANNEL LENGKAP ("${profileRes.data.profile_name}"):\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any) => `- ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n--- DAFTAR TOPIK DATABASE ANDA (DILARANG DUPLIKAT) ---\n${daftarJudul}`;
    }

    let blacklistUser = "";
    if (topikDitolak && topikDitolak.trim()) {
      blacklistUser = `\n⛔ BLACKLIST KHUSUS PENGGUNA: Dilarang keras membuat topik tentang: "${topikDitolak}".`;
    }

    // 💡 RISET TAVILY TERARAH: Khusus asal-usul barang, kebiasaan manusia, dan profesi kuno
    let tavilyContext = "";
    try {
      const searchQuery = topikDisukai
        ? `bizarre origin of everyday habits objects history ${topikDisukai}`
        : `bizarre origins of daily habits forgotten ancient human professions weird everyday life customs history`;
      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA RISET WEB TAVILY]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily fallback:", e);
    }

    const systemPrompt = `Kamu adalah Lead Researcher & Story Strategist untuk channel YouTube Shorts "Curious Human History" (Standar Dafiology).

🎯 PILAR TEMA UTAMA TOPIK (WAJIB MEMILIH DARI PILAR INI):
1. ASAL-USUL BENDA/NORMA SEHARI-HARI: Kenapa manusia masa lalu menciptakan barang/etika tertentu (misal: asal-usul deodoran, bantal batu, sepatu hak tinggi, salaman).
2. CARA HIDUP SEBELUM TEKNOLOGI MODERN: Solusi cerdas/ekstrem manusia purba/kuno untuk mengatasi masalah hidup (misal: cara bangun pagi sebelum ada jam alarm, cara mandi sebelum ada sabun, cara kirim pesan sebelum ada pos).
3. PROFESI ANEH YANG SUDAH PUNAH: Pekerjaan nyata di masa lalu yang terdengar gila hari ini.
4. DILEMA SOSIAL & ATURAN ANEH: Kebiasaan makan, tidur, atau interaksi sosial kuno yang memicu benturan budaya.

⛔ DAFTAR MERAH KLISE AI (DILARANG KERAS MENGHASILKAN INI):
DILARANG 100% membuat topik tentang:
- Wabah Menari Strasbourg 1518 (Dancing Plague)
- Air Minum Radioaktif / Radithor
- Cat Hijau Paris Green / Scheele's Green / Wallpaper Arsenik
- Banjir Sirup Molasses Boston 1919
- Bubuk Mumi Obat / Mummia
- Perang Emu Australia
- Garpu dianggap setan

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Konkret, Menggelitik Rasa Ingin Tahu, dan Berbobot",
      "penjelasan": "Uraian 2-3 kalimat mengenai fakta otentik dan solusi unik manusia di zaman itu.",
      "skor": { "total": 47 },
      "alasanKelulusan": "Alasan kenapa topik ini relevan dengan kehidupan manusia dan bebas klise."
    }
  ]
}${riwayatTopikText}${blacklistUser}`;

    const userPrompt = isProfileMode
      ? `PROFIL CHANNEL REFERENSI:${referenceContextText}${tavilyContext}

Instruksi:
Hasilkan ${jumlah} ide topik baru yang fresh, fokus pada kebiasaan & asal-usul kehidupan manusia masa lalu, dan PATUHI daftar merah larangan klise AI. Berikan dalam JSON murni.`
      : `Parameter Ideation:
- Niche: ${kategori}
- Durasi: ${durasi}
- Preferensi: ${topikDisukai || "Asal-usul barang sehari-hari, cara manusia hidup sebelum teknologi, profesi kuno yang hilang"}
- Topik Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah: ${jumlah} kandidat${tavilyContext}

Hasilkan ${jumlah} ide topik fresh anti-klise dalam JSON murni sekarang.`;

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
