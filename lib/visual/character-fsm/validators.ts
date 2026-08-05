/**
 * VISUAL DIRECTOR ENGINE V5 — DOMAIN VALIDATORS
 * Pure validation functions for Character State integrity.
 *
 * Validates:
 * - Illegal mutation (action targets a forbidden body part)
 * - Invalid body state (physically impossible configuration)
 * - Missing body part (incomplete CharacterState)
 * - Continuity violation (impossible state jump)
 */

import type {
  CharacterState,
  CharacterStateValidationError,
  PrimitiveAction,
  BodyPartKey,
  BodyPartState,
} from "../types";
import { isTargetAllowed } from "./primitive-actions";

const ALL_BODY_PARTS: readonly BodyPartKey[] = [
  "head", "torso", "rightArm", "leftArm", "rightLeg", "leftLeg",
] as const;

/**
 * Validates that a proposed action only targets allowed body parts.
 */
export function validateMutationLegality(
  action: PrimitiveAction
): CharacterStateValidationError[] {
  const errors: CharacterStateValidationError[] = [];

  if (!isTargetAllowed(action.action, action.target)) {
    errors.push({
      code: "ILLEGAL_MUTATION",
      message: `Action "${action.action}" is not allowed to modify "${action.target}". Allowed targets: see mutation matrix.`,
      field: action.target,
    });
  }

  return errors;
}

/**
 * Validates that a CharacterState has all required body parts with valid data.
 */
export function validateCompleteness(
  state: CharacterState
): CharacterStateValidationError[] {
  const errors: CharacterStateValidationError[] = [];

  for (const partKey of ALL_BODY_PARTS) {
    const part = state[partKey] as BodyPartState | undefined;
    if (!part) {
      errors.push({
        code: "MISSING_BODY_PART",
        message: `Character state is missing body part: "${partKey}"`,
        field: partKey,
      });
    } else if (!part.position) {
      errors.push({
        code: "INVALID_BODY_STATE",
        message: `Body part "${partKey}" has no position defined`,
        field: partKey,
      });
    }
  }

  if (!state.transform) {
    errors.push({
      code: "MISSING_BODY_PART",
      message: `Character state is missing transform`,
      field: "transform",
    });
  } else {
    if (!state.transform.pose) {
      errors.push({
        code: "INVALID_BODY_STATE",
        message: `Transform has no pose defined`,
        field: "transform.pose",
      });
    }
    if (!state.transform.facing) {
      errors.push({
        code: "INVALID_BODY_STATE",
        message: `Transform has no facing defined`,
        field: "transform.facing",
      });
    }
  }

  return errors;
}

/**
 * Task 2: Validates consistency between CharacterTransform pose and Leg positions.
 * Rules:
 * - Walking / Running: Legs MUST NOT both be Neutral (must be stride: Extended/Bent).
 * - Standing: Both legs MUST be Neutral.
 * - Sitting: Both legs MUST be Bent.
 * - Kneeling: Both legs MUST be Bent.
 */
