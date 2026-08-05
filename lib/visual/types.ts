/**
 * VISUAL DIRECTOR ENGINE V4 — DOMAIN TYPES
 * Architecture Freeze v1.0 — Immutable Data Contracts
 */

export interface StoryWorldContext {
  storySummary: string;
  primaryEra: string;
  wordCount: number;
  coreIdea: string;
  storyGoal: string;
  narrativeCanonFacts: string[];
}

export interface StoryWorldInput {
  judulNaskah?: string;
  isiNaskah: string;
  visualStyle?: string;
  bridgePoseLevel?: string;
}

export type VisualBeatType =
  | "Establishing"
  | "Action"
  | "Reaction"
  | "Detail"
  | "Insert"
  | "Reveal"
  | "Transition"
  | "Emphasis"
  | "Payoff";

export interface VisualBeatShot {
  scene: number;
  visualBeatType: VisualBeatType;
  naskahChunk: string;
  primaryVisualFocus: string;
  narrativePurpose: string;
  expectedDuration: string;
  importance: "Critical" | "High" | "Medium" | "Low";
  primaryAction?: string;
  targetObject?: string;
  modifier?: string;
}

export interface BeatPlannerResult {
  totalBeatShots: number;
  shots: VisualBeatShot[];
}

export interface DirectorialSpec {
  shotSize: "Extreme Close Up" | "Close Up" | "Medium Shot" | "Wide Shot" | "Extreme Wide Shot";
  angle: "Eye Level" | "Low Angle" | "High Angle" | "Bird Eye View";
  movement: "Static Hold" | "Pan Left" | "Pan Right" | "Tilt Up" | "Tilt Down" | "Slow Zoom In" | "Slow Zoom Out" | "Parallax Shift";
  lightingMood: string;
  compositionGoal: string;
  emotionalEmphasis: string;
}

export interface AssetDecision {
  assetStatus: "REUSED" | "POSE_SWAP" | "NEW";
  targetAssetId?: string;
  newAssetReason?: string;
  productionInstruction?: string;
  createdAsset?: {
    assetId: string;
    assetName: string;
    assetType: "Character" | "Environment" | "Prop";
  };
}

export interface SceneSpecification {
  scene: number;
  beat: VisualBeatType;
  subject: {
    character: string;
    object: string;
  };
  action: string;
  environment: {
    location: string;
    time: string;
    weather: string;
  };
  camera: DirectorialSpec;
  focus: string;
  continuity: {
    characterId?: string;
    costumeId?: string;
    environmentId?: string;
    previousShotScene?: number | null;
  };
  constraints: string[];
  assetReferences: {
    characterAnchor?: string;
    environmentAnchor?: string;
    propAnchor?: string;
  };
  narrativePurpose: string;
  expectedDuration: string;
  importance: "Critical" | "High" | "Medium" | "Low";
  naskahChunk: string;
}

export interface ProductionResourcesResult {
  scene: number;
  assetDecision: AssetDecision;
  sceneSpecification: SceneSpecification;
}

export interface PromptComposerResult {
  compiledPrompt: string;
  vendor: string;
  isValidationPassed: boolean;
  validationErrors?: string[];
}

export interface ExecutionPayload {
  compiledPrompt: string;
  assetDecision: AssetDecision;
  sceneSpecification: SceneSpecification;
  visualStyle?: string;
}

export interface ExecutionResult {
  scene: number;
  status: "Succeeded" | "Failed" | "Skipped";
  vendor: string;
  outputPrompt?: string;
  productionInstruction?: string;
  error?: string;
}

// ============================================================================
// VISUAL DIRECTOR ENGINE V5 — CHARACTER FSM DOMAIN TYPES
// Architecture Migration: Deterministic Character Continuity
// ============================================================================

/**
 * Body part position — the set of physically valid states a body part can be in.
 */
export type BodyPartPosition =
  | "Neutral"
  | "Raised"
  | "Lowered"
  | "Extended"
  | "Bent"
  | "Open"
  | "Closed";

/**
 * Immutable Value Object — single body part physical state.
 */
export interface BodyPartState {
  readonly position: BodyPartPosition;
  readonly holdingObject: string | null;
}

/**
 * Character whole-body transform — pose and facing direction.
 */
export interface CharacterTransform {
  readonly pose: "Standing" | "Sitting" | "Walking" | "Running" | "Leaning" | "Kneeling";
  readonly facing: "Forward" | "Left" | "Right" | "Back";
}

/**
 * GOLDEN RULE #1: Character State is the ONLY source of truth.
 * GOLDEN RULE #2: Only FSM may write Character State.
 * GOLDEN RULE #3: Every layer after FSM is READ ONLY.
 *
 * Immutable Value Object — complete physical state of the character.
 * Every field is readonly. A new object must be constructed for each transition.
 */
export interface CharacterState {
  readonly head: BodyPartState;
  readonly torso: BodyPartState;
  readonly rightArm: BodyPartState;
  readonly leftArm: BodyPartState;
  readonly rightLeg: BodyPartState;
  readonly leftLeg: BodyPartState;
  readonly transform: CharacterTransform;
}

/**
 * Universal primitive action vocabulary — reusable across all historical topics.
 */
export type PrimitiveActionType =
  | "Raise"
  | "Lower"
  | "Grab"
  | "Release"
  | "Touch"
  | "Push"
  | "Pull"
  | "Hold"
  | "Open"
  | "Close"
  | "Reach"
  | "Walk"
  | "Run"
  | "Stand"
  | "Sit"
  | "Lean"
  | "Point"
  | "Turn"
  | "Kneel"
  | "Look";

/**
 * Body part target keys — matching the CharacterState field names.
 */
export type BodyPartKey = "head" | "torso" | "rightArm" | "leftArm" | "rightLeg" | "leftLeg";

/**
 * Structured primitive action with target and modifier.
 */
export interface PrimitiveAction {
  readonly action: PrimitiveActionType;
  readonly target: BodyPartKey | "transform";
  readonly modifier: string;
  readonly object: string | null;
}

/**
 * Structured action fields extracted from a VisualBeat for FSM consumption.
 * This wraps VisualBeatShot with additional structured data without modifying the original type.
 */
export interface StructuredBeatAction {
  readonly beat: VisualBeatShot;
  readonly primaryAction: string;
  readonly targetObject: string;
  readonly modifier: string;
}

/**
 * Allowed Mutation Matrix entry — defines which body parts a primitive action may change.
 */
export interface ActionMutationRule {
  readonly allowedTargets: ReadonlyArray<BodyPartKey | "transform">;
}

/**
 * Validation error from domain validators.
 */
export interface CharacterStateValidationError {
  readonly code: "ILLEGAL_MUTATION" | "INVALID_BODY_STATE" | "MISSING_BODY_PART" | "INVALID_TRANSITION" | "CONTINUITY_VIOLATION" | "INVALID_ACTION_STATE";
  readonly message: string;
  readonly field?: string;
}

/**
 * Result of an FSM state transition.
 */
export interface FsmTransitionResult {
  readonly success: boolean;
  readonly executed: boolean;
  readonly skippedReason?: string;
  readonly nextState: CharacterState | null;
  readonly appliedAction: PrimitiveAction | null;
  readonly validationErrors: CharacterStateValidationError[];
  readonly debugLog?: string;
}