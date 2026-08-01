import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { StoryWorldContext, BeatPlannerResult, VisualBeatShot } from "../types";

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * STEP 2: VISUAL BEAT PLANNER MODULE
 * ADR RULE: "Visual Beat Planner decides what must be shown."
 * Tanggung Jawab: Memecah naskah menjadi Visual Beats padat sinematik (1 Shot = 1 Fokus Visual Utama).
 * DILARANG MEMBAHAS: Kamera (Sudut, Zoom, Motion) -> Kamera wewenang Directorial Intent!
 * DILARANG MEMBAHAS: Prompt / Vendor AI / Aset.
 */
export async function planVisualBeats(
  supabase: any,
  storyWorld: StoryWorldContext,
  isiNaskah: string
): Promise<BeatPlannerResult> {
  const wordCount = storyWorld.wordCount || isiNaskah.trim().split(/\s+/).filter(Boolean).length;

  // Hitung Target Kepadatan Minimal (Beat Density Target)
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

10 ATURAN BEAT PLANNER:
1. BEAT CLASSIFICATION (Wajib pilih 1 dari 9 tipe):
   "Establishing", "Action", "Reaction", "Detail", "Insert", "Reveal", "Transition", "Emphasis", "Payoff".
2. ONE BEAT = ONE FOCUS: 1 shot hanya 1 fokus visual utama.
3. NO SENTENCE LOCK: 1 kalimat boleh dipecah jadi banyak beat.
4. CAUSE -> EFFECT SPLIT: Sebab dan akibat WAJIB dipisah menjadi 2 shot berbeda.
5. REACTION PRIORITY: Aksi penting wajib diikuti reaction shot.
6. INSERT/DETAIL DETECTION: Objek penting (jam, lilin, bambu, paku, jendela, dll.) otomatis mendapat shot Detail/Insert.
7. HOOK EXPANSION: 5-10 detik pertama naskah dibuat lebih padat.
8. TRANSITION BEAT: Perpindahan era/lokasi selalu mendapat shot Transition/Establishing baru.
9. RHYTHM RULE: Dilarang lebih dari 2 shot berturut-turut dengan tipe beat yang sama.
10. BEAT DENSITY TARGET: Minimal ${minTargetShots} SHOT.

KONTEKS STORY WORLD:
Summary: ${storyWorld.storySummary}
Era Utama: ${storyWorld.primaryEra}

FORMAT JSON OUTPUT (MURNI BAHASA INDONESIA):
{
  "totalBeatShots": ${minTargetShots},
  "shots": [
    {
      "scene": 1,
      "visualBeatType": "Establishing" | "Action" | "Reaction" | "Detail" | "Insert" | "Reveal" | "Transition" | "Emphasis" | "Payoff",
      "naskahChunk": "Potongan teks pendek acuan beat",
      "primaryVisualFocus": "Satu fokus visual utama spesifik",
      "narrativePurpose": "Alasan naratif mengapa shot ini ada",
      "expectedDuration": "2-3s",
      "importance": "Critical" | "High" | "Medium" | "Low"
    }
  ]
}`;

  const baseUserPrompt = `Naskah (${wordCount} kata):\n"${isiNaskah}"\n\nLakukan VISUAL BEAT PLANNING padat. Target minimal: ${minTargetShots} SHOT (format JSON murni).`;

  let resultShots: VisualBeatShot[] = [];
  let planAttempts = 0;
  const MAX_PLAN_ATTEMPTS = 2;

  while (planAttempts < MAX_PLAN_ATTEMPTS) {
    planAttempts++;
    const currentPrompt =
      planAttempts === 1
        ? baseUserPrompt
        : `${baseUserPrompt}\n\n⚠️ RE-PLANNING REQUIRED! Hasil sebelumnya hanya ${resultShots.length} shot. TARGET MINIMAL WAJIB ADALAH ${minTargetShots} SHOT. Pecah aksi, reaksi, dan objek insert menjadi shot terpisah!`;

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
          return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        });

        if (rawResponse) {
          const parsed = parseJsonResponse(rawResponse, { shots: [] });
          resultShots = Array.isArray(parsed.shots) ? parsed.shots : [];
          break;
        }
      } catch (err: any) {
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