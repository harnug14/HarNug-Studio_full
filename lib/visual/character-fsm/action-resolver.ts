/**
 * VISUAL DIRECTOR ENGINE V5 — ACTION RESOLVER
 * Deterministic keyword-based mapping from natural language to PrimitiveAction.
 *
 * No LLM. No AI. Pure software logic.
 * Maps the free-text primaryVisualFocus / action description from a VisualBeat
 * to the closest matching PrimitiveAction.
 *
 * Falls back to "Hold" (state preservation) if no keyword matches.
 */

import type {
  PrimitiveActionType,
  PrimitiveAction,
  BodyPartKey,
  VisualBeatShot,
  StructuredBeatAction,
} from "../types";

// ============================================================================
// KEYWORD → ACTION MAP
// Order matters: more specific keywords first.
// ============================================================================

const ACTION_KEYWORDS: ReadonlyArray<{ keywords: readonly string[]; action: PrimitiveActionType }> = [
  { keywords: ["grab", "mengambil", "meraih", "grasp", "seize", "menggenggam"], action: "Grab" },
  { keywords: ["release", "melepas", "melepaskan", "let go", "drop", "menjatuhkan"], action: "Release" },
  { keywords: ["raise", "mengangkat", "angkat", "lift", "hoist", "elevate"], action: "Raise" },
  { keywords: ["lower", "menurunkan", "turunkan", "put down"], action: "Lower" },
  { keywords: ["point", "menunjuk", "tunjuk", "gesture", "arahkan"], action: "Point" },
  { keywords: ["touch", "menyentuh", "sentuh", "feel", "raba"], action: "Touch" },
  { keywords: ["push", "mendorong", "dorong", "shove"], action: "Push" },
  { keywords: ["pull", "menarik", "tarik", "drag"], action: "Pull" },
  { keywords: ["open", "membuka", "buka"], action: "Open" },
  { keywords: ["close", "menutup", "tutup", "shut"], action: "Close" },
  { keywords: ["reach", "menjangkau", "jangkau", "stretch"], action: "Reach" },
  { keywords: ["kneel", "berlutut", "lutut"], action: "Kneel" },
  { keywords: ["run", "berlari", "lari", "sprint", "dash"], action: "Run" },
  { keywords: ["walk", "berjalan", "jalan", "melangkah", "langkah", "stride"], action: "Walk" },
  { keywords: ["sit", "duduk", "sitting", "seated"], action: "Sit" },
  { keywords: ["stand", "berdiri", "bangkit", "rise"], action: "Stand" },
  { keywords: ["lean", "bersandar", "sandar", "condong"], action: "Lean" },
  { keywords: ["turn", "berbalik", "menoleh", "berputar", "putar", "rotate"], action: "Turn" },
  { keywords: ["look", "melihat", "lihat", "menatap", "tatap", "gaze", "stare", "memandang"], action: "Look" },
  { keywords: ["hold", "memegang", "pegang", "carry", "membawa", "bawa", "genggam"], action: "Hold" },
];

// ============================================================================
// TARGET BODY PART KEYWORDS
// ============================================================================

const TARGET_KEYWORDS: ReadonlyArray<{ keywords: readonly string[]; target: BodyPartKey }> = [
  { keywords: ["right arm", "tangan kanan", "lengan kanan", "right hand"], target: "rightArm" },
  { keywords: ["left arm", "tangan kiri", "lengan kiri", "left hand"], target: "leftArm" },
  { keywords: ["head", "kepala", "wajah", "face", "muka"], target: "head" },
  { keywords: ["torso", "badan", "tubuh", "body", "dada", "chest", "punggung", "back"], target: "torso" },
  { keywords: ["right leg", "kaki kanan", "right foot"], target: "rightLeg" },
  { keywords: ["left leg", "kaki kiri", "left foot"], target: "leftLeg" },
  { keywords: ["arm", "tangan", "lengan", "hand"], target: "rightArm" }, // Default to right arm
  { keywords: ["leg", "kaki", "foot"], target: "rightLeg" }, // Default to right leg
];