export function validateTransformLegConsistency(
  state: CharacterState
): CharacterStateValidationError[] {
  const errors: CharacterStateValidationError[] = [];
  const pose = state.transform.pose;
  const rLeg = state.rightLeg.position;
  const lLeg = state.leftLeg.position;

  // Walking / Running: Both legs cannot be Neutral
  if (
    (pose === "Walking" || pose === "Running") &&
    rLeg === "Neutral" && lLeg === "Neutral"
  ) {
    errors.push({
      code: "INVALID_BODY_STATE",
      message: `Transform "${pose}" tidak konsisten dengan posisi kaki (keduanya Neutral). Harus berupa posisi stride (Extended/Bent).`,
      field: "rightLeg,leftLeg",
    });
  }

  // Walking / Running: Both legs cannot be Bent (sitting position)
  if (
    (pose === "Walking" || pose === "Running") &&
    rLeg === "Bent" && lLeg === "Bent"
  ) {
    errors.push({
      code: "INVALID_BODY_STATE",
      message: `Transform "${pose}" tidak konsisten dengan posisi kaki (keduanya Bent). Kaki harus posisi stride, bukan duduk.`,
      field: "rightLeg,leftLeg",
    });
  }

  // Standing: Both legs must be Neutral
  if (
    pose === "Standing" &&
    (rLeg !== "Neutral" || lLeg !== "Neutral")
  ) {
    errors.push({
      code: "INVALID_BODY_STATE",
      message: `Transform "Standing" tidak konsisten dengan posisi kaki (Right: ${rLeg}, Left: ${lLeg}). Kedua kaki harus Neutral saat berdiri.`,
      field: "rightLeg,leftLeg",
    });
  }

  // Sitting: Both legs must be Bent
  if (
    pose === "Sitting" &&
    (rLeg !== "Bent" || lLeg !== "Bent")
  ) {
    errors.push({
      code: "INVALID_BODY_STATE",
      message: `Transform "Sitting" tidak konsisten dengan posisi kaki (Right: ${rLeg}, Left: ${lLeg}). Kedua kaki harus Bent saat duduk.`,
      field: "rightLeg,leftLeg",
    });
  }

  // Kneeling: Both legs must be Bent
  if (
    pose === "Kneeling" &&
    (rLeg !== "Bent" || lLeg !== "Bent")
  ) {
    errors.push({
      code: "INVALID_BODY_STATE",
      message: `Transform "Kneeling" tidak konsisten dengan posisi kaki (Right: ${rLeg}, Left: ${lLeg}). Kedua kaki harus Bent saat berlutut.`,
      field: "rightLeg,leftLeg",
    });
  }

  return errors;
}

/**
 * Validates physical plausibility & Transform/Legs consistency.
 */
export function validatePhysicalPlausibility(
  state: CharacterState
): CharacterStateValidationError[] {
  return validateTransformLegConsistency(state);
}

/**
 * Validates continuity between previous and next state.
 * Detects impossible jumps (e.g., going from Sitting to Running without Standing first).
 * Returns warnings (non-blocking) — FSM may still proceed but logs the issue.
 */
export function validateContinuity(
  previousState: CharacterState,
  nextState: CharacterState
): CharacterStateValidationError[] {
  const errors: CharacterStateValidationError[] = [];

  // Sitting → Running without Standing intermediate is suspicious but not blocking
  if (
    previousState.transform.pose === "Sitting" &&
    nextState.transform.pose === "Running"
  ) {
    errors.push({
      code: "CONTINUITY_VIOLATION",
      message: `Transition from "Sitting" to "Running" is abrupt — intermediate "Standing" recommended.`,
      field: "transform.pose",
    });
  }

  // Kneeling → Running without Standing intermediate
  if (
    previousState.transform.pose === "Kneeling" &&
    nextState.transform.pose === "Running"
  ) {
    errors.push({
      code: "CONTINUITY_VIOLATION",
      message: `Transition from "Kneeling" to "Running" is abrupt — intermediate "Standing" recommended.`,
      field: "transform.pose",
    });
  }

  return errors;
}

/**
 * Runs all validators on a completed CharacterState.
 * Returns all errors combined.
 */
export function validateCharacterState(
  state: CharacterState,
  previousState?: CharacterState
): CharacterStateValidationError[] {
  const errors: CharacterStateValidationError[] = [
    ...validateCompleteness(state),
    ...validatePhysicalPlausibility(state),
  ];

  if (previousState) {
    errors.push(...validateContinuity(previousState, state));
  }

  return errors;
}

// ============================================================================
// ACTION-STATE CONSISTENCY VALIDATOR V6
// Character State = Single Source of Truth.
// AKSI tidak boleh mendeskripsikan gerakan fisik yang bertentangan dengan State.
// ============================================================================

interface ActionStateRule {
  readonly patterns: RegExp[];
  readonly check: (state: CharacterState) => boolean;
  readonly expectation: string;
  readonly field: string;
}

