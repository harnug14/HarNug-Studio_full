import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { StoryWorldContext, VisualBeatShot, DirectorialSpec } from "../types";

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * STEP 3: DIRECTORIAL INTENT MODULE
 * ADR RULE: "Directorial Intent decides how it should be seen."
 * Tanggung Jawab: Murni menentukan bahasa sinematografi (Framing, Angle, Motion, Lighting, Composition).
 * DILARANG MEMBAHAS: Aset (Reuse, Pose Swap, New) -> Aset wewenang Production Resources!
 * DILARANG MEMBAHAS: Prompt / Vendor AI -> Wewenang Prompt Composer & Execution!
 * DILARANG MERUBAH: Fakta cerita atau pemecahan shot.
 */
export async function formulateDirectorialIntent(
  supabase: any,
  storyWorld: StoryWorldContext,
  beatShot: VisualBeatShot
): Promise<DirectorialSpec> {
  const systemPrompt = `Kamu adalah HARNUG STUDIO V4 — DIRECTORIAL INTENT MODULE (FILM DIRECTOR).

ADR RULE: Directorial Intent decides how it should be seen.
Tugasmu MURNI menentukan bahasa sinematografi presisi untuk shot ini.

DILARANG SAMA SEKALI MEMBAHAS:
- Aset (Reuse, Pose Swap, New) -> Wewenang Production Resources!
- Prompt / Vendor AI -> Wewenang Prompt Composer & Execution!
- Cerita atau pemecahan shot -> Wewenang Story World & Beat Planner!

ATURAN SINEMATOGRAFI:
- Pikirkan rasionalitas visual sesuai Tipe Beat dan Fokus Visual Utama shot ini.
- Tipe Beat: "${beatShot.visualBeatType}"
- Fokus Visual: "${beatShot.primaryVisualFocus}"
- Naskah Chunk: "${beatShot.naskahChunk}"

FORMAT JSON OUTPUT (MURNI BAHASA INDONESIA):
{
  "shotSize": "Extreme Close Up" | "Close Up" | "Medium Shot" | "Wide Shot" | "Extreme Wide Shot",
  "angle": "Eye Level" | "Low Angle" | "High Angle" | "Bird Eye View",
  "movement": "Static Hold" | "Pan Left" | "Pan Right" | "Tilt Up" | "Tilt Down" | "Slow Zoom In" | "Slow Zoom Out" | "Parallax Shift",
  "lightingMood": "Penjelasan pencahayaan sinematik (misal: Pagi industrial dramatis / Foggy glow)",
  "compositionGoal": "Aturan komposisi (misal: Rule of thirds, Clean silhouette, Center focus)",
  "emotionalEmphasis": "Penekanan emosi atau pusat perhatian visual utama"
}`;

  const userPrompt = `Konstruksi bahasa sinematografi untuk Shot #${beatShot.scene} (Tipe Beat: ${beatShot.visualBeatType}) dengan fokus visual: "${beatShot.primaryVisualFocus}" (format JSON murni).`;

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
          shotSize: parsed.shotSize || "Medium Shot",
          angle: parsed.angle || "Eye Level",
          movement: parsed.movement || "Static Hold",
          lightingMood: parsed.lightingMood || "Atmospheric sinematik",
          compositionGoal: parsed.compositionGoal || "Clean visual focus",
          emotionalEmphasis: parsed.emotionalEmphasis || beatShot.primaryVisualFocus,
        };
      }
    } catch (err: any) {
      lastError = err;
      await delay(1000);
    }
  }

  throw new Error(`[DirectorialIntent] Gagal memformulasi sinematografi untuk Shot #${beatShot.scene}: ${lastError?.message || "Internal Error"}`);
}