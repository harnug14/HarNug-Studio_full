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
          temperature: 0.75,
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

// Timeout helper mandiri untuk Tavily agar aman dari batas Vercel
async function fetchTavilyFast(query: string, timeoutMs = 4500): Promise<string> {
  if (!query || !query.trim()) return "";
  try {
    const tavilyPromise = fetchTavilySearchResults(query);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Tavily timeout")), timeoutMs)
    );
    return await Promise.race([tavilyPromise, timeoutPromise]);
  } catch (e) {
    console.warn("[Naskah] Tavily search fallback:", e);
    return "";
  }
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
      topikId = null,
      judulTopik = "",
      catatanTopik = "",
      tone = "Natural & Antusias",
      targetPanjang = "45-60 detik (130-160 kata)",
      referenceProfileId = null,
    } = await req.json();

    if (!judulTopik || !judulTopik.trim()) {
      return NextResponse.json(
        { error: "Judul topik wajib diisi" },
        { status: 400 }
      );
    }

    const cleanJudul = judulTopik.trim();
    const escapedJudul = cleanJudul.replace(/"/g, "'");

    // 1. Eksekusi paralel Supabase & Riset Tavily
    const tavilyQuery = `kronologi fakta detail sejarah nyata asal usul ${cleanJudul}`;

    const [profileRes, tavilyRes] = await Promise.all([
      referenceProfileId
        ? supabase
            .from("channel_analysis")
            .select("*, channel_analysis_entries(*)")
            .eq("id", referenceProfileId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      fetchTavilyFast(tavilyQuery, 4500),
    ]);

    let isProfileMode = false;
    let channelName = "Framework Murni";
    let referenceContextText = "";

    // 2. Ekstraksi naskah asli dari database
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length > 0) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name || "Referensi";

      const entries = profileRes.data.channel_analysis_entries;

      const samples = entries
        .map((e: any, idx: number) => {
          const entryTitle = e.title || e.video_title || e.judul || `Contoh ${idx + 1}`;
          const fullScript =
            e.full_script || e.script || e.naskah || e.transcript || e.content || "";
          return `[CONTOH NASKAH ASLI ${idx + 1} - "${channelName}"]:\nJudul: "${entryTitle}"\nNaskah Utuh:\n${fullScript}`;
        })
        .join("\n\n---\n\n");

      referenceContextText = `\n\n=== CONTOH NASKAH ASLI ACUAN UTAMA CHANNEL "${channelName}" ===\n${samples}`;
    }

    // 3. Konteks Fakta Web Real-Time
    const tavilyContext = tavilyRes
      ? `\n\n[DATA FAKTA KRONOLOGI RISET WEB REAL-TIME TAVILY]:\n${tavilyRes}\n\nGunakan fakta otentik di atas sebagai rujukan detail peristiwa, nama tokoh, dan tahun.`
      : "";

    // 4. System Prompt & Instruksi
    const systemPrompt = isProfileMode
      ? `Kamu adalah Scriptwriter Profesional YouTube Shorts.
TUGAS UTAMA:
Tulis naskah YouTube Shorts berdurasi 45-60 detik (130-160 kata) untuk topik video: "${escapedJudul}".
TIRU 100% GAYA BAHASA, NADA BICARA, RITME KALIMAT, DAN STRUKTUR PENCERITAAN DARI CONTOH NASKAH ASLI CHANNEL "${channelName}" DI BAWAH.

ATURAN PENULISAN:
- Serap dan adopsi gaya pembuka (hook), cara penyampaian fakta, dan gaya penutup khas channel "${channelName}".
- Panjang naskah WAJIB 130 hingga 160 kata (pas untuk voiceover 45-60 detik).
- Gunakan bahasa tutur Indonesia yang natural, hidup, mengalir, dan memikat pendengar.
- Fakta cerita harus akurat berdasarkan data riset web yang dilampirkan.
- HANYA hasilkan teks voiceover murni. DILARANG menyisipkan label adegan seperti [Visual:], [Scene:], atau tanda kurung.

FORMAT JSON OUTPUT PERSIS:
{
  "judul": "${escapedJudul}",
  "isiNaskah": "Teks naskah voiceover utuh 130-160 kata dari awal hingga akhir...",
  "hook": "Kalimat pembuka hook",
  "ending": "Kalimat penutup",
  "wordCount": 145,
  "estimasiDurasi": "50 detik"
}`
      : `Kamu adalah Scriptwriter Profesional YouTube Shorts bertema curious history & fakta unik.
TUGAS: Tulis naskah YouTube Shorts berdurasi ${targetPanjang} dengan nada suara "${tone}" untuk topik: "${escapedJudul}".

ATURAN:
- Panjang naskah 130-160 kata (45-60 detik).
- Narasi suara/voiceover murni tanpa label adegan/tanda kurung.
- Mengalir alami, memikat, dan akurat secara fakta.

FORMAT JSON OUTPUT PERSIS:
{
  "judul": "${escapedJudul}",
  "isiNaskah": "Teks naskah voiceover utuh 130-160 kata...",
  "hook": "Kalimat pembuka hook",
  "ending": "Kalimat penutup",
  "wordCount": 145,
  "estimasiDurasi": "50 detik"
}`;

    const userPrompt = isProfileMode
      ? `${referenceContextText}
${tavilyContext}

${catatanTopik ? `[Catatan/Konteks Topik]:\n${catatanTopik}\n` : ""}
INSTRUKSI:
Tulis naskah YouTube Shorts untuk topik: "${escapedJudul}".
Pastikan naskah mengadopsi gaya bahasa, ritme, dan karakter storytelling dari channel "${channelName}" di atas.
Output format JSON valid.`
      : `${tavilyContext}
${catatanTopik ? `[Catatan/Konteks Topik]:\n${catatanTopik}\n` : ""}
INSTRUKSI:
Tulis naskah YouTube Shorts untuk topik: "${escapedJudul}" dengan tone "${tone}" dan target durasi "${targetPanjang}".
Output format JSON valid.`;

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

    const parsedData: any = parseJsonResponse(rawResponse, {
      judul: cleanJudul,
      isiNaskah: rawResponse,
    });

    const scriptText = (parsedData.isiNaskah || rawResponse || "").trim();

    if (!scriptText) {
      return NextResponse.json(
        { error: "Gagal menghasilkan teks naskah dari AI" },
        { status: 500 }
      );
    }

    // 5. Simpan ke database Supabase
    const { data: newNaskah, error: insertErr } = await supabase
      .from("naskah")
      .insert({
        user_id: user.id,
        judul: cleanJudul,
        isi_naskah: scriptText,
        sumber_topik_id: topikId || null,
        status: "draft",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[Naskah DB Insert Error]:", insertErr);
    }

    return NextResponse.json({
      data: newNaskah || {
        id: "temp-" + Date.now(),
        judul: cleanJudul,
        isi_naskah: scriptText,
        sumber_topik_id: topikId || null,
        status: "draft",
        created_at: new Date().toISOString(),
      },
      parsed: parsedData,
    });
  } catch (err: any) {
    console.error("[Naskah API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat naskah" },
      { status: 500 }
    );
  }
}
