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
    character?: string;
    object?: string;
  };
  action: string;
  environment: {
    location: string;
    time: string;
    weather?: string;
  };
  camera: DirectorialSpec;
  focus: string;
  continuity: {
    characterId?: string;
    costumeId?: string;
    environmentId?: string;
    previousShotScene?: number;
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