/**
 * Validates that the AKSI text is consistent with the current CharacterState.
 * If the AKSI describes a physical action that contradicts the state,
 * returns INVALID_ACTION_STATE errors.
 */
export function validateActionAgainstCharacterState(
  actionText: string,
  state: CharacterState
): CharacterStateValidationError[] {
  if (!actionText || !state) return [];

  const errors: CharacterStateValidationError[] = [];
  const lowerAction = actionText.toLowerCase();

  const rules: ActionStateRule[] = [
    // === HEAD ===
    {
      patterns: [/menunduk/i, /menundukkan\s+kepala/i],
      check: (s) => s.head.position === "Lowered",
      expectation: "Head = Lowered",
      field: "head",
    },
    {
      patterns: [/mendongak/i, /mengangkat\s+kepala/i],
      check: (s) => s.head.position === "Raised",
      expectation: "Head = Raised",
      field: "head",
    },
    {
      patterns: [/menoleh/i],
      check: (s) => s.head.position !== "Neutral",
      expectation: "Head != Neutral (harus Turned/Raised/Lowered)",
      field: "head",
    },

    // === RIGHT ARM ===
    {
      patterns: [/mengangkat\s+tangan\s+kanan/i, /mengangkat\s+siku\s+kanan/i],
      check: (s) => s.rightArm.position === "Raised",
      expectation: "Right Arm = Raised",
      field: "rightArm",
    },
    {
      patterns: [/mengulurkan\s+tangan\s+kanan/i],
      check: (s) => s.rightArm.position === "Extended",
      expectation: "Right Arm = Extended",
      field: "rightArm",
    },

    // === LEFT ARM ===
    {
      patterns: [/mengangkat\s+tangan\s+kiri/i],
      check: (s) => s.leftArm.position === "Raised",
      expectation: "Left Arm = Raised",
      field: "leftArm",
    },
    {
      patterns: [/mengulurkan\s+tangan\s+kiri/i],
      check: (s) => s.leftArm.position === "Extended",
      expectation: "Left Arm = Extended",
      field: "leftArm",
    },

    // === LEGS / TRANSFORM ===
    {
      patterns: [/berjalan/i],
      check: (s) => s.transform.pose === "Walking",
      expectation: "Transform = Walking",
      field: "transform.pose",
    },
    {
      patterns: [/berlari/i],
      check: (s) => s.transform.pose === "Running",
      expectation: "Transform = Running",
      field: "transform.pose",
    },
    {
      patterns: [/berdiri/i],
      check: (s) => s.transform.pose === "Standing",
      expectation: "Transform = Standing",
      field: "transform.pose",
    },
    {
      patterns: [/duduk/i],
      check: (s) => s.transform.pose === "Sitting",
      expectation: "Transform = Sitting",
      field: "transform.pose",
    },
    {
      patterns: [/berlutut/i],
      check: (s) => s.transform.pose === "Kneeling",
      expectation: "Transform = Kneeling",
      field: "transform.pose",
    },

    // === HOLDING OBJECT ===
    {
      patterns: [/memegang/i, /menggenggam/i, /membawa/i],
      check: (s) => !!(s.rightArm.holdingObject || s.leftArm.holdingObject),
      expectation: "Salah satu arm harus memiliki holdingObject",
      field: "rightArm,leftArm",
    },
  ];

  for (const rule of rules) {
    const matched = rule.patterns.some((p) => p.test(lowerAction));
    if (matched && !rule.check(state)) {
      // Extract the matching keyword for the error message
      const matchedPattern = rule.patterns.find((p) => p.test(lowerAction));
      const matchResult = matchedPattern ? lowerAction.match(matchedPattern) : null;
      const matchedText = matchResult ? matchResult[0] : "?";

      errors.push({
        code: "INVALID_ACTION_STATE",
        message: `Action "${matchedText}" bertentangan dengan Character State (${rule.field} tidak sesuai). Diharapkan: ${rule.expectation}.`,
        field: rule.field,
      });
    }
  }

  return errors;
}
