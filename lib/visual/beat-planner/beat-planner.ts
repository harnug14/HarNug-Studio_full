import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { StoryWorldContext, BeatPlannerResult, VisualBeatShot, VisualBeatType } from "../types";

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

const VALID_BEAT_TYPES: Set<string> = new Set([
  "Establishing", "Action", "Reaction", "Detail", "Insert", "Reveal", "Transition", "Emphasis", "Payoff"
]);

function normalizeBeatType(val: unknown): VisualBeatType {
  const str = getSafeString(val, "Action");
  for (const bt of Array.from(VALID_BEAT_TYPES)) {
    if (str.toLowerCase().includes(bt.toLowerCase())) {
      return bt as VisualBeatType;
    }
  }
  return "Action";
}

/**
 * STEP 2: VISUAL BEAT PLANNER MODULE
 * ADR RULE: "Visual Beat Planner decides what must be shown."
 * Tanggung Jawab: Memecah naskah menjadi Visual Beats padat sinematik (1 Shot = 1 Fokus Visual Utama).
 * HARD INVARIANTS:
 * 1. Rule 3: 1 Shot = 1 Visual Focus
 * 2. Beat Density Target: Total Shots >= minTargetShots
 */
export async function planVisualBeats(
  supabase: unknown,
  storyWorld: StoryWorldContext,
  isiNaskah: string
): Promise<BeatPlannerResult> {
  const safeNaskah = getSafeString(isiNaskah, "");
  const wordCount = storyWorld?.wordCount || (safeNaskah ? safeNaskah.split(/\s+/).filter(Boolean).length : 0);

  let minTargetShots = 18;
  if (wordCount < 100) {
    minTargetShots = Math.max(8, Math.floor(wordCount / 7));
  } else if (wordCount < 180) {
    minTargetShots = Math.max(12, Math.floor(wordCount / 8));
  } else if (wordCount <= 250) {
    minTargetShots = 18;
  } else if (wordCount <= 350) {
    minTargetShots = 25;
  } else {
    minTargetShots = Math.floor(wordCount / 10);
  }

  const systemPrompt = `Kamu adalah HARNUG STUDIO V4 — VISUAL BEAT PLANNER MODULE.

ADR RULE: Visual Beat Planner decides what must be shown.
Tugasmu MURNI mengekstrak unit visual terkecil (Visual Beats) dari naskah berdasarkan fakta Story World.

DILARANG SAMA SEKALI MEMBAHAS:
- Kamera (Shot size, angle, movement) -> Kamera wewenang Directorial Intent!
- Aset (Reuse, Pose Swap, New) -> Aset wewenang Production Resources!
- Prompt / Vendor AI

HARD INVARIANTS:
1. ONE BEAT = ONE FOCUS: 1 shot HANYA BISA MEMILIKI 1 FOKUS VISUAL UTAMA.
2. NO SENTENCE LOCK: 1 kalimat boleh dipecah menjadi banyak beat.
3. CAUSE -> EFFECT SPLIT: Sebab dan akibat WAJIB dipisah menjadi 2 shot berbeda.
4. BEAT DENSITY TARGET: Minimal ${minTargetShots} SHOT.

KLASIFIKASI BEAT DOMAIN (Pilih tipe murni yang paling jujur sesuai adegan):
- "Establishing", "Action", "Reaction", "Detail", "Insert", "Reveal", "Transition", "Emphasis", "Payoff".

ATURAN KEJUJUAN DOMAIN:
- visualBeatType ADALAH FAKTA DOMAIN IMMUTABLE.
- DILARANG MEMALSUKAN visualBeatType demi variasi ritme!

KONTEKS STORY WORLD:
Summary: ${storyWorld?.storySummary ?? "Ringkasan cerita"}
Era Utama: ${storyWorld?.primaryEra ?? "Era Sejarah"}

FORMAT JSON OUTPUT (MURNI BAHASA INDONESIA):
{
  "totalBeatShots": ${minTargetShots},
  "shots": [
    {
      "scene": 1,
      "visualBeatType": "Establishing" | "Action" | "Reaction" | "Detail" | "Insert" | "Reveal" | "Transition" | "Emphasis" | "Payoff",
      "naskahChunk": "Potongan teks pendek acuan beat",
      "primaryVisualFocus": "Satu fokus visual utama spesifik",
      "primaryAction": "Raise | Lower | Grab | Release | Touch | Push | Pull | Hold | Open | Close | Reach | Walk | Run | Stand | Sit | Lean | Point | Turn | Kneel | Look",
      "targetObject": "Objek atau bagian tubuh target aksi",
      "modifier": "Pengubah / deskripsi cara aksi dilakukan",
      "narrativePurpose": "Alasan naratif mengapa shot ini ada",
      "expectedDuration": "2-3s",
      "importance": "Critical" | "High" | "Medium" | "Low"
    }
  ]
}`;

  const baseUserPrompt = `Naskah (${wordCount} kata):\n"${safeNaskah}"\n\nLakukan VISUAL BEAT PLANNING padat. Target minimal: ${minTargetShots} SHOT (format JSON murni).`;

  let resultShots: VisualBeatShot[] = [];
  let planAttempts = 0;
  const MAX_PLAN_ATTEMPTS = 2;

  while (planAttempts < MAX_PLAN_ATTEMPTS) {
    planAttempts++;
    const currentPrompt =
      planAttempts === 1
        ? baseUserPrompt
        : `${baseUserPrompt}\n\n⚠️ RE-PLANNING REQUIRED! Hasil sebelumnya hanya ${resultShots.length} shot. TARGET MINIMAL WAJIB ADALAH ${minTargetShots} SHOT. Pecah aksi, reaksi, dan objek insert menjadi shot terpisah!`;

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
                contents: [{ role: "user", parts: [{ text: currentPrompt }] }],
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
            
            // DEFENSIVE MULTI-KEY ARRAY RESOLUTION
            const rawShots = 
              (Array.isArray(parsed?.shots) && parsed.shots) ||
              (Array.isArray(parsed?.scenes) && parsed.scenes) ||
              (Array.isArray(parsed?.visualBeats) && parsed.visualBeats) ||
              (Array.isArray(parsed?.data) && parsed.data) ||
              (Array.isArray(parsed) && parsed) ||
              [];

            resultShots = rawShots.map((item: any, idx: number) => ({
              scene: typeof item?.scene === "number" ? item.scene : idx + 1,
              visualBeatType: normalizeBeatType(item?.visualBeatType),
              naskahChunk: getSafeString(item?.naskahChunk, "Potongan adegan"),
              primaryVisualFocus: getSafeString(item?.primaryVisualFocus, item?.naskahChunk ?? "Fokus visual"),
              primaryAction: getSafeString(item?.primaryAction, undefined),
              targetObject: getSafeString(item?.targetObject, undefined),
              modifier: getSafeString(item?.modifier, undefined),
              narrativePurpose: getSafeString(item?.narrativePurpose, "Tujuan visual naratif"),
              expectedDuration: getSafeString(item?.expectedDuration, "2-3s"),
              importance: (["Critical", "High", "Medium", "Low"].includes(item?.importance) ? item.importance : "High") as "Critical" | "High" | "Medium" | "Low",
            }));

            if (resultShots.length > 0) break;
          } catch (parseErr) {
            console.error("[BeatPlanner] JSON Parse Error:", parseErr);
          }
        }
      } catch (err: unknown) {
        lastError = err;
        await delay(1000);
      }
    }

    if (resultShots.length >= minTargetShots || planAttempts >= MAX_PLAN_ATTEMPTS) {
      break;
    }
  }

  if (resultShots.length === 0) {
    throw new Error("[VisualBeatPlanner] Gagal memecah naskah menjadi Visual Beats.");
  }

  return {
    totalBeatShots: resultShots.length,
    shots: resultShots,
  };
}