/**
 * Resolves a PrimitiveActionType from a natural language text.
 * Returns "Hold" if no keyword matches (safe fallback — preserves state).
 */
export function resolveActionType(text: string): PrimitiveActionType {
  const lower = text.toLowerCase();

  for (const entry of ACTION_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return entry.action;
      }
    }
  }

  return "Hold"; // Default: preserve current state
}

/**
 * Resolves a body part target from natural language text.
 * Returns "rightArm" as default if no target is identifiable.
 */
export function resolveTarget(text: string, action: PrimitiveActionType): BodyPartKey | "transform" {
  const lower = text.toLowerCase();

  // Transform-affecting actions always target transform
  const transformActions: ReadonlyArray<PrimitiveActionType> = ["Walk", "Run", "Stand", "Sit", "Lean", "Kneel"];
  if (transformActions.includes(action)) {
    return "transform";
  }

  // Head-specific actions
  if (action === "Look" || action === "Turn") {
    return "head";
  }

  // Try to find body part from text
  for (const entry of TARGET_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return entry.target;
      }
    }
  }

  // Default to right arm for manipulation actions
  return "rightArm";
}

// ============================================================================
// MANNER & ADVERB FILTER FOR HOLDING OBJECT (TUGAS 3)
// Filtering non-object manner strings like "penuh kehati-hatian"
// ============================================================================

const MANNER_PATTERNS = [
  /penuh\s+\w+/gi,
  /secara\s+\w+/gi,
  /dengan\s+(?:hati-hati|kehati-hatian|perlahan|lembut|cepat|kasar|tenang|cermat|pasti)/gi,
  /pelan-pelan|perlahan|lembut|cermat|hati-hati|gently|carefully|slowly|fast|quickly|eagerly|intensely/gi,
];

/**
 * Checks if a string is purely an adverb / manner description rather than an object name.
 */
export function isMannerString(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim().toLowerCase();
  
  // Known manner phrases
  if (
    trimmed.startsWith("penuh ") ||
    trimmed.startsWith("secara ") ||
    trimmed.startsWith("dengan ") ||
    trimmed.includes("perlahan") ||
    trimmed.includes("hati-hati") ||
    trimmed.includes("carefully") ||
    trimmed.includes("slowly") ||
    trimmed.includes("gently")
  ) {
    return true;
  }

  return false;
}

/**
 * Clean object name by removing manner modifiers.
 * Returns null if the remaining string is empty or just a manner word.
 */
