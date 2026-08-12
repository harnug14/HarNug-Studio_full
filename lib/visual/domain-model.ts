/**
 * ========================================================================================
 * HARNUG STUDIO — VISUAL DIRECTOR ENGINE
 * File: lib/visual/domain-model.ts
 * Step: 1 of 15 (Master Domain Models & Interfaces — Updated for Channel Rules & Triad Prompts)
 * Status: PRODUCTION-READY (LOCKED)
 * ========================================================================================
 */

// ========================================================================================
// SECTION 1: PERMANENT BRANDED IDENTIFIERS
// ========================================================================================

export type ShotId = string & { readonly __brand: unique symbol };
export type CharacterId = string & { readonly __brand: unique symbol };
export type ObjectId = string & { readonly __brand: unique symbol };
export type EnvId = string & { readonly __brand: unique symbol };
export type AssetId = string & { readonly __brand: unique symbol };

export const createShotId = (id: string): ShotId => id as ShotId;
export const createCharacterId = (id: string): CharacterId => id as CharacterId;
export const createObjectId = (id: string): ObjectId => id as ObjectId;
export const createEnvId = (id: string): EnvId => id as EnvId;
export const createAssetId = (id: string): AssetId => id as AssetId;

// ========================================================================================
// SECTION 2: CHARACTER ROLE & AGE TIERS (Everyman vs Historical)
// ========================================================================================

/** Character Role Classification */
export type CharacterRoleType = 'GENERIC_EVERYMAN' | 'HISTORICAL_FIGURE';

/** 4 Strict Character Age Tiers */
export type CharacterAgeTier = 'CHILD' | 'ADULT' | 'MIDDLE_AGED' | 'ELDERLY';

export interface CharacterIdentitySpec {
  readonly characterId: CharacterId;
  readonly roleType: CharacterRoleType;
  readonly ageTier: CharacterAgeTier;
  readonly baseReferenceUrl?: string;
  readonly periodSpecificClothing: string;
}

// ========================================================================================
// SECTION 3: THREE-TIER FACT HYDRATION
// ========================================================================================

export type FactHydrationTier = 'EXPLICIT_TEXT' | 'SYSTEM_HYDRATED' | 'UNKNOWN';

export interface FactValue<T> {
  readonly value: T;
  readonly source: FactHydrationTier;
  readonly rawText?: string;
}

export type ExtractionConfidence = number;

// ========================================================================================
// SECTION 4: VISUAL LAWS, CAMERA POLICY & ASPECT RATIO
// ========================================================================================

export type CameraAngle =
  | 'EYE_LEVEL'
  | 'LOW_ANGLE'
  | 'HIGH_ANGLE'
  | 'THREE_QUARTER_VIEW'
  | 'SIDE_VIEW';

export interface CameraFramingPolicy {
  readonly angle: CameraAngle;
  readonly staticHold: true;
  readonly aspectRatio: '9:16'; // Vertical Short-Form
}

// ========================================================================================
// SECTION 5: MASTER ASSETS & PHYSICAL STATE
// ========================================================================================

export interface MasterCharacterAsset {
  readonly assetId: AssetId;
  readonly characterId: CharacterId;
  readonly name: string;
  readonly roleType: CharacterRoleType;
  readonly ageTier: CharacterAgeTier;
  readonly fullBodyAssetUrl: string;
  readonly headToToeVerified: true;
  readonly backgroundIsolated: true;
  readonly anatomicalIntegrity: true;
}

export type CharacterPose =
  | 'FULL_BODY_STANDING'
  | 'FULL_BODY_SEATED'
  | 'FULL_BODY_CROUCHING'
  | 'FULL_BODY_WALKING_HOLD'
  | 'FULL_BODY_ACTION_HOLD';

export type BodyOrientation =
  | 'FRONTAL'
  | 'THREE_QUARTER_LEFT'
  | 'THREE_QUARTER_RIGHT'
  | 'PROFILE_LEFT'
  | 'PROFILE_RIGHT';

export type MicroExpression =
  | 'NEUTRAL'
  | 'FOCUSED'
  | 'SOBER_DOCUMENTARY'
  | 'INTENSE'
  | 'SUBTLE_SMILE';

export type EyeContact =
  | 'CAMERA_DIRECT'
  | 'OFF_CAMERA_LEFT'
  | 'OFF_CAMERA_RIGHT'
  | 'INTERACTING_OBJECT';

export interface PhysicalState {
  readonly characterId: CharacterId;
  readonly pose: CharacterPose;
  readonly orientation: BodyOrientation;
  readonly expression: MicroExpression;
  readonly eyeContact: EyeContact;
  readonly locationInScene: string;
  readonly heldObjectIds: ReadonlyArray<ObjectId>;
}

// ========================================================================================
// SECTION 6: 3-STATE OBJECT LIFECYCLE
// ========================================================================================

export type ObjectLifecycleState =
  | 'STATE_A_ORIGIN'
  | 'STATE_B_CONTACT'
  | 'STATE_C_CARRIED';

export interface DomainObject {
  readonly objectId: ObjectId;
  readonly name: string;
  readonly description: string;
  readonly currentState: ObjectLifecycleState;
  readonly originLocation: string;
  readonly currentLocation: string;
  readonly heldByCharacterId?: CharacterId | null;
}

export interface EnvironmentSpec {
  readonly envId: EnvId;
  readonly name: string;
  readonly historicalPeriod: string;
  readonly locationType: string;
  readonly lightingCondition: string;
  readonly keyElements: ReadonlyArray<string>;
}

