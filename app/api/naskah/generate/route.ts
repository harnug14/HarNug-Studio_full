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
      topikId = null,
      judulTopik = "",
      catatanTopik = "",
      tone = "Natural & Antusias",
      targetPanjang = "45-60 detik (130-160 kata)",
      referenceProfileId = null,
    } = await req.json();

    if (!judulTopik) {
      return NextResponse.json({ error: "Judul topik wajib ada untuk membuat naskah" }, { status: 400 });
    }

    let referenceContextText = "";
    let isProfileMode = false;
    let channelName = "Framework Murni";

    if (referenceProfileId) {
      const { data: channelProfile } = await supabase
        .from("channel_analysis")
        .select("profile_name, channel_analysis_entries(title, full_script)")
        .eq("id", referenceProfileId)
        .single();

      if (channelProfile && channelProfile.channel_analysis_entries?.length) {
        isProfileMode = true;
        channelName = channelProfile.profile_name;
        
        const samples = channelProfile.channel_analysis_entries
          .map((e: any, idx: number) => `[CONTOH NASKAH ASLI ${idx + 1} (${e.title})]:\n"${e.full_script || ""}"`)
          .join("\n\n---\n\n");

        referenceContextText = `\n\n=== CONTOH POLA & GAYA BAHASA ASLI CHANNEL "${channelName}" ===\n${samples}`;
      }
    }

    // 💡 TAVILY: RISET FAKTA KRONOLOGI OTENTIK BERDASARKAN JUDUL TOPIK
    let tavilyContext = "";
    try {
      const searchQuery = `fakta detail kronologi peristiwa ${judulTopik} ${catatanTopik || ""}`.trim();
      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA & KRONOLOGI RISET WEB VIA TAVILY]:\n${tavilyRes}\n\nATURAN WAJIB AKURASI: Susun alur cerita, nama tokoh, tahun, dan peristiwa berdasarkan fakta otentik di atas (100% fakta nyata, dilarang halusinasi).`;
      }
    } catch (e) {
      console.warn("[Naskah] Tavily fallback:", e);
    }

    const systemPrompt = `Kamu adalah Scriptwriter & Narrative Strategist tingkat dunia untuk YouTube Shorts.
Tugasmu adalah menyusun NASKAH UTUH YouTube Shorts berkualitas tinggi yang mengalir sangat natural, organik, dan berbobot berdasarkan fakta nyata.

--- ATURAN MUTLAK KUALITAS PENULISAN (MANDATORI) ---
1. MENELURUSI DAN MENELIMINASI SEMUA FRASA AI KLISE / TEMPLATE:
   - DILARANG KERAS MENGGUNAKAN KALIMAT TEMPLATE AI KLISE pada Hook, Transisi, maupun Ending, seperti:
     * "Pernahkah kamu membayangkan..."
     * "Tahukah kamu..."
     * "Di video kali ini..."
     * "Bayangkan jika..."
     * "Penasaran kan?"
     * "Simak sampai habis..."
     * "Jangan lupa like dan subscribe"
     * "Siapa sangka..."
     * "Usut punya usut..."
     * "Ternyata oh ternyata..."
   - HOOK (0-5s): Harus langsung masuk ke inti masalah, kontradiksi, atau kejutan cerita secara natural dan dramatis tanpa pertanyaan klise.
   - TRANSISI: Alur transisi antar kalimat mengalir mulus tanpa jembatan kata buatan yang kaku khas AI.
   - ENDING: Penutup klimaks, punchline kuat, atau kesimpulan berkesan tanpa ajakan berlangganan generik.

2. ATURAN DIKSI & LARANGAN KATA INFORMAL SLANG:
   - DILARANG KERAS MENGGUNAKAN KATA "gue", "gua", "gwe", "lu", "loe", "eloh", MAUPUN VARIASINYA DALAM BENTUK APA PUN.
   - Gunakan ragam bahasa tutur Indonesia yang natural, hidup, lugas, santai namun tetap berbobot ("kamu", "Anda", atau tuturan naratif langsung).

3. ADOPSI POLA REFERENCE ANALYSIS (APABILA ADA REFERENSI):
   - Jika naskah referensi channel diberikan, serap dan tiru DNA penulisan tersebut: gaya bertutur, pilihan kata, ritme per kalimat, dan dinamika khas channel "${channelName}".

4. STRUKTUR NASKAH (Durasi ${targetPanjang}):
   - [HOOK 0-5s]: Pembuka berdampak tinggi, murni naratif.
   - [TIMELINE / ISI]: Alur cerita selalu maju secara kronologis/logis per 1-3 kalimat.
   - [ENDING]: Penutup klimaks atau kesimpulan berkesan.

5. FORMAT OUTPUT JSON PERSIS (pure JSON object):
{
  "judul": "Naskah - ${judulTopik.replace(/"/g, "'")}",
  "isiNaskah": "Naskah lengkap dari Hook hingga Ending...",
  "hook": "Kalimat Hook saja",
  "ending": "Kalimat Ending saja",
  "selfReview": "Evaluasi singkat AI mengenai kekuatan naskah, alur kronologis, dan ritme kalimat.",
  "sumberCatatan": "Catatan fakta/sumber jika ada"
}`;

    const userPrompt = isProfileMode
      ? `Detail Topik Naskah:
- Judul Topik: ${judulTopik}
- Catatan / Konteks: ${catatanTopik || "Tidak ada"}
${referenceContextText}${tavilyContext}

Instruksi Tambahan:
Gunakan contoh-contoh naskah channel "${channelName}" di atas untuk mengadopsi tone suara, ritme kalimat, kepanjangan/durasi, serta gaya bertuturnya secara persis. Patuhi seluruh aturan anti-klise dan larangan kata "gue/lu". Buatkan Script Draft terbaik dalam format JSON murni.`
      : `Detail Topik Naskah (Manual):
- Judul Topik: ${judulTopik}
- Catatan / Konteks: ${catatanTopik || "Tidak ada"}
- Tone Suara: ${tone}
- Target Panjang / Durasi: ${targetPanjang}${tavilyContext}

Buatkan Script Draft terbaik mengikuti aturan kualitas penulisan tinggi di atas sekarang dalam format JSON murni.`;

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

    const defaultTitle = `Naskah - ${judulTopik}`;
    const parsedData: any = parseJsonResponse(rawResponse, {
      judul: defaultTitle,
      isiNaskah: rawResponse,
    });

    const scriptText = parsedData.isiNaskah || rawResponse;

    const { data: newNaskah, error: insertErr } = await supabase
      .from("naskah")
      .insert({
        user_id: user.id,
        judul: parsedData.judul || defaultTitle,
        isi_naskah: scriptText,
        sumber_topik_id: topikId || null,
        status: "draft",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Error auto-saving naskah:", insertErr);
    }

    return NextResponse.json({
      data: newNaskah || {
        judul: parsedData.judul || defaultTitle,
        isi_naskah: scriptText,
        status: "draft",
      },
      parsed: parsedData,
    });
  } catch (err: any) {
    console.error("Error generating script:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat naskah" },
      { status: 500 }
    );
  }
}
