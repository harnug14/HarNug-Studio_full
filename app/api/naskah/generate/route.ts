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

    let targetProfileId = referenceProfileId;

    // Safety fallback: jika dipanggil dari topik lama dan ID belum terpilih di UI
    if (!targetProfileId && topikId) {
      const { data: topikRow } = await supabase
        .from("topik")
        .select("catatan")
        .eq("id", topikId)
        .single();

      if (topikRow?.catatan) {
        const matches = Array.from(topikRow.catatan.matchAll(/\[(.*?)\]/g)).map((m) => m[1].trim());
        if (matches.length > 0) {
          const candidateName = matches.length >= 2 ? matches[1] : matches[0];
          const { data: foundProfile } = await supabase
            .from("channel_analysis")
            .select("id")
            .eq("user_id", user.id)
            .ilike("profile_name", candidateName)
            .maybeSingle();

          if (foundProfile) {
            targetProfileId = foundProfile.id;
          }
        }
      }
    }

    // 1. Eksekusi paralel Supabase & Riset Fakta Real-Time Tavily
    const tavilyQuery = `kronologi fakta detail sejarah nyata asal usul ${cleanJudul}`;

    const [profileRes, tavilyRes] = await Promise.all([
      targetProfileId
        ? supabase
            .from("channel_analysis")
            .select("*, channel_analysis_entries(*)")
            .eq("id", targetProfileId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      fetchTavilyFast(tavilyQuery, 4500),
    ]);

    let isProfileMode = false;
    let channelName = "Framework Murni";
    let referenceContextText = "";

    // 2. Ekstraksi naskah asli dari database Supabase
    if (profileRes.data && profileRes.data.channel_analysis_entries?.length > 0) {
      isProfileMode = true;
      channelName = profileRes.data.profile_name || "Referensi";

      const entries = profileRes.data.channel_analysis_entries;

      const samples = entries
        .map((e: any, idx: number) => {
          const entryTitle = e.title || e.video_title || e.judul || `Video Asli ${idx + 1}`;
          const fullScript =
            e.full_script || e.script || e.naskah || e.transcript || e.content || "";
          return `--- CONTOH NASKAH ASLI YOUTUBE ${idx + 1} (${channelName}) ---\nJudul Asli: "${entryTitle}"\nNaskah Utuh:\n${fullScript}`;
        })
        .join("\n\n====================\n\n");

      referenceContextText = `\n\n=== CETAK BIRU NASKAH ASLI YOUTUBE DARI CHANNEL "${channelName}" (ACUAN GAYA & RITME MUTLAK) ===\n${samples}`;
    }

    // 3. Konteks Fakta Real-Time Tavily
    const tavilyContext = tavilyRes
      ? `\n\n[FAKTA SEJARAH OTENTIK HASIL RISET WEB REAL-TIME]:\n${tavilyRes}\n\n(Gunakan fakta di atas sebagai bahan isi cerita: kronologi, tahun, tokoh, dan fakta peristiwa).`
      : "";

    // 4. System Prompt & Persona Cloning Engine
    const systemPrompt = isProfileMode
      ? `Kamu adalah Penulis Naskah dan Narator Persona Resmi dari channel YouTube "${channelName}".
TUGAS UTAMA:
Tulis naskah YouTube Shorts berdurasi 45-60 detik (130-160 kata) untuk topik baru: "${escapedJudul}".
Naskah ini HARUS terasa 100% seperti ditulis oleh orang yang sama yang membuat contoh-contoh naskah asli channel "${channelName}" di bawah.

INSTRUKSI MENIRU GAYA CHANNEL "${channelName}":
1. HOOK PEMBUKA (0-5s): Tiru cara channel "${channelName}" membuka video di 3 detik pertama (langsung masuk ke fakta aneh/kontras/aksi tanpa basa-basi). DILARANG menggunakan pertanyaan klise AI seperti "Tahukah kamu", "Pernahkah kamu membayangkan", dll.
2. RITME & TEMPO: Tiru panjang kalimat lisan naratif, pilihan diksi, tempo bicara, dan cara channel "${channelName}" menyambung kalimat demi kalimat.
3. INTEGRASI FAKTA: Ambil fakta peristiwa dari data riset web Tavily terlampir, lalu ceritakan ulang menggunakan bahasa bertutur khas channel "${channelName}".
4. PANJANG KATA: WAJIB berkisar antara 130 hingga 160 kata (pas untuk durasi voiceover 45-60 detik).
5. FORMAT NASKAH: Narasi suara/voiceover murni. DILARANG menyisipkan tanda kurung adegan visual seperti [Visual:], [Scene:], [Music:], dsb.

FORMAT JSON OUTPUT PERSIS:
{
  "judul": "${escapedJudul}",
  "isiNaskah": "Teks naskah voiceover utuh 130-160 kata dari awal hingga akhir...",
  "hook": "Kalimat pembuka hook",
  "ending": "Kalimat penutup",
  "wordCount": 145,
  "estimasiDurasi": "50 detik"
}`
      : `Kamu adalah Scriptwriter YouTube Shorts profesional bertema curious history & fakta unik.
TUGAS: Tulis naskah YouTube Shorts berdurasi ${targetPanjang} dengan nada suara "${tone}" untuk topik: "${escapedJudul}".

ATURAN:
- Target kata 130-160 kata (45-60 detik).
- Narasi suara/voiceover murni tanpa tanda kurung adegan visual.
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

${catatanTopik ? `[Catatan Konteks]:\n${catatanTopik}\n` : ""}
INSTRUKSI:
Tulis naskah video YouTube Shorts baru untuk topik: "${escapedJudul}".
Tiru 100% gaya bahasa, hook, ritme, dan karakter penceritaan dari contoh naskah asli channel "${channelName}" di atas.
Output murni format JSON valid.`
      : `${tavilyContext}
${catatanTopik ? `[Catatan Konteks]:\n${catatanTopik}\n` : ""}
INSTRUKSI:
Tulis naskah YouTube Shorts untuk topik: "${escapedJudul}" dengan tone "${tone}" dan durasi "${targetPanjang}".
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

    // 5. Simpan naskah baru ke database Supabase
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
