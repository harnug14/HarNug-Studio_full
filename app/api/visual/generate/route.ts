import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { extractStoryWorld } from "@/lib/visual/story-world/story-world";
import { planVisualBeats } from "@/lib/visual/beat-planner/beat-planner";
import { formulateDirectorialIntent } from "@/lib/visual/directorial/directorial-intent";
import { resolveProductionResources } from "@/lib/visual/production/production-resources";
import { composePrompt } from "@/lib/visual/composer/prompt-composer";
import { executeGoogleFlow } from "@/lib/visual/execution/google-flow-adapter";
import { DirectorialSpec } from "@/lib/visual/types";

function getSafeString(val: unknown, fallback: string = ""): string {
  if (typeof val === "string") return val.trim();
  return fallback;
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

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Format payload JSON request tidak valid" }, { status: 400 });
    }

    const action = getSafeString(body?.action, "legacy");
    const VALID_ACTIONS = ["plan", "direct-scene", "save"];

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: `Action '${action}' tidak valid` }, { status: 400 });
    }

    const isiNaskah = getSafeString(body?.isiNaskah, "");
    const judulNaskah = getSafeString(body?.judulNaskah, "");
    const visualStyle = getSafeString(body?.visualStyle, "Sinematik 3D, Unreal Engine 5");
    const bridgePoseLevel = getSafeString(body?.bridgePoseLevel, "Seimbang (Key Pose + Transisi Mikro)");
    const naskahId = body?.naskahId ?? null;

    const existingAssetLibrary = Array.isArray(body?.existingAssetLibrary) ? body.existingAssetLibrary : [];
    const scenes = Array.isArray(body?.scenes) ? body.scenes : [];
    const sceneItem = body?.sceneItem && typeof body.sceneItem === "object" ? body.sceneItem : null;
    const storyUnderstanding = body?.storyUnderstanding && typeof body.storyUnderstanding === "object" ? body.storyUnderstanding : null;
    const previousDirectorialSpec = body?.previousDirectorialSpec && typeof body.previousDirectorialSpec === "object" ? (body.previousDirectorialSpec as DirectorialSpec) : undefined;

    // 1. ACTION PLAN: Story World -> Visual Beat Planner
    if (action === "plan") {
      if (!isiNaskah) {
        return NextResponse.json({ error: "Isi naskah wajib diisi" }, { status: 400 });
      }

      try {
        const storyWorld = await extractStoryWorld(supabase, {
          judulNaskah,
          isiNaskah,
          visualStyle,
          bridgePoseLevel,
        });

        const beatPlan = await planVisualBeats(supabase, storyWorld, isiNaskah);

        return NextResponse.json({
          data: {
            judul: `Visual Package - ${judulNaskah || "Tanpa Judul"}`,
            storyUnderstanding: storyWorld,
            scenes: beatPlan.shots,
          },
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Gagal memproses Beat Planner";
        console.error("[RouteOrchestrator] Error on plan:", errMsg);
        return NextResponse.json({ error: errMsg }, { status: 422 });
      }
    }

    // 2. ACTION DIRECT-SCENE: Directorial Intent -> Production Resources -> Prompt Composer -> Execution
    if (action === "direct-scene") {
      if (!sceneItem) {
        return NextResponse.json({ error: "Detail shot (sceneItem) wajib disertakan" }, { status: 400 });
      }

      const currentStoryWorld = storyUnderstanding || {
        storySummary: "Ringkasan narasi",
        primaryEra: "Era Sejarah",
        wordCount: 150,
        coreIdea: "Gagasan utama",
        storyGoal: "Tujuan cerita",
        narrativeCanonFacts: ["Fakta cerita"],
      };

      try {
        const directorialSpec = await formulateDirectorialIntent(
          supabase,
          currentStoryWorld,
          sceneItem,
          previousDirectorialSpec
        );

        const productionResult = await resolveProductionResources(
          supabase,
          currentStoryWorld,
          sceneItem,
          directorialSpec,
          existingAssetLibrary
        );

        const composedPromptResult = composePrompt(
          productionResult.sceneSpecification,
          visualStyle,
          "Google Flow"
        );

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
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Gagal memproses Direct Scene";
        console.error("[RouteOrchestrator] Error on direct-scene:", errMsg);
        return NextResponse.json({ error: errMsg }, { status: 422 });
      }
    }

    // 3. ACTION SAVE: Save package & compile asset library to Supabase
    if (action === "save") {
      const defaultTitle = judulNaskah ? `Visual Package - ${judulNaskah}` : "Visual Package";

      const compiledAssetLibrary: any[] = [];
      const assetMap = new Map<string, any>();

      scenes.forEach((sc: any) => {
        if (!sc || typeof sc !== "object") return;
        const ad = sc.assetDecision || {};
        if (ad.createdAsset && ad.createdAsset.assetId) {
          const aid = String(ad.createdAsset.assetId);
          if (!assetMap.has(aid)) {
            assetMap.set(aid, {
              assetId: aid,
              assetName: getSafeString(ad.createdAsset.assetName, `Aset Beat #${sc.scene}`),
              assetType: getSafeString(ad.createdAsset.assetType, "Environment"),
              createdFromScene: sc.scene ?? 1,
              usedInScenes: [sc.scene ?? 1],
              assetStatus: getSafeString(ad.assetStatus, "NEW"),
            });
          } else {
            const existing = assetMap.get(aid);
            if (Array.isArray(existing.usedInScenes) && !existing.usedInScenes.includes(sc.scene)) {
              existing.usedInScenes.push(sc.scene ?? 1);
            }
          }
        } else if (ad.targetAssetId) {
          const aid = String(ad.targetAssetId);
          if (assetMap.has(aid)) {
            const existing = assetMap.get(aid);
            if (Array.isArray(existing.usedInScenes) && !existing.usedInScenes.includes(sc.scene)) {
              existing.usedInScenes.push(sc.scene ?? 1);
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
        scenes,
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
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Internal Server Error";
    console.error("[RouteOrchestrator] Critical Exception:", errMsg);
    return NextResponse.json({ error: "Terjadi kesalahan internal pada server" }, { status: 500 });
  }
}