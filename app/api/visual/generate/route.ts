/**
 * ========================================================================================
 * HARNUG STUDIO — VISUAL DIRECTOR ENGINE
 * File: app/api/visual/generate/route.ts
 * Step: 15 of 15 (Main Pipeline API Orchestrator — Synchronized with V5 Modules)
 * Status: PRODUCTION-READY (LOCKED)
 * ========================================================================================
 * Orchestrator API Route Next.js App Router (POST).
 * Menjalankan modul asli V5 (planVisualBeats, formulateDirectorialIntent, resolveProductionResources)
 * dan memproses 3 varian prompt Google Flow per shot (Full Scene, Clean BG, Green Screen).
 * ========================================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { createShotId } from '@/lib/visual/domain-model';
import { StoryWorldExtractor } from '@/lib/visual/story-world/story-world';
import { planVisualBeats } from '@/lib/visual/beat-planner/beat-planner';
import { formulateDirectorialIntent } from '@/lib/visual/directorial/directorial-intent';
import { resolveProductionResources } from '@/lib/visual/production/production-resources';
import { PromptComposerEngine } from '@/lib/visual/composer/prompt-composer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scriptText: string = body.scriptText ?? body.isiNaskah ?? '';

    if (!scriptText || !scriptText.trim()) {
      return NextResponse.json(
        { error: 'EMPTY_SCRIPT', message: 'Teks naskah tidak boleh kosong.' },
        { status: 400 }
      );
    }

    // 1. Ekstraksi Context Fakta Story World & Automatic Contextual Age Hydration
    const extractor = new StoryWorldExtractor();
    const initialShotId = createShotId(`shot-${Date.now()}-0`);
    const extractedFacts = extractor.extractAndHydrateFacts({
      shotId: initialShotId,
      scriptText,
      rawConfidenceScore: 0.95
    });

    const primaryChar = extractedFacts.characters[0];
    const primaryEra = extractedFacts.environment.description !== 'UNKNOWN'
      ? extractedFacts.environment.description
      : '19th Century';

    const storyWorldContext: any = {
      storySummary: scriptText.slice(0, 250),
      primaryEra,
      primaryCharacter: primaryChar?.name ?? 'Everyman Subject',
      ageTier: primaryChar?.ageTier ?? 'ADULT',
      wordCount: scriptText.split(/\s+/).filter(Boolean).length
    };

    // 2. Step 2: Plan Visual Beats menggunakan fungsi asli planVisualBeats
    let beatPlannerResult;
    try {
      beatPlannerResult = await planVisualBeats(null, storyWorldContext, scriptText);
    } catch (planErr: any) {
      // Fallback jika Gemini API Rotation bermasalah di level Beat Planner
      const fallbackChunks = scriptText.split(/(?<=[.?!])\s+|\n+/).filter((s) => s.trim().length > 10);
      beatPlannerResult = {
        totalBeatShots: fallbackChunks.length,
        shots: fallbackChunks.map((chunk, idx) => ({
          scene: idx + 1,
          visualBeatType: 'Action',
          naskahChunk: chunk,
          primaryVisualFocus: chunk.slice(0, 60),
          narrativePurpose: 'Visual storytelling beat',
          expectedDuration: '2-3s',
          importance: 'High'
        }))
      };
    }

    const beatShots = beatPlannerResult.shots || [];
    const promptComposer = new PromptComposerEngine();
    const generatedScenes: any[] = [];

    let lastDirectorialSpec: any = undefined;
    let globalAssetLibrary: any[] = [];

    // 3. Iterasi Pemrosesan Berantai Setiap Shot
    for (let i = 0; i < beatShots.length; i++) {
      const beatShot = beatShots[i];
      const shotId = createShotId(`shot-${Date.now()}-${i + 1}`);

      // Step 3: Formulate Directorial Intent
      let directorialSpec;
      try {
        directorialSpec = await formulateDirectorialIntent(
          null,
          storyWorldContext,
          beatShot,
          lastDirectorialSpec,
          undefined
        );
      } catch {
        directorialSpec = {
          shotSize: 'Medium Shot',
          angle: 'Eye Level',
          movement: 'Static Hold',
          lightingMood: 'Atmospheric sinematik',
          compositionGoal: 'Clean visual focus',
          emotionalEmphasis: beatShot.primaryVisualFocus
        };
      }
      lastDirectorialSpec = directorialSpec;

      // Step 4: Resolve Production Resources
      let resourcesResult;
      try {
        resourcesResult = await resolveProductionResources(
          null,
          storyWorldContext,
          beatShot,
          directorialSpec,
          globalAssetLibrary,
          undefined
        );

        if (resourcesResult.assetDecision?.createdAsset) {
          globalAssetLibrary.push(resourcesResult.assetDecision.createdAsset);
        }
      } catch {
        resourcesResult = {
          scene: beatShot.scene ?? i + 1,
          assetDecision: { assetStatus: i === 0 ? 'NEW' : 'POSE_SWAP' },
          sceneSpecification: { action: beatShot.primaryVisualFocus }
        };
      }

      // Step 5: Triad Prompt Composition
      const isStateChanged = i === 0 || resourcesResult.assetDecision?.assetStatus === 'NEW';
      const composerResult = promptComposer.composePrompt({
        shotId,
        visualFocus: beatShot.primaryVisualFocus,
        naskahChunk: beatShot.naskahChunk,
        ageTier: storyWorldContext.ageTier,
        era: storyWorldContext.primaryEra,
        cameraSpec: directorialSpec,
        isStateChanged
      });

      generatedScenes.push({
        scene: beatShot.scene ?? i + 1,
        shotId,
        naskahChunk: beatShot.naskahChunk,
        directorNote: composerResult.directorNote,
        prompts: composerResult.prompts,
        routingDecision: composerResult.routingDecision,
        assetDecision: resourcesResult.assetDecision,
        sceneSpecification: resourcesResult.sceneSpecification
      });
    }

    // HTTP 200 Response dengan Seluruh Urutan Triad Shot
    return NextResponse.json(
      {
        success: true,
        totalShots: generatedScenes.length,
        scenes: generatedScenes
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'PIPELINE_ORCHESTRATION_ERROR',
        message: err?.message ?? 'Terjadi kesalahan pada eksekusi pipeline.'
      },
      { status: 500 }
    );
  }
}
