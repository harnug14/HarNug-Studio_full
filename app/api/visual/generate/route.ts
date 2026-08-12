/**
 * ========================================================================================
 * HARNUG STUDIO — VISUAL DIRECTOR ENGINE
 * File: app/api/visual/generate/route.ts
 * Step: 15 of 15 (Main Pipeline API Orchestrator — Triad Multi-Shot Sequence Engine)
 * Status: PRODUCTION-READY (LOCKED)
 * ========================================================================================
 * Orchestrator API Route Next.js App Router (POST).
 * Memecah naskah narasi menjadi urutan CanonicalShot berantai (Shot #01, #02, dst.),
 * membangun DAG Dependency Graph, dan menghasilkan 3 varian prompt Google Flow per shot
 * (Full Scene, Clean Background, Isolated Green Screen).
 * ========================================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  ShotId,
  CanonicalShot,
  CharacterRoleType,
  CharacterAgeTier,
  createShotId,
  createCharacterId,
  createEnvId,
  createAssetId
} from '@/lib/visual/domain-model';
import { StoryWorldExtractor } from '@/lib/visual/story-world/story-world';
import { VisualBeatPlanner } from '@/lib/visual/beat-planner/beat-planner';
import { DirectorialEngine } from '@/lib/visual/directorial/directorial-intent';
import { ProductionResourcesEngine } from '@/lib/visual/production/production-resources';
import { ShotDependencyGraphEngine } from '@/lib/visual/graph/dependency-graph';
import { PromptComposerEngine } from '@/lib/visual/composer/prompt-composer';
import { QualitySafeguardValidator } from '@/lib/visual/validator/quality-validator';
import { VendorExecutorEngine } from '@/lib/visual/execution/executor';

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

    // 1. Pemecahan Naskah Narasi menjadi Segment Kalimat/Shot
    const rawChunks = scriptText
      .split(/(?<=[.?!])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    const scriptChunks = rawChunks.length > 0 ? rawChunks : [scriptText.trim()];

    // 2. Inisialisasi Engine Modul 1-8
    const extractor = new StoryWorldExtractor();
    const beatPlanner = new VisualBeatPlanner();
    const directorialEngine = new DirectorialEngine();
    const resourcesEngine = new ProductionResourcesEngine();
    const graphEngine = new ShotDependencyGraphEngine();
    const promptComposer = new PromptComposerEngine();
    const validator = new QualitySafeguardValidator();
    const executor = new VendorExecutorEngine(process.env.GEMINI_API_KEYS?.split(','));

    const generatedShots: any[] = [];
    let previousShotId: ShotId | null = null;

    const defaultRoleType: CharacterRoleType = body.roleType ?? 'GENERIC_EVERYMAN';
    const defaultAgeTier: CharacterAgeTier = body.ageTier ?? 'ADULT';

    // 3. Iterasi Pemrosesan Berantai untuk Setiap Shot (Canonical Timeline)
    for (let i = 0; i < scriptChunks.length; i++) {
      const chunkText = scriptChunks[i];
      const shotId = createShotId(`shot-${Date.now()}-${i + 1}`);

      // Layer 1 & 3: Fact Extraction
      const extractedFacts = extractor.extractAndHydrateFacts({
        shotId,
        scriptText: chunkText,
        rawCharacterNames: body.characters ?? [],
        rawObjectNames: body.objects ?? [],
        rawEnvironmentText: body.environment ?? '',
        rawConfidenceScore: body.confidenceScore ?? 0.90
      });

      // Gate 1 Fail-Fast Check (< 0.80)
      if (!extractor.meetsGate1ConfidenceThreshold(extractedFacts.confidence)) {
        return NextResponse.json(
          {
            error: 'GATE_1_FAIL_FAST',
            message: `Shot #${i + 1} extraction confidence ${extractedFacts.confidence.toFixed(2)} is below 0.80`,
            failedShotIndex: i + 1
          },
          { status: 400 }
        );
      }

      // Canonical Shot Construction
      const canonicalShot: CanonicalShot = Object.freeze({
        shotId,
        sequenceIndex: i + 1,
        scriptText: chunkText,
        extractedFacts,
        characterPhysicalStates: Object.freeze([]),
        objectLifecycleStates: Object.freeze([]),
        camera: Object.freeze({
          angle: body.cameraAngle ?? 'EYE_LEVEL',
          staticHold: true,
          aspectRatio: '9:16' as const
        }),
        timestamp: Date.now()
      });

      // Layer 4: Beat Planner & Directorial Intent
      const beatResult = beatPlanner.planBeatsForShot(canonicalShot);
      const directorialIntent = directorialEngine.generateDirectorialIntent(canonicalShot, beatResult);

      // Layer 3 & 6: Production Resources Registration
      const envId = extractedFacts.environment.id;
      const environmentSpec = Object.freeze({
        envId,
        name: extractedFacts.environment.description !== 'UNKNOWN'
          ? extractedFacts.environment.description
          : 'Historical Setting',
        historicalPeriod: body.historicalPeriod ?? '19th Century',
        locationType: 'Documentary Scene',
        lightingCondition: body.lightingCondition ?? 'Natural Daylight',
        keyElements: Object.freeze([])
      });
      resourcesEngine.registerEnvironmentSpec(environmentSpec);

      const characterId = createCharacterId(`char-${i + 1}`);
      const masterAsset = Object.freeze({
        assetId: createAssetId(`asset-${characterId}`),
        characterId,
        name: extractedFacts.characters[0]?.name ?? 'Master Subject',
        roleType: defaultRoleType,
        ageTier: defaultAgeTier,
        fullBodyAssetUrl: body.masterAssetUrl ?? 'https://storage.harnugstudio.com/assets/master-head-to-toe.png',
        headToToeVerified: true as const,
        backgroundIsolated: true as const,
        anatomicalIntegrity: true as const
      });
      resourcesEngine.registerMasterCharacterAsset(masterAsset);

      const physicalState = Object.freeze({
        characterId,
        pose: 'FULL_BODY_STANDING' as const,
        orientation: i % 2 === 0 ? ('FRONTAL' as const) : ('THREE_QUARTER_LEFT' as const),
        expression: 'SOBER_DOCUMENTARY' as const,
        eyeContact: 'CAMERA_DIRECT' as const,
        locationInScene: `Center Stage ${i + 1}`,
        heldObjectIds: Object.freeze([])
      });

      // Layer 5: Shot Dependency DAG Construction (Shot i depends on Shot i-1)
      graphEngine.addNode({
        shotId,
        dependsOnShotId: previousShotId,
        characterIds: Object.freeze([characterId]),
        objectIds: Object.freeze([]),
        envId
      });

      const viewProjection = graphEngine.createViewProjection(shotId, body.userOverride ?? null);

      // Layer 0 Law 6: Routing Logic (Shot 1 = GENERATE_NEW_MASTER, Shot 2..N = GOOGLE_FLOW_EDIT)
      const isStateChanged = i === 0;

      // Layer 7: Triad Prompt Composer
      const composerResult = promptComposer.composePrompt({
        shotId,
        intent: directorialIntent,
        physicalState,
        masterAsset,
        objects: Object.freeze([]),
        environment: environmentSpec,
        isStateChanged
      });

      // Layer 7: 6-Gate Quality Safeguard Validation
      const qualityReport = validator.validateShot({
        shotId,
        confidenceScore: extractedFacts.confidence,
        masterAsset,
        intent: directorialIntent,
        objects: Object.freeze([]),
        prompt: composerResult.prompts.fullScenePrompt
      });

      if (qualityReport.overallStatus === 'FAIL') {
        return NextResponse.json(
          {
            error: 'QUALITY_SAFEGUARD_VIOLATION',
            message: `Shot #${i + 1} failed quality safeguard checks.`,
            qualityReport
          },
          { status: 422 }
        );
      }

      // Layer 8: Vendor Execution
      const executionResponse = await executor.executePrompt(composerResult);

      generatedShots.push({
        scene: i + 1,
        shotId,
        naskahChunk: chunkText,
        directorNote: composerResult.directorNote,
        prompts: composerResult.prompts,
        routingDecision: composerResult.routingDecision,
        viewProjectionStatus: viewProjection.status,
        qualityReport,
        execution: executionResponse
      });

      previousShotId = shotId;
    }

    // 4. HTTP 200 Response dengan Seluruh Urutan Triad Shot
    return NextResponse.json(
      {
        success: true,
        totalShots: generatedShots.length,
        scenes: generatedShots
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
