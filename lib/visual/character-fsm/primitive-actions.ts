/**
 * VISUAL DIRECTOR ENGINE V5 — PRIMITIVE ACTIONS
 * Universal Action Vocabulary + Allowed Mutation Matrix
 *
 * Each primitive action owns a whitelist of body parts it may change.
 * FSM must validate every transition against this matrix.
 * Illegal mutations must never pass.
 */

import type {
  PrimitiveActionType,
  ActionMutationRule,
  BodyPartKey,
  BodyPartState,
  BodyPartPosition,
  CharacterTransform,
} from "../types";

// ============================================================================
// ALLOWED MUTATION MATRIX
// Each action may ONLY modify the targets in its whitelist.
// ============================================================================

export const MUTATION_MATRIX: Readonly<Record<PrimitiveActionType, ActionMutationRule>> = {
  Raise: {
    allowedTargets: ["rightArm", "leftArm", "head"],
  },
  Lower: {
    allowedTargets: ["rightArm", "leftArm", "head"],
  },
  Grab: {
    allowedTargets: ["rightArm", "leftArm"],
  },
  Release: {
    allowedTargets: ["rightArm", "leftArm"],
  },
  Touch: {
    allowedTargets: ["rightArm", "leftArm"],
  },
  Push: {
    allowedTargets: ["rightArm", "leftArm", "torso"],
  },
  Pull: {
    allowedTargets: ["rightArm", "leftArm", "torso"],
  },
  Hold: {
    allowedTargets: ["rightArm", "leftArm"],
  },
  Open: {
    allowedTargets: ["rightArm", "leftArm"],
  },
  Close: {
    allowedTargets: ["rightArm", "leftArm"],
  },
  Reach: {
    allowedTargets: ["rightArm", "leftArm", "torso"],
  },
  Walk: {
    allowedTargets: ["rightLeg", "leftLeg", "transform"],
  },
  Run: {
    allowedTargets: ["rightLeg", "leftLeg", "rightArm", "leftArm", "transform"],
  },
  Stand: {
    allowedTargets: ["rightLeg", "leftLeg", "transform"],
  },
  Sit: {
    allowedTargets: ["rightLeg", "leftLeg", "torso", "transform"],
  },
  Lean: {
    allowedTargets: ["torso", "transform"],
  },
  Point: {
    allowedTargets: ["rightArm", "leftArm"],
  },
  Turn: {
    allowedTargets: ["torso", "head", "transform"],
  },
  Kneel: {
    allowedTargets: ["rightLeg", "leftLeg", "transform"],
  },
  Look: {
    allowedTargets: ["head"],
  },
};

// ============================================================================
// ACTION EFFECTS
// Pure functions that produce the resulting state for a body part or transform.
// ============================================================================

/**
 * Computes the new BodyPartState for an arm/leg/head/torso after an action is applied.
 */
export function computeBodyPartEffect(
  action: PrimitiveActionType,
  currentPart: BodyPartState,
  object: string | null,
  bodyPartKey?: BodyPartKey
): BodyPartState {
  switch (action) {
    case "Raise":
      return { position: "Raised", holdingObject: currentPart.holdingObject };
    case "Lower":
      return { position: "Lowered", holdingObject: currentPart.holdingObject };
    case "Grab":
      return { position: currentPart.position, holdingObject: object || "object" };
    case "Release":
      return { position: currentPart.position, holdingObject: null };
    case "Touch":
      return { position: "Extended", holdingObject: currentPart.holdingObject };
    case "Push":
      return { position: "Extended", holdingObject: currentPart.holdingObject };
    case "Pull":
      return { position: "Bent", holdingObject: currentPart.holdingObject };
    case "Hold":
      return { position: currentPart.position, holdingObject: object || currentPart.holdingObject };
    case "Open":
      return { position: "Open", holdingObject: currentPart.holdingObject };
    case "Close":
      return { position: "Closed", holdingObject: currentPart.holdingObject };
    case "Reach":
      return { position: "Extended", holdingObject: currentPart.holdingObject };
    case "Point":
      return { position: "Extended", holdingObject: currentPart.holdingObject };
    case "Look":
      return { position: "Raised", holdingObject: null };
    case "Stand":
      return { position: "Neutral", holdingObject: currentPart.holdingObject };
    case "Sit":
      return { position: "Bent", holdingObject: currentPart.holdingObject };
    case "Lean":
      return { position: "Bent", holdingObject: currentPart.holdingObject };
    case "Walk":
      // Sinkronisasi: Walking harus stride (kaki kanan Extended, kaki kiri Bent)
      if (bodyPartKey === "rightLeg") {
        return { position: "Extended", holdingObject: currentPart.holdingObject };
      }
      if (bodyPartKey === "leftLeg") {
        return { position: "Bent", holdingObject: currentPart.holdingObject };
      }
      return currentPart; // Arms unaffected by Walk
    case "Run":
      // Sinkronisasi: Running harus stride (kaki kanan Extended, kaki kiri Bent)
      if (bodyPartKey === "rightLeg") {
        return { position: "Extended", holdingObject: currentPart.holdingObject };
      }
      if (bodyPartKey === "leftLeg") {
        return { position: "Bent", holdingObject: currentPart.holdingObject };
      }
      return currentPart; // Arms preserve state during Run
    case "Turn":
      return { position: currentPart.position, holdingObject: currentPart.holdingObject };
    case "Kneel":
      return { position: "Bent", holdingObject: currentPart.holdingObject };
    default:
      return currentPart;
  }
}

/**
 * Computes the new CharacterTransform after a transform-affecting action.
 */
export function computeTransformEffect(
  action: PrimitiveActionType,
  currentTransform: CharacterTransform,
  _modifier: string
): CharacterTransform {
  switch (action) {
    case "Walk":
      return { pose: "Walking", facing: currentTransform.facing };
    case "Run":
      return { pose: "Running", facing: currentTransform.facing };
    case "Stand":
      return { pose: "Standing", facing: currentTransform.facing };
    case "Sit":
      return { pose: "Sitting", facing: currentTransform.facing };
    case "Lean":
      return { pose: "Leaning", facing: currentTransform.facing };
    case "Kneel":
      return { pose: "Kneeling", facing: currentTransform.facing };
    case "Turn": {
      const facingMap: Record<string, CharacterTransform["facing"]> = {
        left: "Left",
        right: "Right",
        back: "Back",
        forward: "Forward",
      };
      const mod = _modifier.toLowerCase().trim();
      for (const [key, val] of Object.entries(facingMap)) {
        if (mod.includes(key)) {
          return { pose: currentTransform.pose, facing: val };
        }
      }
      // Default: cycle facing
      const cycle: CharacterTransform["facing"][] = ["Forward", "Right", "Back", "Left"];
      const idx = cycle.indexOf(currentTransform.facing);
      return { pose: currentTransform.pose, facing: cycle[(idx + 1) % cycle.length] };
    }
    default:
      return currentTransform;
  }
}

/**
 * Checks whether a given body part target is in the action's allowed mutation whitelist.
 */
export function isTargetAllowed(
  action: PrimitiveActionType,
  target: BodyPartKey | "transform"
): boolean {
  const rule = MUTATION_MATRIX[action];
  if (!rule) return false;
  return rule.allowedTargets.includes(target);
}
