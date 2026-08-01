import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { StoryWorldContext, StoryWorldInput } from "../types";

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * STEP 1: STORY WORLD MODULE
 * ADR RULE: "Story World decides what exists."
 * Tanggung Jawab: Murni mengekstrak fakta cerita, era sejarah, dan kebenaran naratif (Canon).
 * DILARANG MEMBAHAS: Kamera, Pose, Aset, Prompt, atau Vendor AI.
 */
export async function extractStoryWorld(
  supabase: any,
  input: StoryWorldInput
): Promise<StoryWorldContext> {
  const { isiNaskah, judulNaskah = "" } = input;
  const wordCount = isiNaskah.trim().split(/\s+/).filter(Boolean).length;

  const systemPrompt = `Kamu adalah HARNUG STUDIO V4 — STORY WORLD MODULE (PURE NARRATIVE TRUTH).

ADR RULE: Story World decides what exists.
Tugasmu MURNI mengekstrak fakta dunia cerita dari naskah.

DILARANG SAMA SEKALI MEMBAHAS:
- Kamera (Wide, Close-Up, Zoom, Angle)
- Pose / Motion / Gerakan
- Aset / Prompt / Vendor AI
- Directorial / Sinematografi

TUGAS UTAMA:
1. Pahami fakta cerita murni dan era sejarah utama.
2. Identifikasi Canon Facts (fakta permanen lokasi, karakter, era, dan kondisi dunia cerita).

FORMAT JSON OUTPUT (MURNI BAHASA INDONESIA):
{
  "storySummary": "Ringkasan fakta cerita utama",
  "primaryEra": "Era sejarah atau setting dunia utama",
  "coreIdea": "Gagasan inti dunia cerita",
  "storyGoal": "Tujuan atau konflik utama cerita",
  "narrativeCanonFacts": [
    "Fakta 1: Latar era sejarah...",
    "Fakta 2: Karakter utama...",
    "Fakta 3: Kondisi lingkungan..."
  ]
}`;

  const userPrompt = `Judul: "${judulNaskah}"\nNaskah (${wordCount} kata):\n"${isiNaskah}"\n\nEkstrak fakta Story World murni (format JSON murni).`;

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
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );

        if (!response.ok) {
          if (response.status === 429) throw new GeminiQuotaError("Gemini rate-limited (429)");
          throw new Error(`Gemini Error: ${response.status}`);
        }

        const json = await response.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      });

      if (rawResponse) {
        const parsed = parseJsonResponse(rawResponse, {});
        return {
          storySummary: parsed.storySummary || "Ringkasan cerita",
          primaryEra: parsed.primaryEra || "Era Sejarah",
          wordCount,
          coreIdea: parsed.coreIdea || "Gagasan utama",
          storyGoal: parsed.storyGoal || "Tujuan cerita",
          narrativeCanonFacts: Array.isArray(parsed.narrativeCanonFacts) ? parsed.narrativeCanonFacts : [],
        };
      }
    } catch (err: any) {
      lastError = err;
      await delay(1000);
    }
  }

  throw new Error(`[StoryWorld] Gagal mengekstrak Story World: ${lastError?.message || "Internal Server Error"}`);
}