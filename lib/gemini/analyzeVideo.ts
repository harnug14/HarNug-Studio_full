// Mengirim URL video YouTube langsung ke Gemini untuk dianalisis mendalam
// Gemini "menonton" video (visual + audio) tanpa perlu transkrip terpisah

import { GeminiQuotaError } from "./keyRotation";
import { DEFAULT_GEMINI_MODEL } from "../config";

export interface VideoAnalysis {
  niche: string;
  visual: string;
  editing: string;
  hookCta: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeVideo(
  videoUrl: string,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL
): Promise<VideoAnalysis> {
  const prompt = `Analisis video YouTube Shorts ini secara mendalam. Tonton visual dan dengarkan audionya, lalu berikan hasil analisis dalam format JSON PERSIS seperti ini (tanpa markdown, tanpa backtick, hanya JSON murni):

{
  "niche": "niche dan sub-topik video ini, jelaskan singkat",
  "visual": "konsep visual dan angle kamera yang dipakai, jelaskan singkat",
  "editing": "teknik dan gaya editing: pacing, sound effect, gaya teks, keyframe, motion graphic, jelaskan singkat",
  "hookCta": "pola hook di awal dan call-to-action di akhir, jelaskan singkat"
}

PENTING: Jawab berdasarkan apa yang BENAR-BENAR kamu lihat dan dengar di video ini secara spesifik dan konkret (warna, gerakan kamera, jenis teks overlay, momen tertentu, dsb). JANGAN memberi jawaban generik/template yang bisa berlaku untuk video Shorts manapun. Sebutkan detail konkret yang membuktikan kamu benar-benar menonton video ini.`;

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
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  file_data: {
                    mime_type: "video/*",
                    file_uri: videoUrl,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const rawText: string =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      const cleaned = rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

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
          `Gagal parse hasil analisis Gemini: ${cleaned.slice(0, 200)}`
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

  throw lastError || new Error("Gagal menganalisis video setelah beberapa percobaan");
}