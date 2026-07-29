import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";

// Hirarki Model Gemini (Engine Utama: gemini-3.6-flash | Batas Minimum: gemini-2.5-flash)
const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-pro",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGeminiApiWithFallback(
  supabase: any,
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  let lastError: any = null;

  for (const currentModel of GEMINI_FALLBACK_MODELS) {
    try {
      const rawResponse = await callGeminiWithRotation(supabase, async (apiKey) => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              systemInstruction: { parts: [{ text: systemPrompt }] },
              generationConfig: {
                responseMimeType: "application/json",
              },
            }),
          }
        );

        if (!response.ok) {
          if (response.status === 429) throw new GeminiQuotaError(`Gemini rate-limited (429)`);
          throw new Error(`Gemini Error: ${response.status}`);
        }

        const json = await response.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      });

      if (rawResponse) return rawResponse;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.response?.status;
      const isRetryable = status === 503 || status === 429 || err?.message?.includes("503") || err?.message?.includes("429");

      if (isRetryable) {
        await delay(1500);
        try {
          const rawRetryResponse = await callGeminiWithRotation(supabase, async (apiKey) => {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                  systemInstruction: { parts: [{ text: systemPrompt }] },
                  generationConfig: {
                    responseMimeType: "application/json",
                  },
                }),
              }
            );

            if (!response.ok) {
              if (response.status === 429) throw new GeminiQuotaError(`Gemini rate-limited (429)`);
              throw new Error(`Gemini Error: ${response.status}`);
            }

            const json = await response.json();
            return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
          });

          if (rawRetryResponse) return rawRetryResponse;
        } catch (retryErr: any) {
          lastError = retryErr;
        }
      }
    }
  }

  throw new Error(`Gagal membuat naskah: ${lastError?.message || "Internal Server Error"}`);
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
      targetPanjang = "45-60 detik (sekitar 130-160 kata)",
      referenceProfileId = null,
    } = await req.json();

    if (!judulTopik) {
      return NextResponse.json({ error: "Judul topik wajib ada untuk membuat naskah" }, { status: 400 });
    }

    let referenceContextText = "";
    let isProfileMode = false;

    if (referenceProfileId) {
      const { data: channelProfile } = await supabase
        .from("channel_analysis")
        .select("profile_name, channel_analysis_entries(title, full_script)")
        .eq("id", referenceProfileId)
        .single();

      if (channelProfile && channelProfile.channel_analysis_entries?.length) {
        isProfileMode = true;
        const samples = channelProfile.channel_analysis_entries
          .map((e: any, idx: number) => `Contoh Naskah ${idx + 1} (${e.title}):\n"${e.full_script}"`)
          .join("\n\n---\n\n");
        referenceContextText = `\n\nCONTOH REFERENSI KALIBRASI NASKAH CHANNEL ("${channelProfile.profile_name}"):\n${samples}`;
      }
    }

    const systemPrompt = `Kamu adalah seorang Scriptwriter & Narrative Strategist tingkat dunia untuk YouTube Shorts.
Tugasmu adalah membuat NASKAH UTUH untuk video YouTube Shorts berdasarkan topik yang diberikan.

--- ATURAN STRUKTUR NASKAH (MANDATORI) ---
1. STRUKTUR UTAMA WAKTU (Linear Forward Timeline):
   - [HOOK 0-5s]: Kalimat pembuka yang memicu rasa penasaran kuat, tanpa basa-basi.
   - [TIMELINE / ISI UTAMA]: Alur cerita selalu maju secara kronologis/logis (jangan melompat-lompat).
   - [ENDING]: Penutup klimaks atau pertanyaan terbuka / punchline yang berkesan.
   - [SELF REVIEW]: Evaluasi singkat AI terhadap alur naskah ini.

2. ATURAN GAYA & RITME KALIMAT:
   - Gunakan KALIMAT PENDEK dan JELAS. Jangan gunakan kalimat majemuk panjang yang berbelit-belit.
   - SETIAP 1-3 KALIMAT HARUS MENANDAI 1 PERUBAHAN SITUASI / PERISTIWA (ini akan menjadi acuan visual storyboard).
   - Tulis dengan gaya bertutur natural seperti bercerita langsung ke audiens (bukan membaca artikel wikipedia).
   - Fakta HARUS akurat, spesifik (tahun, nama tokoh, nama lokasi jika ada).

3. FORMAT OUTPUT JSON PERSIS TANPA MARKDOWN MARKUP LAIN (pure JSON object):
{
  "judul": "Naskah - ${judulTopik.replace(/"/g, "'")}",
  "isiNaskah": "Naskah lengkap yang siap dibacakan, dari Hook hingga Ending...",
  "hook": "Kalimat Hook saja",
  "ending": "Kalimat Ending saja",
  "selfReview": "Self review AI mengenai kekuatan naskah, alur kronologis, dan ritme per 1-3 kalimat.",
  "sumberCatatan": "Catatan fakta/sumber jika ada"
}`;

    const userPrompt = isProfileMode
      ? `Detail Topik Naskah:
- Judul Topik: ${judulTopik}
- Catatan / Konteks Topik: ${catatanTopik || "Tidak ada"}
${referenceContextText}

Instruksi Tambahan:
Gunakan contoh-contoh naskah kalibrasi channel di atas untuk mengadopsi tone suara, ritme kalimat, kepanjangan/durasi, serta gaya bertutur channel tersebut secara persis. Buatkan Script Draft terbaik mengikuti aturan di atas sekarang dalam format JSON murni.`
      : `Detail Topik Naskah (Manual):
- Judul Topik: ${judulTopik}
- Catatan / Konteks Topik: ${catatanTopik || "Tidak ada"}
- Tone Suara: ${tone}
- Target Panjang / Durasi: ${targetPanjang}

Buatkan Script Draft terbaik mengikuti aturan di atas sekarang dalam format JSON murni.`;

    const rawResponse = await callGeminiApiWithFallback(
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