// ========================================================================================
// SECTION 7: CANONICAL TIMELINE
// ========================================================================================

export interface ExtractedFactPayload {
  readonly characters: ReadonlyArray<{
    readonly id: CharacterId;
    readonly name: string;
    readonly roleType: CharacterRoleType;
    readonly ageTier: CharacterAgeTier;
    readonly action: string;
  }>;
  readonly objects: ReadonlyArray<{
    readonly id: ObjectId;
    readonly name: string;
    readonly action: string;
  }>;
  readonly environment: {
    readonly id: EnvId;
    readonly description: string;
  };
  readonly confidence: ExtractionConfidence;
}

export interface CanonicalShot {
  readonly shotId: ShotId;
  readonly sequenceIndex: number;
  readonly scriptText: string;
  readonly extractedFacts: ExtractedFactPayload;
  readonly characterPhysicalStates: ReadonlyArray<PhysicalState>;
  readonly objectLifecycleStates: ReadonlyArray<{
    readonly objectId: ObjectId;
    readonly state: ObjectLifecycleState;
  }>;
  readonly camera: CameraFramingPolicy;
  readonly timestamp: number;
}

export interface CanonicalTimeline {
  readonly shots: ReadonlyArray<CanonicalShot>;
}

// ========================================================================================
// SECTION 8: BEAT PLANNER & DIRECTORIAL INTENT
// ========================================================================================

export interface VisualBeat {
  readonly beatId: string;
  readonly shotId: ShotId;
  readonly primaryFocusCharacterId: CharacterId;
  readonly physicalActionDescription: string;
  readonly targetObjectState?: {
    readonly objectId: ObjectId;
    readonly targetState: ObjectLifecycleState;
  };
}

export interface DirectorialIntent {
  readonly shotId: ShotId;
  readonly cameraPolicy: CameraFramingPolicy;
  readonly focalCharacterId: CharacterId;
  readonly compositionGrid: 'CENTER_HUMAN' | 'RULE_OF_THIRDS_HUMAN' | 'WIDE_DOCUMENTARY';
  readonly environmentalMood: string;
  readonly directorNote: string;
}

// ========================================================================================
// SECTION 9: OPTIMIZATION & GRAPH
// ========================================================================================

export type ViewProjectionStatus = 'ENABLED' | 'DISABLED';

export interface HumanUserOverride {
  readonly cameraAngle?: CameraAngle;
  readonly promptSuffix?: string;
  readonly disabledNodes?: ReadonlyArray<string>;
}

export interface ViewProjection {
  readonly shotId: ShotId;
  readonly status: ViewProjectionStatus;
  readonly userOverride?: HumanUserOverride | null;
  readonly lineageGraphHash: string;
}

export interface ShotDependencyNode {
  readonly shotId: ShotId;
  readonly dependsOnShotId?: ShotId | null;
  readonly characterIds: ReadonlyArray<CharacterId>;
  readonly objectIds: ReadonlyArray<ObjectId>;
  readonly envId: EnvId;
}

export interface ShotDependencyGraph {
  readonly nodes: ReadonlyMap<ShotId, ShotDependencyNode>;
}

// ========================================================================================
// SECTION 10: TRIAD PROMPTS & VENDOR ROUTING (Google Flow Inpainting Workflow)
// ========================================================================================

export type PromptRoutingDecision = 'GENERATE_NEW_MASTER' | 'GOOGLE_FLOW_EDIT';

export type PureSingleParagraphPrompt = string;

/**
 * Triad Prompt Set for Layer Separation & Google Flow Inpainting
 */
export interface TriadPromptSet {
  readonly fullScenePrompt: PureSingleParagraphPrompt;
  readonly cleanBackgroundPrompt: PureSingleParagraphPrompt;
  readonly isolatedCharacterPrompt: PureSingleParagraphPrompt;
}

export interface VendorCapabilityProfile {
  readonly vendorId: string;
  readonly modelName: 'gemini-3.6-flash' | string;
  readonly supportsInpainting: boolean;
  readonly supportsImageToImage: boolean;
  readonly maxPromptLength: number;
  readonly supportsSingleParagraph: boolean;
}

export interface RoutingDecisionPayload {
  readonly shotId: ShotId;
  readonly decision: PromptRoutingDecision;
  readonly reason: string;
  readonly stateChanged: boolean;
  readonly masterAssetRequired: boolean;
}

export interface PromptComposerResult {
  readonly shotId: ShotId;
  readonly prompts: TriadPromptSet;
  readonly directorNote: string;
  readonly routingDecision: PromptRoutingDecision;
  readonly characterAssetId?: AssetId;
  readonly environmentAssetId?: EnvId;
}

// ========================================================================================
// SECTION 11: QUALITY & SAFEGUARD GATES
// ========================================================================================

export type GateStatus = 'PASS' | 'FAIL';

export interface GateCheckResult {
  readonly gateNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly gateName: string;
  readonly status: GateStatus;
  readonly score?: number;
  readonly reason: string;
}

export interface QualitySafeguardReport {
  readonly shotId: ShotId;
  readonly overallStatus: GateStatus;
  readonly gateResults: ReadonlyArray<GateCheckResult>;
}

// ========================================================================================
// SECTION 12: INFRASTRUCTURE & RETRY POLICY
// ========================================================================================

export interface ApiRetryConfig {
  readonly targetModel: 'gemini-3.6-flash';
  readonly maxRetries: number;
  readonly retryableStatusCodes: ReadonlyArray<429 | 503>;
  readonly timeoutMs: number;
}
