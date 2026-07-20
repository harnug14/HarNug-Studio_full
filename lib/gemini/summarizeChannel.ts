// Merangkum 10 hasil analisis video individual jadi satu kesimpulan level channel

import { VideoAnalysis } from "./analyzeVideo";
import { GeminiQuotaError } from "./keyRotation";

export interface ChannelSummary {
  niche: string;
  visual: string;
  editing: string;
  hookCta: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function summarizeChannel(
  analyses: VideoAnalysis[],
  apiKey: string,
  model: string = "gemini-2.5-flash"
): Promise<ChannelSummary> {
  const combinedText = analyses
    .map(
      (a, i) =>
        `Video ${i + 1}:\nNiche: ${a.niche}\nVisual: ${a.visual}\nEditing: ${a.editing}\nHook/CTA: ${a.hookCta}`
    )
    .join("\n\n");

  const prompt = `Berikut adalah hasil analisis ${analyses.length} video terpopuler dari sebuah channel YouTube:

${combinedText}

Berdasarkan semua analisis di atas, buat SATU kesimpulan menyeluruh untuk channel ini secara keseluruhan (bukan per video, tapi pola yang konsisten muncul di semua/sebagian besar video). Balas dalam format JSON PERSIS seperti ini (tanpa markdown, tanpa backtick, hanya JSON murni):

{
  "niche": "kesimpulan niche dan sub-topik utama channel ini",
  "visual": "kesimpulan konsep visual dan angle kamera yang konsisten dipakai channel ini",
  "editing": "kesimpulan gaya editing khas channel ini: pacing, sound effect, gaya teks, keyframe, motion graphic",
  "hookCta": "kesimpulan pola hook dan call-to-action yang berulang di channel ini"
}`;

  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 5000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const rawText: string =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = rawText.replace(/```json|```/g, "").trim();

      try {
        const parsed = JSON.parse(cleaned);
        return {
          niche: parsed.niche || "",
          visual: parsed.visual || "",
          editing: parsed.editing || "",
          hookCta: parsed.hookCta || "",
        };
      } catch (e) {
        throw new Error(
          `Gagal parse hasil rangkuman Gemini: ${cleaned.slice(0, 200)}`
        );
      }
    }

    const errText = await response.text();

    if (response.status === 429) {
      if (errText.toLowerCase().includes("quota")) {
        throw new GeminiQuotaError(
          `Gemini API quota exceeded (429) - ${errText.slice(0, 200)}`
        );
      } else {
        if (attempt < MAX_RETRIES) {
          lastError = new Error(`Gemini API Rate Limit (429) - mencoba lagi...`);
          await sleep(20000); // 20 detik
          continue;
        } else {
          throw new Error(`Terlalu sering request (Rate Limit 429). Mohon tunggu beberapa saat.`);
        }
      }
    }

    if (response.status === 503 && attempt < MAX_RETRIES) {
      lastError = new Error(
        `Gemini API 503 (percobaan ${attempt + 1}/${MAX_RETRIES + 1}) - server sibuk, mencoba lagi...`
      );
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  throw lastError || new Error("Gagal merangkum channel setelah beberapa percobaan");
}