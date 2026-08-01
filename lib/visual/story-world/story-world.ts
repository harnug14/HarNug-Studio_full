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

function getSafeString(val: unknown, fallback: string = ""): string {
  if (typeof val === "string") return val.trim();
  return fallback;
}

/**
 * STEP 1: STORY WORLD MODULE
 * ADR RULE: "Story World decides what exists."
 * Tanggung Jawab: Murni mengekstrak fakta cerita, era sejarah, dan kebenaran naratif (Canon).
 * DILARANG MEMBAHAS: Kamera, Pose, Aset, Prompt, atau Vendor AI.
 */
export async function extractStoryWorld(
  supabase: unknown,
  input: StoryWorldInput
): Promise<StoryWorldContext> {
  const safeNaskah = getSafeString(input?.isiNaskah, "");
  const safeJudul = getSafeString(input?.judulNaskah, "Tanpa Judul");
  const wordCount = safeNaskah ? safeNaskah.split(/\s+/).filter(Boolean).length : 0;

  if (!safeNaskah) {
    throw new Error("[StoryWorld] Isi naskah tidak boleh kosong");
  }

  const systemPrompt = `Kamu adalah HARNUG STUDIO V4 — STORY WORLD MODULE (PURE NARRATIVE TRUTH).

ADR RULE: Story World decides what exists.
Tugasmu MURNI mengekstrak fakta dunia cerita dari naskah.

DILARANG SAMA SEKALI MEMBAHAS:
- Kamera (Wide, Close-Up, Zoom, Angle)
- Pose / Motion / Gerakan
- Aset / Prompt / Vendor AI
- Directorial / Sinematografi

FORMAT JSON OUTPUT (MURNI BAHASA INDONESIA):
{
  "storySummary": "Ringkasan fakta cerita utama",
  "primaryEra": "Era sejarah atau setting dunia utama",
  "coreIdea": "Gagasan inti dunia cerita",
  "storyGoal": "Tujuan atau konflik utama cerita",
  "narrativeCanonFacts": [
    "Fakta 1: Latar era sejarah...",
    "Fakta 2: Karakter utama..."
  ]
}`;

  const userPrompt = `Judul: "${safeJudul}"\nNaskah (${wordCount} kata):\n"${safeNaskah}"\n\nEkstrak fakta Story World murni (format JSON murni).`;

  let lastError: unknown = null;

  for (const currentModel of GEMINI_FALLBACK_MODELS) {
    try {
      const rawResponse = await callGeminiWithRotation(supabase, async (apiKey: string) => {
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
        return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      });

      if (rawResponse) {
        try {
          const parsed = parseJsonResponse(rawResponse, {});
          return {
            storySummary: getSafeString(parsed?.storySummary, "Ringkasan cerita"),
            primaryEra: getSafeString(parsed?.primaryEra, "Era Sejarah"),
            wordCount,
            coreIdea: getSafeString(parsed?.coreIdea, "Gagasan utama"),
            storyGoal: getSafeString(parsed?.storyGoal, "Tujuan cerita"),
            narrativeCanonFacts: Array.isArray(parsed?.narrativeCanonFacts)
              ? parsed.narrativeCanonFacts.map((f: unknown) => getSafeString(f)).filter(Boolean)
              : ["Fakta cerita awal"],
          };
        } catch (parseErr) {
          console.error("[StoryWorld] JSON Parse Error:", parseErr);
        }
      }
    } catch (err: unknown) {
      lastError = err;
      await delay(1000);
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : "Internal Error";
  throw new Error(`[StoryWorld] Gagal mengekstrak Story World: ${errMsg}`);
}