export function cleanObjectName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let cleaned = raw.trim();
  if (cleaned.length === 0) return null;

  if (isMannerString(cleaned)) {
    return null;
  }

  // Remove manner patterns from object string
  for (const pattern of MANNER_PATTERNS) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  // Remove leading/trailing prepositions
  cleaned = cleaned.replace(/^(sebuah|suatu|sepasang|a|an|the|dengan|with)\s+/i, "").trim();

  if (cleaned.length === 0 || isMannerString(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * TUGAS 2: CHARACTER PRESENCE DETECTOR
 * Returns true if the scene contains an active character/actor.
 * Returns false if the scene is an environment, landscape, prop insert, or explicitly has no character.
 */
export function hasCharacterInScene(
  beat: VisualBeatShot,
  sceneSpec?: any
): boolean {
  // 1. Explicit check in scene specification subject if available
  if (sceneSpec?.subject?.character) {
    const charSubj = String(sceneSpec.subject.character).trim().toLowerCase();
    const noCharKeywords = [
      "tidak ada karakter",
      "tanpa karakter",
      "no character",
      "none",
      "n/a",
      "-",
      "tidak ada",
      "lingkungan saja",
      "hanya objek",
      "no actor",
    ];

    for (const kw of noCharKeywords) {
      if (charSubj === kw || charSubj.startsWith("tidak ada") || charSubj.startsWith("tanpa ")) {
        return false;
      }
    }
  }

  // 2. Check beat primaryVisualFocus and naskahChunk for actor-less scene indicators
  const combinedText = `${beat?.primaryVisualFocus || ""} ${beat?.naskahChunk || ""}`.toLowerCase();
  
  const actorlessIndicators = [
    "tidak ada karakter",
    "tanpa karakter",
    "no character",
    "environment shot",
    "pemandangan kota",
    "pemandangan alam",
    "close up botol",
    "close up produk",
    "close up objek",
    "insert shot produk",
    "gedung dari luar",
    "ruangan kosong",
    "skylight malam",
    "pemandangan malam",
  ];

  for (const ind of actorlessIndicators) {
    if (combinedText.includes(ind)) {
      // Unless text also explicitly mentions a character action
      const hasActorAction = /(?:karakter|pria|wanita|tokoh|pemeran|dia|he|she|actor)\s+(?:berdiri|duduk|berjalan|melihat|memegang)/i.test(combinedText);
      if (!hasActorAction) {
        return false;
      }
    }
  }

  return true; // Default: assume character is present unless proven otherwise
}

/**
 * Extracts the object being interacted with from the text.
 * TUGAS 3: Strictly returns clean object identity or null. Never returns manner adverbs.
 */
export function resolveObject(text: string, action: PrimitiveActionType): string | null {
  // Only object-related actions get objects
  const objectActions: ReadonlyArray<PrimitiveActionType> = ["Grab", "Release", "Hold", "Touch", "Push", "Pull"];
  if (!objectActions.includes(action)) {
    return null;
  }

  const lower = text.toLowerCase();

  // Try to find object after common prepositions
  const patterns = [
    /(?:memegang|menggenggam|membawa|carrying|holding|grab(?:bing)?|menyentuh)\s+(?:sebuah\s+)?(.+?)(?:\s*[,.]|$)/i,
    /(?:with|dengan)\s+(?:sebuah\s+)?(.+?)(?:\s*[,.]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const candidate = cleanObjectName(match[1]);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Resolves a full PrimitiveAction from a VisualBeatShot.
 * Uses structured fields if available, falls back to keyword matching on primaryVisualFocus.
 * TUGAS 3: Separates object identity from modifier string.
 */
export function resolveActionFromBeat(
  beat: VisualBeatShot,
  structuredAction?: { primaryAction?: string; targetObject?: string; modifier?: string }
): PrimitiveAction {
  // If structured action fields are available from LLM, use them
  if (structuredAction?.primaryAction) {
    const action = resolveActionType(structuredAction.primaryAction);
    const targetText = structuredAction.targetObject || beat.primaryVisualFocus || "";
    const target = resolveTarget(targetText, action);
    
    // TUGAS 3 FIX: Extract clean object identity from targetObject, fallback to candidate object from text
    let object = cleanObjectName(structuredAction.targetObject);
    if (!object) {
      object = resolveObject(beat.primaryVisualFocus || beat.naskahChunk || "", action);
    }

    // Determine modifier: if targetObject was actually a manner string, prepend it to modifier
    let modifier = structuredAction.modifier || "";
    if (isMannerString(structuredAction.targetObject || "")) {
      modifier = structuredAction.targetObject + (modifier ? ` (${modifier})` : "");
    }

    return Object.freeze({
      action,
      target,
      modifier,
      object,
    });
  }

  // Fallback: keyword matching from primaryVisualFocus + naskahChunk
  const combinedText = `${beat.primaryVisualFocus || ""} ${beat.naskahChunk || ""}`;
  const action = resolveActionType(combinedText);
  const target = resolveTarget(combinedText, action);
  const object = resolveObject(combinedText, action);

  return Object.freeze({
    action,
    target,
    modifier: "",
    object,
  });
}

/**
 * Creates a StructuredBeatAction from a beat and optional raw action fields.
 */
export function createStructuredBeatAction(
  beat: VisualBeatShot,
  rawAction?: { primaryAction?: string; targetObject?: string; modifier?: string }
): StructuredBeatAction {
  return Object.freeze({
    beat,
    primaryAction: rawAction?.primaryAction || beat.primaryVisualFocus || "",
    targetObject: rawAction?.targetObject || "",
    modifier: rawAction?.modifier || "",
  });
}



