/**
 * ========================================================================================
 * HARNUG STUDIO — VISUAL DIRECTOR ENGINE
 * File: lib/visual/composer/prompt-composer.ts
 * Step: 12 of 15 (Modul 6 Prompt Composer — Updated for Triad Flow Prompts & Unreal Engine 5)
 * Status: PRODUCTION-READY (LOCKED)
 * ========================================================================================
 * Menyusun 3 varian prompt Google Flow (Master Scene, Clean BG, Isolated Green Screen)
 * dengan gaya High-end 3D Unreal Engine 5, 9:16 vertical, dan sanitasi paragraf murni.
 * ========================================================================================
 */

import {
  ShotId,
  PromptRoutingDecision,
  PureSingleParagraphPrompt,
  TriadPromptSet,
  PromptComposerResult,
  DirectorialIntent,
  PhysicalState,
  DomainObject,
  EnvironmentSpec,
  MasterCharacterAsset
} from '../domain-model';
import { FORBIDDEN_HEADER_TOKENS } from '../config/constraint-registry';
import { PromptRoutingRequestDTO, PromptRoutingResponseDTO } from '../contracts/dto.contract';

export interface PromptCompositionInput {
  readonly shotId: ShotId;
  readonly intent: DirectorialIntent;
  readonly physicalState: PhysicalState;
  readonly masterAsset?: MasterCharacterAsset;
  readonly objects: ReadonlyArray<DomainObject>;
  readonly environment: EnvironmentSpec;
  readonly isStateChanged: boolean;
}

/**
 * Prompt Composer Engine (Generates Master, Clean BG, and Green Screen Prompts)
 */
export class PromptComposerEngine {
  /**
   * Menyusun Triad Prompt Set (Full Scene, Clean BG, Isolated Character)
   */
  public composePrompt(input: PromptCompositionInput): PromptComposerResult {
    const routingDecision = this.evaluateRoutingDecision({
      shotId: input.shotId,
      hasExistingMasterAsset: input.masterAsset !== undefined,
      isPhysicalStateChanged: input.isStateChanged,
      vendorId: 'google-flow'
    });

    const stylePrefix = 'High-end cinematic 3D visual style, Unreal Engine 5 render aesthetic, stylized realism, vertical 9:16 aspect ratio.';

    const ageDesc = input.masterAsset
      ? `${input.masterAsset.ageTier.toLowerCase().replace('_', '-')} generic human character (${input.masterAsset.roleType === 'GENERIC_EVERYMAN' ? 'everyman subject' : 'historical figure'})`
      : 'generic adult human character';

    // 1. Master Full Scene Prompt
    const subjectDesc = input.masterAsset
      ? `A full-body shot of a ${ageDesc}, standing facing ${input.physicalState.orientation.toLowerCase().replace(/_/g, ' ')} in a ${input.physicalState.pose.toLowerCase().replace(/_/g, ' ')} posture with a ${input.physicalState.expression.toLowerCase().replace(/_/g, ' ')} expression, wearing historically accurate ${input.environment.historicalPeriod} period-appropriate clothing.`
      : `A full-body figure positioned in historical setting.`;

    const interactionDesc = input.objects.length > 0
      ? `The subject is at location ${input.physicalState.locationInScene}, interacting with ${input.objects.map((o) => o.name).join(', ')} at ${input.objects[0].currentLocation}.`
      : `The subject is positioned cleanly at ${input.physicalState.locationInScene}.`;

    const envDesc = `Set in ${input.environment.name}, featuring ${input.environment.lightingCondition} lighting during the ${input.environment.historicalPeriod} period with authentic period details.`;
    const cameraDesc = `Captured from a static ${input.intent.cameraPolicy.angle.toLowerCase().replace(/_/g, ' ')} camera angle with ${input.intent.compositionGrid.toLowerCase().replace(/_/g, ' ')} composition.`;

    const rawFullPrompt = `${stylePrefix} ${subjectDesc} ${interactionDesc} ${envDesc} ${cameraDesc}`;
    const fullScenePrompt = this.sanitizeToPureSingleParagraph(rawFullPrompt);

    // 2. Clean Background Prompt (Google Flow Edit: Remove Character)
    const rawCleanBgPrompt = `[GOOGLE_FLOW_EDIT] Clean background environment plate. Remove character subject. Retain exact layout of ${input.environment.name}, furniture, architecture, props, ${input.environment.lightingCondition} lighting, and atmosphere during the ${input.environment.historicalPeriod} era without any human subject. Vertical 9:16 framing.`;
    const cleanBackgroundPrompt = this.sanitizeToPureSingleParagraph(rawCleanBgPrompt);

    // 3. Isolated Character Prompt (Google Flow Edit: Green Screen / Solid BG)
    const rawIsolatedPrompt = `[GOOGLE_FLOW_EDIT] Isolated character subject on solid chroma green screen background #00FF00. Retain exact facial features, facial identity, ${ageDesc} age tier, ${input.physicalState.pose.toLowerCase().replace(/_/g, ' ')} posture, ${input.environment.historicalPeriod} period clothing, and ${input.environment.lightingCondition} lighting from master scene. Remove environment, keep subject intact. Vertical 9:16 framing.`;
    const isolatedCharacterPrompt = this.sanitizeToPureSingleParagraph(rawIsolatedPrompt);

    const prompts: TriadPromptSet = Object.freeze({
      fullScenePrompt,
      cleanBackgroundPrompt,
      isolatedCharacterPrompt
    });

    const directorNote = `Shot #${input.shotId} — ${input.intent.cameraPolicy.angle} | ${input.masterAsset?.ageTier ?? 'ADULT'} | ${input.environment.historicalPeriod}`;

    return Object.freeze({
      shotId: input.shotId,
      prompts,
      directorNote,
      routingDecision: routingDecision.decision,
      characterAssetId: input.masterAsset?.assetId,
      environmentAssetId: input.environment.envId
    });
  }

  /**
   * Evaluasi Routing Boolean Deterministik (Visual Law 6)
   */
  public evaluateRoutingDecision(request: PromptRoutingRequestDTO): PromptRoutingResponseDTO {
    const needsNewMaster = !request.hasExistingMasterAsset || request.isPhysicalStateChanged;
    const decision: PromptRoutingDecision = needsNewMaster ? 'GENERATE_NEW_MASTER' : 'GOOGLE_FLOW_EDIT';
    const reason = needsNewMaster
      ? 'Physical state changed or master asset missing. Requiring new master asset generation.'
      : 'State continuous and master asset exists. Routing to Google Flow inpainting edit.';

    return Object.freeze({
      shotId: request.shotId,
      decision,
      reason,
      targetModel: 'gemini-3.6-flash',
      requiresInpainting: decision === 'GOOGLE_FLOW_EDIT'
    });
  }

  /**
   * Membersihkan string dari newline, header, dan token terlarang
   */
  public sanitizeToPureSingleParagraph(text: string): PureSingleParagraphPrompt {
    let cleaned = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    for (const token of FORBIDDEN_HEADER_TOKENS) {
      if (token !== '\n') {
        cleaned = cleaned.split(token).join('');
      }
    }

    return cleaned.trim() as PureSingleParagraphPrompt;
  }
}
