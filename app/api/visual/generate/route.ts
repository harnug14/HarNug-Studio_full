import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { extractStoryWorld } from "@/lib/visual/story-world/story-world";
import { planVisualBeats } from "@/lib/visual/beat-planner/beat-planner";
import { formulateDirectorialIntent } from "@/lib/visual/directorial/directorial-intent";
import { resolveProductionResources } from "@/lib/visual/production/production-resources";
import { composePrompt } from "@/lib/visual/composer/prompt-composer";
import { executeGoogleFlow } from "@/lib/visual/execution/google-flow-adapter";

/**
 * STEP 7: ORCHESTRATOR ROUTE (SLIM CONTROLLER ~130 LINES)
 * ADR RULE: Pure Orchestrator. Zero Business Logic.
 * Pipeline: Story World -> Visual Beat Planner -> Directorial Intent -> Production Resources -> Prompt Composer -> Execution
 */
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
      action = "legacy",
      naskahId = null,
      judulNaskah = "",
      isiNaskah = "",
      visualStyle = "Sinematik 3D, Unreal Engine 5",
      bridgePoseLevel = "Seimbang (Key Pose + Transisi Mikro)",
      storyUnderstanding = null,
      sceneItem = null,
      scenes = [],
      existingAssetLibrary = [],
    } = body;

    // 1. ACTION PLAN: Story World -> Visual Beat Planner
    if (action === "plan") {
      if (!isiNaskah.trim()) {
        return NextResponse.json({ error: "Isi naskah tidak boleh kosong" }, { status: 400 });
      }

      // Step 1: Story World
      const storyWorld = await extractStoryWorld(supabase, {
        judulNaskah,
        isiNaskah,
        visualStyle,
        bridgePoseLevel,
      });

      // Step 2: Visual Beat Planner
      const beatPlan = await planVisualBeats(supabase, storyWorld, isiNaskah);

      return NextResponse.json({
        data: {
          judul: `Visual Package - ${judulNaskah || "Tanpa Judul"}`,
          storyUnderstanding: storyWorld,
          scenes: beatPlan.shots,
        },
      });
    }

    // 2. ACTION DIRECT-SCENE: Directorial Intent -> Production Resources -> Prompt Composer -> Execution
    if (action === "direct-scene") {
      if (!sceneItem) {
        return NextResponse.json({ error: "Detail shot (sceneItem) diperlukan" }, { status: 400 });
      }

      const currentStoryWorld = storyUnderstanding || {
        storySummary: "Ringkasan narasi",
        primaryEra: "Era Sejarah",
        wordCount: 150,
      };

      // Step 3: Directorial Intent
      const directorialSpec = await formulateDirectorialIntent(supabase, currentStoryWorld, sceneItem);

      // Step 4: Production Resources
      const productionResult = await resolveProductionResources(
        supabase,
        currentStoryWorld,
        sceneItem,
        directorialSpec,
        existingAssetLibrary
      );

      // Step 5: Prompt Composer V3 (Visual Instruction Composer)
      const composedPromptResult = composePrompt(
        productionResult.sceneSpecification,
        visualStyle,
        "Google Flow"
      );

      // Step 6: Execution Adapter
      const executionResult = await executeGoogleFlow({
        compiledPrompt: composedPromptResult.compiledPrompt,
        assetDecision: productionResult.assetDecision,
        sceneSpecification: productionResult.sceneSpecification,
        visualStyle,
      });

      return NextResponse.json({
        data: {
          scene: productionResult.scene,
          visualBeatType: productionResult.sceneSpecification.beat,
          naskahChunk: productionResult.sceneSpecification.naskahChunk,
          primaryVisualFocus: productionResult.sceneSpecification.focus,
          assetDecision: productionResult.assetDecision,
          sceneSpecification: productionResult.sceneSpecification,
          promptCompiler: {
            compiledPrompt: executionResult.outputPrompt || composedPromptResult.compiledPrompt,
          },
          executionResult,
        },
      });
    }

    // 3. ACTION SAVE: Save package & compile asset library to Supabase
    if (action === "save") {
      const defaultTitle = judulNaskah ? `Visual Package - ${judulNaskah}` : "Visual Package";

      const compiledAssetLibrary: any[] = [];
      const assetMap = new Map<string, any>();

      (scenes || []).forEach((sc: any) => {
        const ad = sc.assetDecision || {};
        if (ad.createdAsset && ad.createdAsset.assetId) {
          const aid = ad.createdAsset.assetId;
          if (!assetMap.has(aid)) {
            assetMap.set(aid, {
              assetId: aid,
              assetName: ad.createdAsset.assetName || `Aset Beat #${sc.scene}`,
              assetType: ad.createdAsset.assetType || "Environment",
              createdFromScene: sc.scene,
              usedInScenes: [sc.scene],
              assetStatus: ad.assetStatus || "NEW",
            });
          } else {
            const existing = assetMap.get(aid);
            if (!existing.usedInScenes.includes(sc.scene)) {
              existing.usedInScenes.push(sc.scene);
            }
          }
        } else if (ad.targetAssetId) {
          const aid = ad.targetAssetId;
          if (assetMap.has(aid)) {
            const existing = assetMap.get(aid);
            if (!existing.usedInScenes.includes(sc.scene)) {
              existing.usedInScenes.push(sc.scene);
            }
          }
        }
      });

      assetMap.forEach((val) => compiledAssetLibrary.push(val));

      const packageData = {
        judul: defaultTitle,
        styleTag: visualStyle,
        bridgePoseLevel,
        storyUnderstanding: storyUnderstanding || {},
        scenes: scenes || [],
        assetLibrary: compiledAssetLibrary,
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
    console.error("Visual orchestrator error:", err);
    return NextResponse.json({ error: err.message || "Gagal membuat visual package" }, { status: 500 });
  }
}