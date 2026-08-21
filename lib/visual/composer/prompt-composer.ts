/**
 * ========================================================================================
 * HARNUG STUDIO — VISUAL DIRECTOR ENGINE
 * File: lib/visual/composer/prompt-composer.ts
 * Step: 12 of 15 (Modul 6 Prompt Composer — Triad Flow Prompts & Unreal Engine 5)
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

export interface PromptCompositionInput {
  readonly shotId: ShotId;
  readonly intent?: DirectorialIntent | any;
  readonly physicalState?: PhysicalState | any;
  readonly masterAsset?: MasterCharacterAsset | any;
  readonly objects?: ReadonlyArray<DomainObject> | any[];
  readonly environment?: EnvironmentSpec | any;
  readonly isStateChanged?: boolean;
  readonly naskahChunk?: string;
  readonly visualFocus?: string;
  readonly ageTier?: string;
  readonly era?: string;
  readonly cameraSpec?: any;
}

/**
 * Prompt Composer Engine (Generates Master, Clean BG, and Green Screen Prompts)
 */
export class PromptComposerEngine {
  /**
   * Menyusun Triad Prompt Set (Full Scene, Clean BG, Isolated Character)
   */
  public composePrompt(input: PromptCompositionInput): PromptComposerResult {
    const isStateChanged = input.isStateChanged ?? true;
    const routingDecision: PromptRoutingDecision = isStateChanged ? 'GENERATE_NEW_MASTER' : 'GOOGLE_FLOW_EDIT';

    const stylePrefix = 'High-end cinematic 3D visual style, Unreal Engine 5 render aesthetic, stylized realism, vertical 9:16 aspect ratio.';
    const eraText = input.era ?? '19th Century';
    const ageDesc = input.ageTier ? `${input.ageTier.toLowerCase().replace('_', '-')} generic human character` : 'generic adult human character';
    const focusText = input.visualFocus ?? input.naskahChunk ?? 'documentary scene focus';

    // 1. Master Full Scene Prompt
    const subjectDesc = `A full-body shot of a ${ageDesc}, positioned in a ${eraText} era setting, focused on ${focusText}, wearing historically accurate period-appropriate clothing.`;
    const envDesc = `Set in a detailed ${eraText} documentary environment with natural atmospheric cinematic lighting.`;
    const cameraDesc = input.cameraSpec
      ? `Captured with ${input.cameraSpec.shotSize ?? 'Medium Shot'}, ${input.cameraSpec.angle ?? 'Eye Level'} camera angle, ${input.cameraSpec.movement ?? 'Static Hold'} camera movement.`
      : `Captured from a static eye-level camera angle with center human composition.`;

    const rawFullPrompt = `${stylePrefix} ${subjectDesc} ${envDesc} ${cameraDesc}`;
    const fullScenePrompt = this.sanitizeToPureSingleParagraph(rawFullPrompt);

    // 2. Clean Background Prompt (Google Flow Edit: Remove Character)
    const rawCleanBgPrompt = `[GOOGLE_FLOW_EDIT] Clean background environment plate. Remove character subject. Retain exact layout, furniture, architecture, props, and atmospheric lighting during the ${eraText} era without any human subject. Vertical 9:16 framing.`;
    const cleanBackgroundPrompt = this.sanitizeToPureSingleParagraph(rawCleanBgPrompt);

    // 3. Isolated Character Prompt (Google Flow Edit: Green Screen / Solid BG)
    const rawIsolatedPrompt = `[GOOGLE_FLOW_EDIT] Isolated character subject on solid chroma green screen background #00FF00. Retain exact facial features, facial identity, ${ageDesc} age tier, posture, ${eraText} period clothing, and cinematic lighting from master scene. Remove environment, keep subject intact. Vertical 9:16 framing.`;
    const isolatedCharacterPrompt = this.sanitizeToPureSingleParagraph(rawIsolatedPrompt);

    const prompts: TriadPromptSet = Object.freeze({
      fullScenePrompt,
      cleanBackgroundPrompt,
      isolatedCharacterPrompt
    });

    const directorNote = `Shot #${input.shotId} — ${input.cameraSpec?.angle ?? 'Eye Level'} | ${eraText} | Focus: ${focusText}`;

    return Object.freeze({
      shotId: input.shotId,
      prompts,
      directorNote,
      routingDecision,
      characterAssetId: input.masterAsset?.assetId,
      environmentAssetId: input.environment?.envId
    });
  }

  /**
   * Membersihkan string dari newline, header, dan token terlarang
   */
  public sanitizeToPureSingleParagraph(text: string): PureSingleParagraphPrompt {
    let cleaned = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/Shot #\d+/g, '').replace(/CONSTRAINTS:/g, '').replace(/STYLE:/g, '');
    return cleaned.trim() as PureSingleParagraphPrompt;
  }
}
