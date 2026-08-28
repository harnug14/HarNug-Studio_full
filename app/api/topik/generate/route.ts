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
      kategori = "Sains & Fakta Unik",
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
    let isJurnalKumal = false;

    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name;
      isJurnalKumal = channelName.toLowerCase().includes("kumal");

      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => `[CONTOH POLA ${idx + 1}]: "${e.title}"\nNaskah:\n${e.full_script || ""}`)
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== CONTOH POLA & NASKAH ASLI DARI DATABASE CHANNEL "${channelName}" ===\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\n⛔ DAFTAR TOPIK SUDAH ADA DI DATABASE (DILARANG MENGULANG INI):\n${daftarJudul}`;
    }

    let blacklistText = "";
    const combinedRejected = [
      ...(topikDitolak ? [topikDitolak] : []),
      ...(Array.isArray(rejectedHistory) ? rejectedHistory : []),
      "Groom of the Stool",
      "Perang Emu",
      "Kaki Teratai",
      "Cornflakes",
      "Sirup Heroin",
    ];

    if (combinedRejected.length > 0) {
      const list = combinedRejected.slice(0, 50).map((r: string) => `- ${r}`).join("\n");
      blacklistText = `\n\n⛔ DAFTAR BLACKLIST (DILARANG KERAS MUNCUL LAGI):\n${list}`;
    }

    // 💡 RISET TAVILY SESUAI NICHE ASLI CHANNEL
    let tavilyContext = "";
    try {
      let searchQuery = "";
      if (isProfileMode) {
        if (isJurnalKumal) {
          // Khusus Jurnal Kumal: Murni cari kisah nyata aneh, kasus hukum absurd, fenomena manusia ekstrem
          searchQuery = topikDisukai
            ? `bizarre true stories human phenomena weird real cases ${topikDisukai}`
            : `shocking bizarre true stories real life unbelievable human events weird lawsuits strange people phenomena`;
        } else {
          // Khusus Dafiology: Sejarah benda kuno & tradisi masa lalu
          searchQuery = topikDisukai
            ? `bizarre origins human history oddities ${topikDisukai}`
            : `bizarre origins of everyday objects forgotten ancient professions weird historical customs`;
        }
      } else {
        searchQuery = topikDisukai
          ? `${kategori} fakta unik ${topikDisukai}`
          : `${kategori} fakta unik menarik mencengangkan`;
      }

      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA RISET WEB TERBARU]:\n${tavilyRes}`;
      }
    } catch (e) {
      console.warn("[Topik] Tavily fallback:", e);
    }

    let systemPrompt = "";

    if (isProfileMode && isJurnalKumal) {
      // 💡 SYSTEM PROMPT KHUSUS JURNAL KUMAL (100% KISAH NYATA / FENOMENA ANEH DUNIA)
      systemPrompt = `Kamu adalah Lead Content Strategist untuk channel YouTube Shorts "Jurnal Kumal".

🎯 ATURAN DNA JURNAL KUMAL (WAJIB DIPATUHI 100%):
1. BUKAN SEJARAH KUNO: DILARANG KERAS membuat topik tentang sejarah benda abad pertengahan, kerajaan kuno, atau zaman purba!
2. TEMA UTAMA: 
   - Kasus Hukum / Persidangan Aneh Nyata di Dunia (contoh: anak dituntut ortu karena malas, orang menuntut dirinya sendiri).
   - Fenomena Manusia Ekstrem & Unik (contoh: orang dengan obsesi gila, petani di tengah runway bandara, orang hidup dengan kondisi fisik langka).
   - Kejadian Nyata yang Penuh Ironi & Plot Twist Menggelitik.
3. KATEGORI: Klasifikasikan ke salah satu: "Kasus Unik" | "Fenomena Nyata" | "Kisah Ekstrem" | "Sosial & Manusia" | "Tradisi & Perilaku".
4. GAYA BAHASA: Lugas, santai, memancing rasa heran penonton, anti-vulgar, dan anti-lebay.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas Jurnal Kumal (Menyoroti Keanehan Kasus/Orang Secara Lugas)",
      "kategori": "Kasus Unik",
      "penjelasan": "Uraian 2-3 kalimat mengenai siapa tokohnya, di negara mana terjadinya, dan apa keanehan/ironi kasusnya.",
      "skor": { "total": 49 },
      "alasanKelulusan": "Alasan kenapa topik ini 100% sesuai karakter Jurnal Kumal."
    }
  ]
}`;
    } else if (isProfileMode) {
      // 💡 SYSTEM PROMPT DINAMIS UNTUK DAFIOLOGY / CHANNEL LAIN
      systemPrompt = `Kamu adalah Lead Content Strategist & Topic Architect untuk YouTube Shorts channel "${channelName}".
Tugasmu adalah mereplikasi DNA gaya konten, tema pembahasan, dan pola judul channel "${channelName}" berdasarkan contoh naskah aslinya.

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Khas ${channelName}",
      "kategori": "Asal-Usul Benda", // Pilih: "Asal-Usul Benda" | "Profesi Kuno" | "Tradisi & Perilaku" | "Peristiwa & Taktik"
      "penjelasan": "Uraian 2-3 kalimat fakta otentik.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50."
    }
  ]
}`;
    } else {
      // MODE TANPA REFERENSI
      systemPrompt = `Kamu adalah Lead Content Strategist untuk YouTube Shorts spesialis kategori "${kategori}".

FORMAT JSON OUTPUT PERSIS:
{
  "candidates": [
    {
      "judul": "Judul Menarik & Konkret",
      "kategori": "Tradisi & Perilaku",
      "penjelasan": "Uraian singkat fakta otentik.",
      "skor": { "total": 48 },
      "alasanKelulusan": "Alasan kelulusan skor >= 40/50."
    }
  ]
}`;
    }

    const userPrompt = `${referenceContextText}
${riwayatTopikText}
${blacklistText}
${tavilyContext}

INSTRUKSI EKSEKUSI:
Hasilkan ${jumlah} ide topik video YouTube Shorts yang 100% MENIRU KARAKTER CHANNEL "${channelName || kategori}".
${isJurnalKumal ? "⛔ INGAT: Jurnal Kumal BUKAN sejarah kuno! Wajib fokus pada Kasus Nyata Unik Dunia, Fenomena Manusia Ekstrem, dan Ironi Nyata." : ""}
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
