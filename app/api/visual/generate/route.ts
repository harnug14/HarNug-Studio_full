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
              generationConfig: { responseMimeType: "application/json" },
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
                  generationConfig: { responseMimeType: "application/json" },
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

  throw new Error(`Gagal membuat visual package: ${lastError?.message || "Internal Server Error"}`);
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

    const body = await req.json();
    const {
      action = "legacy", // "plan" | "direct-scene" | "save" | "legacy"
      naskahId = null,
      judulNaskah = "",
      isiNaskah = "",
      visualStyle = "3D Game AAA, Unreal Engine 5 Cinematic",
      bridgePoseLevel = "Balanced (Key Pose + Bridge Pose Transisi)",
      languageVersion = "ID",
      // for direct-scene & save
      storyUnderstanding = null,
      sceneItem = null,
      scenes = [],
    } = body;

    /* ════════════════════════════════════════════════════════════
       ACTION 1: PLAN SCENES (Module 1 & 2 - Lightweight)
       ════════════════════════════════════════════════════════════ */
    if (action === "plan") {
      if (!isiNaskah.trim()) {
        return NextResponse.json({ error: "Isi naskah tidak boleh kosong" }, { status: 400 });
      }

      const planSystemPrompt = `Kamu adalah HARNUG STUDIO V4 — AI VISUAL DIRECTOR (STEP 1: STORY UNDERSTANDING & SCENE BREAKDOWN).

TUGAS UTAMA:
1. Pahami naskah dan tentukan "primaryEra" (Era Sejarah Utama yang dibahas script).
2. Pecah naskah menjadi 4 hingga 8 adegan (scenes) berdasarkan perubahan alur naratif/sejarah.

RULES HISTORICAL ACCURACY:
- Identifikasi era sejarah utama dengan jelas. Kalimat retoris pembuka ("Pernah kepikiran gak...") BUKAN scene modern, melainkan pembuka ke era sejarah.

FORMAT OUTPUT JSON:
{
  "judul": "Visual Package - ${judulNaskah.replace(/"/g, "'")}",
  "styleTag": "${visualStyle}",
  "bridgePoseLevel": "${bridgePoseLevel}",
  "storyUnderstanding": {
    "storySummary": "Ringkasan naskah",
    "primaryEra": "Era sejarah utama (contoh: Zaman Purba, Yunani Kuno, Era Industri, dll)",
    "coreIdea": "Gagasan utama",
    "storyGoal": "Tujuan cerita",
    "characterList": "Daftar karakter utama",
    "timeline": "Garis waktu",
    "emotionalTimeline": "Alur emosi",
    "ending": "Penutup"
  },
  "scenes": [
    {
      "scene": 1,
      "naskahChunk": "Potongan kalimat naskah untuk adegan 1",
      "sceneType": "Hook",
      "sceneGoal": "Tujuan adegan 1"
    }
  ]
}`;

      const planUserPrompt = `Naskah:
"${isiNaskah}"

Pecah naskah ini menjadi daftar adegan terstruktur (JSON murni).`;

      const rawPlan = await callGeminiApiWithFallback(
        supabase,
        planUserPrompt,
        planSystemPrompt
      );

      const parsedPlan: any = parseJsonResponse(rawPlan, { scenes: [] });
      const planScenes = Array.isArray(parsedPlan?.scenes) ? parsedPlan.scenes : [];

      if (planScenes.length === 0) {
        return NextResponse.json({ error: "Gagal memecah naskah menjadi adegan. Silakan coba lagi." }, { status: 422 });
      }

      return NextResponse.json({
        data: {
          judul: parsedPlan.judul || `Visual Package - ${judulNaskah}`,
          storyUnderstanding: parsedPlan.storyUnderstanding || {},
          scenes: planScenes,
        },
      });
    }

    /* ════════════════════════════════════════════════════════════
       ACTION 2: DIRECT SINGLE SCENE (Module 3-13 - Lightweight 1 Scene)
       ════════════════════════════════════════════════════════════ */
    if (action === "direct-scene") {
      if (!sceneItem) {
        return NextResponse.json({ error: "Detail adegan (sceneItem) diperlukan" }, { status: 400 });
      }

      const eraInfo = storyUnderstanding?.primaryEra || "Era Sejarah";

      const sceneSystemPrompt = `Kamu adalah HARNUG STUDIO V4 — AI VISUAL DIRECTOR (STEP 2: DIRECTING SINGLE SCENE).

TUGAS: Jalankan keputusan sutradara lengkap (Module 3 s/d 13) HANYA UNTUK ADEGAN KE-${sceneItem.scene}.

ATURAN AKURASI SEJARAH (STRIKT):
- Era Sejarah Utama Naskah: "${eraInfo}".
- ADEGAN INI WAJIB MENGGUNAKAN SETTING ERA ${eraInfo}.
- DILARANG KERAS menampilkan HP, T-shirt, kamar modern, atau pakaian kasual modern kecuali jika naskah secara eksplisit menulis scene modern.

ATURAN WAJIB M13 PROMPT COMPILER (CHARACTER RENDERING ENFORCEMENT — SANGAT PENTING):
Setiap "compiledPrompt" yang dihasilkan WAJIB diakhiri atau menyertakan klausul spesifik rendering berikut untuk mencegah AI Image Generator menghasilkan gaya animasi/kartun/Pixar:
"Character rendering requirement: photorealistic human proportions and facial features — realistic anatomy, natural face structure, NOT cartoon/animated proportions (no oversized eyes, no simplified/stylized facial features, no Pixar/Disney/DreamWorks/anime character design). The character must look like a real human being captured via motion-capture and rendered using AAA video game graphics technology (e.g. Unreal Engine 5, comparable to God of War, The Last of Us, Horizon Zero Dawn, Red Dead Redemption 2 character rendering quality) — realistic skin texture, natural proportions, cinematic game-engine lighting. Rendering technique may be stylized/cinematic, but the underlying character design must remain grounded in real human anatomy, not animated/cartoon character design."

OUTPUT HARUS BERISI MODULE 3-13 UNTUK ADEGAN INI:
- M3 Story Beat (setup, conflict, reveal, payoff)
- M4 Creative Director (visualGoal, visualHook, visualConflict, storytellingPattern: "Character Focus", visualEmotion: "Dramatic")
- M5 Historical Knowledge (era: "${eraInfo}", clothing, architecture, furniture, technology, material)
- M6 Visual Language (subjectPriority, backgroundPriority, contrast)
- M7 Camera Director (shotType: "Full Body", cameraAngle: "Eye Level", lensFeel: "35mm", cameraReason: "")
- M8 Composition Director (characterPlacement: "Center", foreground: "Clean", background: "Clear", cameraSafety: "Full Body Visible")
- M9 Continuity Manager (characterLock: "Locked", costumeLock: "Locked", lightingLock: "Locked")
- M10 Animation Planner (previousPose: "Awal", currentPose: "Pose Utama", nextPose: "Next Pose", poseDistance: 40, transitionComplexity: "Medium", bridgeRequired: false, bridgeReason: "")
- M11 Google Flow Validator (fullBody: true, noCrop: true, noOcclusion: true, limbsVisible: true, easySeparation: true, shadowOK: true, status: "PASS")
- M12 Quality Evaluator (storyAccuracy: 90, historicalAccuracy: 90, visualLogic: 90, cameraLogic: 90, composition: 90, continuity: 90, animation: 90, googleFlowSafety: 90, promptQuality: 90, overallScore: 90, status: "PASS")
- M13 Prompt Compiler (compiledPrompt: "Full detailed English prompt for Scene ${sceneItem.scene} in ${eraInfo} setting, strictly including the mandatory Character rendering requirement clause...")

FORMAT JSON ADEGAN SINGLE:
{
  "scene": ${sceneItem.scene},
  "naskahChunk": "${(sceneItem.naskahChunk || "").replace(/"/g, "'")}",
  "scenePlanner": {
    "sceneGoal": "${(sceneItem.sceneGoal || "").replace(/"/g, "'")}",
    "sceneType": "${sceneItem.sceneType || "Hook"}",
    "sceneImportance": "High"
  },
  "storyBeat": { "setup": "", "conflict": "", "reveal": "", "payoff": "" },
  "creativeDirector": { "visualGoal": "", "visualHook": "", "visualConflict": "", "storytellingPattern": "Character Focus", "visualEmotion": "Dramatic" },
  "historicalKnowledge": { "era": "${eraInfo}", "architecture": "", "clothing": "", "furniture": "", "technology": "", "material": "" },
  "visualLanguage": { "subjectPriority": "", "backgroundPriority": "", "contrast": "" },
  "cameraDirector": { "shotType": "Full Body", "cameraAngle": "Eye Level", "lensFeel": "35mm", "cameraReason": "" },
  "compositionDirector": { "characterPlacement": "Center", "foreground": "Clean", "background": "Clear", "cameraSafety": "Full Body Visible" },
  "continuityManager": { "characterLock": "Locked", "costumeLock": "Locked", "lightingLock": "Locked" },
  "animationPlanner": { "previousPose": "Awal", "currentPose": "Current Pose", "nextPose": "Next Pose", "poseDistance": 40, "transitionComplexity": "Medium", "bridgeRequired": false, "bridgeReason": "" },
  "googleFlowValidator": { "fullBody": true, "noCrop": true, "noOcclusion": true, "limbsVisible": true, "easySeparation": true, "shadowOK": true, "status": "PASS" },
  "qualityEvaluator": { "storyAccuracy": 90, "historicalAccuracy": 90, "visualLogic": 90, "cameraLogic": 90, "composition": 90, "continuity": 90, "animation": 90, "googleFlowSafety": 90, "promptQuality": 90, "overallScore": 90, "status": "PASS" },
  "promptCompiler": { "compiledPrompt": "Detailed English prompt for Scene ${sceneItem.scene} in ${eraInfo} setting, including the exact Character rendering requirement..." }
}`;

      const sceneUserPrompt = `Potongan Naskah Adegan ${sceneItem.scene}:
"${sceneItem.naskahChunk || ""}"

Direct adegan ini sekarang (format JSON murni).`;

      const rawScene = await callGeminiApiWithFallback(
        supabase,
        sceneUserPrompt,
        sceneSystemPrompt
      );

      const parsedScene = parseJsonResponse(rawScene, { scene: sceneItem.scene });
      return NextResponse.json({ data: parsedScene });
    }

    /* ════════════════════════════════════════════════════════════
       ACTION 3: SAVE COMPLETED PACKAGE TO SUPABASE
       ════════════════════════════════════════════════════════════ */
    if (action === "save") {
      const defaultTitle = judulNaskah ? `Visual Package - ${judulNaskah}` : "Visual Package";
      const packageData = {
        judul: defaultTitle,
        styleTag: visualStyle,
        bridgePoseLevel,
        storyUnderstanding: storyUnderstanding || {},
        scenes: scenes || [],
      };

      const { data: newVisual, error: insertErr } = await supabase
        .from("visual")
        .insert({
          user_id: user.id,
          judul: defaultTitle,
          isi_visual: packageData,
          sumber_naskah_id: naskahId || null,
        })
        .select()
        .single();

      if (insertErr) {
        return NextResponse.json({ error: "Gagal simpan ke database: " + insertErr.message }, { status: 500 });
      }

      return NextResponse.json({ data: newVisual });
    }

    return NextResponse.json({ error: "Action tidak dikenal" }, { status: 400 });
  } catch (err: any) {
    console.error("Visual generation error:", err);
    return NextResponse.json({ error: err.message || "Gagal membuat visual package" }, { status: 500 });
  }
}