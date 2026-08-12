import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { extractStoryWorld } from "@/lib/visual/story-world/story-world";
import { planVisualBeats } from "@/lib/visual/beat-planner/beat-planner";
import { formulateDirectorialIntent } from "@/lib/visual/directorial/directorial-intent";
import { resolveProductionResources } from "@/lib/visual/production/production-resources";
import { composePrompt } from "@/lib/visual/composer/prompt-composer";
import { executeGoogleFlow } from "@/lib/visual/execution/google-flow-adapter";
import { DirectorialSpec, CharacterState } from "@/lib/visual/types";
import { transitionCharacterState } from "@/lib/visual/character-fsm/fsm-engine";

// VERCEL TIMEOUT PROTECTOR (60 DETIK)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function getSafeString(val: unknown, fallback: string = ""): string {
  if (typeof val === "string") return val.trim();
  return fallback;
}

// ATURAN PERMANEN ENGINE HARNUG STUDIO UNTUK KEPUTUSAN ASET VISUAL
const ENGINE_AUTOMATIC_TRANSITION_RULES = `
AUTOMATIC DIRECTORIAL & ASSET DECISION RULES:
- RULE 1: Jika pose karakter sama dan hanya framing/sudut kamera yang berubah -> REUSE ASSET (Instruksi kamera dikerjakan di CapCut, JANGAN buat prompt/aset baru).
- RULE 2: Jika hanya terjadi perubahan mikro/kecil (kepala menoleh, tangan bergerak sedikit, ekspresi berubah) -> Gunakan Google Flow Edit (JANGAN buat aset baru).
- RULE 3: Jika pose berubah besar (contoh: berdiri -> duduk, jalan -> berlari, jongkok -> berdiri, mengangkat barang, berlutut, dll) -> BUAT ASET BARU (NEW ASSET).
- RULE 4: Jika fokus visual berpindah (contoh: karakter -> objek, objek -> karakter, wide scene -> close object) -> BUAT ASET BARU (NEW ASSET).
- RULE 5: Jika hanya zoom, pan, tilt, camera move, atau crop -> JANGAN render ulang, gunakan aset yang sudah ada (REUSED ASSET).
`;

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
    const visualStyle = getSafeString(body?.visualStyle, "3D Unreal Engine 5");
    const naskahId = body?.naskahId ?? null;

    const existingAssetLibrary = Array.isArray(body?.existingAssetLibrary) ? body.existingAssetLibrary : [];
    const scenes = Array.isArray(body?.scenes) ? body.scenes : [];
    const sceneItem = body?.sceneItem && typeof body.sceneItem === "object" ? body.sceneItem : null;
    const storyUnderstanding = body?.storyUnderstanding && typeof body.storyUnderstanding === "object" ? body.storyUnderstanding : null;
    const previousDirectorialSpec = body?.previousDirectorialSpec && typeof body.previousDirectorialSpec === "object" ? (body.previousDirectorialSpec as DirectorialSpec) : undefined;
    const previousCharacterState = body?.previousCharacterState && typeof body.previousCharacterState === "object" ? (body.previousCharacterState as CharacterState) : null;

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
          bridgePoseLevel: ENGINE_AUTOMATIC_TRANSITION_RULES,
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

    // 2. ACTION DIRECT-SCENE (V5 PIPELINE)
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
        // STEP A: FINITE STATE MACHINE (FSM)
        const structuredAction = {
          primaryAction: sceneItem?.primaryAction,
          targetObject: sceneItem?.targetObject,
          modifier: sceneItem?.modifier,
        };

        const fsmResult = transitionCharacterState(
          previousCharacterState,
          sceneItem,
          structuredAction,
          sceneItem
        );

        const currentCharacterState = fsmResult.nextState;

        // STEP B: DIRECTORIAL INTENT
        const directorialSpec = await formulateDirectorialIntent(
          supabase,
          currentStoryWorld,
          sceneItem,
          previousDirectorialSpec,
          currentCharacterState ?? undefined
        );

        // STEP C: PRODUCTION RESOURCES (Memakai Aturan Otomatis RULE 1 - 5)
        const productionResult = await resolveProductionResources(
          supabase,
          currentStoryWorld,
          sceneItem,
          directorialSpec,
          existingAssetLibrary,
          currentCharacterState ?? undefined
        );

        // STEP D: PROMPT COMPOSER
        const composedPromptResult = composePrompt(
          productionResult.sceneSpecification,
          visualStyle,
          "Google Flow",
          currentCharacterState
        );

        // STEP E: EXECUTION
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
            characterState: currentCharacterState,
            fsmTransition: {
              executed: fsmResult.executed,
              success: fsmResult.success,
              skippedReason: fsmResult.skippedReason,
              appliedAction: fsmResult.appliedAction,
              validationErrors: fsmResult.validationErrors,
              debugLog: fsmResult.debugLog,
            },
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

    // 3. ACTION SAVE
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
