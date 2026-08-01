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

function getSafeString(val: unknown, fallback: string = ""): string {
  if (typeof val === "string") return val.trim();
  return fallback;
}

/**
 * STEP 3: DIRECTORIAL INTENT MODULE
 * ADR RULE: "Directorial Intent decides how it should be seen."
 * Tanggung Jawab: Murni menentukan bahasa sinematografi (Framing, Angle, Motion, Lighting, Composition).
 * SOFT GUIDELINE IMPLEMENTATION (CAMERA RHYTHM ADVISORY):
 * - Jika menerima tipe beat berurutan, variasikan sudut kamera, framing, atau lighting mood
 *   TANPA PERNAH MENGUBAH visualBeatType dari L2.
 */
export async function formulateDirectorialIntent(
  supabase: unknown,
  storyWorld: StoryWorldContext,
  beatShot: VisualBeatShot,
  previousDirectorialSpec?: DirectorialSpec
): Promise<DirectorialSpec> {
  const safeBeatType = getSafeString(beatShot?.visualBeatType, "Action");
  const safeFocus = getSafeString(beatShot?.primaryVisualFocus, beatShot?.naskahChunk ?? "Fokus Visual");

  const previousContext = previousDirectorialSpec
    ? `Kamera Shot Sebelumnya: ${previousDirectorialSpec.shotSize}, Angle: ${previousDirectorialSpec.angle}. Variasikan sudut/framing shot ini agar dinamis.`
    : "Shot Pertama dalam adegan.";

  const systemPrompt = `Kamu adalah HARNUG STUDIO V4 — DIRECTORIAL INTENT MODULE (FILM DIRECTOR).

ADR RULE: Directorial Intent decides how it should be seen.
Tugasmu MURNI menentukan bahasa sinematografi presisi untuk shot ini.

DILARANG SAMA SEKALI MEMBAHAS:
- Aset (Reuse, Pose Swap, New) -> Wewenang Production Resources!
- Prompt / Vendor AI -> Wewenang Prompt Composer & Execution!
- Cerita atau pemecahan shot -> Wewenang Story World & Beat Planner!

CAMERA RHYTHM ADVISORY (SOFT GUIDELINE SINEMATOGRAFI):
- ${previousContext}
- DILARANG merubah fakta tipe beat L2!

INPUT SHOT:
- Tipe Beat L2 (Immutable): "${safeBeatType}"
- Fokus Visual: "${safeFocus}"
- Naskah Chunk: "${getSafeString(beatShot?.naskahChunk, "")}"

FORMAT JSON OUTPUT (MURNI BAHASA INDONESIA):
{
  "shotSize": "Extreme Close Up" | "Close Up" | "Medium Shot" | "Wide Shot" | "Extreme Wide Shot",
  "angle": "Eye Level" | "Low Angle" | "High Angle" | "Bird Eye View",
  "movement": "Static Hold" | "Pan Left" | "Pan Right" | "Tilt Up" | "Tilt Down" | "Slow Zoom In" | "Slow Zoom Out" | "Parallax Shift",
  "lightingMood": "Penjelasan pencahayaan sinematik",
  "compositionGoal": "Aturan komposisi visual",
  "emotionalEmphasis": "Penekanan emosi atau fokus utama"
}`;

  const userPrompt = `Konstruksi bahasa sinematografi untuk Shot #${beatShot?.scene ?? 1} (Tipe Beat: ${safeBeatType}) dengan fokus visual: "${safeFocus}" (format JSON murni).`;

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
            shotSize: (["Extreme Close Up", "Close Up", "Medium Shot", "Wide Shot", "Extreme Wide Shot"].includes(parsed?.shotSize) ? parsed.shotSize : "Medium Shot") as DirectorialSpec["shotSize"],
            angle: (["Eye Level", "Low Angle", "High Angle", "Bird Eye View"].includes(parsed?.angle) ? parsed.angle : "Eye Level") as DirectorialSpec["angle"],
            movement: (["Static Hold", "Pan Left", "Pan Right", "Tilt Up", "Tilt Down", "Slow Zoom In", "Slow Zoom Out", "Parallax Shift"].includes(parsed?.movement) ? parsed.movement : "Static Hold") as DirectorialSpec["movement"],
            lightingMood: getSafeString(parsed?.lightingMood, "Atmospheric sinematik"),
            compositionGoal: getSafeString(parsed?.compositionGoal, "Clean visual focus"),
            emotionalEmphasis: getSafeString(parsed?.emotionalEmphasis, safeFocus),
          };
        } catch (parseErr) {
          console.error("[DirectorialIntent] JSON Parse Error:", parseErr);
        }
      }
    } catch (err: unknown) {
      lastError = err;
      await delay(1000);
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : "Internal Error";
  throw new Error(`[DirectorialIntent] Gagal memformulasi sinematografi untuk Shot #${beatShot?.scene ?? 1}: ${errMsg}`);
}