/**
 * VISUAL DIRECTOR ENGINE V5 — FSM ENGINE
 * Deterministic Finite State Machine for Character Continuity
 *
 * NO AI. NO LLM. NO PROMPT. PURE SOFTWARE LOGIC.
 *
 * GOLDEN RULE #2: Only FSM may write Character State.
 *
 * Transition Model:
 *   (PreviousCharacterState, VisualBeat) → NextCharacterState
 *
 * The FSM always produces a COMPLETE CharacterState. Never partial.
 */

import type {
  CharacterState,
  VisualBeatShot,
  FsmTransitionResult,
  PrimitiveAction,
  BodyPartKey,
  BodyPartState,
} from "../types";
import { createDefaultCharacterState, createCharacterState } from "./character-state";
import { resolveActionFromBeat, hasCharacterInScene } from "./action-resolver";
import {
  isTargetAllowed,
  computeBodyPartEffect,
  computeTransformEffect,
  MUTATION_MATRIX,
} from "./primitive-actions";
import {
  validateMutationLegality,
  validateCharacterState,
} from "./validators";

/**
 * TUGAS 1: Formats a clear, human-readable FSM transition debug log.
 */
export function formatFsmDebugLog(params: {
  sceneNum: number;
  executed: boolean;
  skippedReason?: string;
  action: PrimitiveAction | null;
  previousState: CharacterState | null;
  nextState: CharacterState | null;
  validationErrors: any[];
}): string {
  const { sceneNum, executed, skippedReason, action, previousState, nextState, validationErrors } = params;
  const lines: string[] = [];

  lines.push(`=========================`);
  lines.push(`SHOT ${String(sceneNum).padStart(2, "0")}`);
  lines.push(``);
  lines.push(`Status FSM`);
  lines.push(executed ? `EXECUTED` : `SKIPPED (${skippedReason || "Tidak ada karakter"})`);
  lines.push(``);

  if (!executed || !action || !nextState) {
    lines.push(`Primitive Action\n-`);
    lines.push(``);
    lines.push(`Previous State\n-`);
    lines.push(``);
    lines.push(`Allowed Mutation\n-`);
    lines.push(``);
    lines.push(`Next State\n-`);
    lines.push(``);
    lines.push(`Validation\nSKIPPED`);
    lines.push(`=========================`);
    return lines.join("\n");
  }

  // Primitive Action
  lines.push(`Primitive Action`);
  lines.push(`${action.action} (Target: ${action.target}${action.object ? `, Object: ${action.object}` : ""})`);
  if (action.modifier) {
    lines.push(`Modifier: ${action.modifier}`);
  }
  lines.push(``);

  // Previous State
  lines.push(`Previous State`);
  if (previousState) {
    lines.push(`Head      : ${previousState.head.position}${previousState.head.holdingObject ? ` (holding: ${previousState.head.holdingObject})` : ""}`);
    lines.push(`Right Arm : ${previousState.rightArm.position}${previousState.rightArm.holdingObject ? ` (holding: ${previousState.rightArm.holdingObject})` : ""}`);
    lines.push(`Left Arm  : ${previousState.leftArm.position}${previousState.leftArm.holdingObject ? ` (holding: ${previousState.leftArm.holdingObject})` : ""}`);
    lines.push(`Right Leg : ${previousState.rightLeg.position}`);
    lines.push(`Left Leg  : ${previousState.leftLeg.position}`);
    lines.push(`Transform : ${previousState.transform.pose} | Facing: ${previousState.transform.facing}`);
  } else {
    lines.push(`Genesis (Initial Neutral State)`);
  }
  lines.push(``);

  // Allowed Mutation Matrix
  lines.push(`Allowed Mutation`);
  const rule = MUTATION_MATRIX[action.action];
  const allowedSet = new Set(rule?.allowedTargets || []);
  const allTargets: Array<{ key: BodyPartKey | "transform"; label: string }> = [
    { key: "head", label: "Head" },
    { key: "rightArm", label: "Right Arm" },
    { key: "leftArm", label: "Left Arm" },
    { key: "rightLeg", label: "Right Leg" },
    { key: "leftLeg", label: "Left Leg" },
    { key: "torso", label: "Torso" },
    { key: "transform", label: "Transform" },
  ];

  for (const t of allTargets) {
    const isAllowed = allowedSet.has(t.key);
    lines.push(`${isAllowed ? "✓" : "✗"} ${t.label}`);
  }
  lines.push(``);

  // Next State
  lines.push(`Next State`);
  lines.push(`Head      : ${nextState.head.position}${nextState.head.holdingObject ? ` (holding: ${nextState.head.holdingObject})` : ""}`);
  lines.push(`Right Arm : ${nextState.rightArm.position}${nextState.rightArm.holdingObject ? ` (holding: ${nextState.rightArm.holdingObject})` : ""}`);
  lines.push(`Left Arm  : ${nextState.leftArm.position}${nextState.leftArm.holdingObject ? ` (holding: ${nextState.leftArm.holdingObject})` : ""}`);
  lines.push(`Right Leg : ${nextState.rightLeg.position}`);
  lines.push(`Left Leg  : ${nextState.leftLeg.position}`);
  lines.push(`Transform : ${nextState.transform.pose} | Facing: ${nextState.transform.facing}`);
  lines.push(``);

  // Validation
  lines.push(`Validation`);
  if (validationErrors.length === 0) {
    lines.push(`PASS`);
  } else {
    lines.push(`FAIL (${validationErrors.length} issues)`);
    for (const err of validationErrors) {
      lines.push(`- [${err.code}] ${err.message}`);
    }
  }
  lines.push(`=========================`);

  return lines.join("\n");
}

/**
 * Core FSM transition function (V5 HARDENED).
 *
 * Given a previous CharacterState and a VisualBeatShot, computes the next CharacterState
 * deterministically via the Primitive Action system.
 *
 * TUGAS 2: Skips FSM if scene does not contain an active character.
 * TUGAS 1: Produces human-readable debug logs.
 */
export function transitionCharacterState(
  previousState: CharacterState | null,
  beatShot: VisualBeatShot,
  structuredAction?: { primaryAction?: string; targetObject?: string; modifier?: string },
  sceneSpec?: any
): FsmTransitionResult {
  const sceneNum = typeof beatShot?.scene === "number" ? beatShot.scene : 1;

  // TUGAS 2: Check if character is present in scene
  const characterPresent = hasCharacterInScene(beatShot, sceneSpec);

  if (!characterPresent) {
    const skippedReason = "Scene tidak memiliki karakter (environment/object/landscape)";
    const debugLog = formatFsmDebugLog({
      sceneNum,
      executed: false,
      skippedReason,
      action: null,
      previousState: null,
      nextState: null,
      validationErrors: [],
    });

    console.log(`\n${debugLog}\n`);

    return Object.freeze({
      success: true,
      executed: false,
      skippedReason,
      nextState: null, // No character state created for actor-less scenes
      appliedAction: null,
      validationErrors: [],
      debugLog,
    });
  }

  // Genesis: if no previous state, start from default neutral standing
  const currentState = previousState ?? createDefaultCharacterState();

  // Step 1: Resolve the primitive action from the beat
  const resolvedAction: PrimitiveAction = resolveActionFromBeat(beatShot, structuredAction);

  // Step 2: Validate mutation legality
  const mutationErrors = validateMutationLegality(resolvedAction);

  if (mutationErrors.length > 0) {
    const stateErrors = validateCharacterState(currentState, previousState ?? undefined);
    const allErrors = [...mutationErrors, ...stateErrors];

    const debugLog = formatFsmDebugLog({
      sceneNum,
      executed: true,
      action: resolvedAction,
      previousState: currentState,
      nextState: currentState,
      validationErrors: allErrors,
    });

    console.warn(`\n${debugLog}\n`);

    return Object.freeze({
      success: false,
      executed: true,
      nextState: currentState,
      appliedAction: resolvedAction,
      validationErrors: allErrors,
      debugLog,
    });
  }

  // Step 3: Apply the action to produce next state
  const overrides: Partial<Record<BodyPartKey, BodyPartState>> & {
    transform?: CharacterState["transform"];
  } = {};

  if (resolvedAction.target === "transform") {
    overrides.transform = computeTransformEffect(
      resolvedAction.action,
      currentState.transform,
      resolvedAction.modifier
    );

    const bodyPartKeys: BodyPartKey[] = ["rightLeg", "leftLeg", "rightArm", "leftArm"];
    for (const partKey of bodyPartKeys) {
      if (isTargetAllowed(resolvedAction.action, partKey)) {
        overrides[partKey] = computeBodyPartEffect(
          resolvedAction.action,
          currentState[partKey],
          resolvedAction.object,
          partKey
        );
      }
    }
  } else {
    const targetKey = resolvedAction.target as BodyPartKey;
    overrides[targetKey] = computeBodyPartEffect(
      resolvedAction.action,
      currentState[targetKey],
      resolvedAction.object,
      targetKey
    );
  }

  // Step 4: Construct the complete next state
  const nextState = createCharacterState(overrides, currentState);

  // Step 5: Validate the resulting state
  const validationErrors = validateCharacterState(nextState, previousState ?? undefined);

  // Step 6: Auto-correct physical implausibility — sinkronisasi Transform & Legs
  let finalState = nextState;
  const hasPhysicalError = validationErrors.some((e) => e.code === "INVALID_BODY_STATE");

  if (hasPhysicalError) {
    // Walking/Running + kedua kaki Neutral → koreksi ke stride
    if (
      (finalState.transform.pose === "Walking" || finalState.transform.pose === "Running") &&
      finalState.rightLeg.position === "Neutral" &&
      finalState.leftLeg.position === "Neutral"
    ) {
      finalState = createCharacterState(
        {
          rightLeg: { position: "Extended", holdingObject: finalState.rightLeg.holdingObject },
          leftLeg: { position: "Bent", holdingObject: finalState.leftLeg.holdingObject },
        },
        finalState
      );
    }
    // Walking/Running + kedua kaki Bent → koreksi ke stride
    if (
      (finalState.transform.pose === "Walking" || finalState.transform.pose === "Running") &&
      finalState.rightLeg.position === "Bent" &&
      finalState.leftLeg.position === "Bent"
    ) {
      finalState = createCharacterState(
        {
          rightLeg: { position: "Extended", holdingObject: finalState.rightLeg.holdingObject },
          leftLeg: { position: "Bent", holdingObject: finalState.leftLeg.holdingObject },
        },
        finalState
      );
    }
    // Standing + kaki bukan Neutral → koreksi ke Neutral
    if (
      finalState.transform.pose === "Standing" &&
      (finalState.rightLeg.position !== "Neutral" || finalState.leftLeg.position !== "Neutral")
    ) {
      finalState = createCharacterState(
        {
          rightLeg: { position: "Neutral", holdingObject: finalState.rightLeg.holdingObject },
          leftLeg: { position: "Neutral", holdingObject: finalState.leftLeg.holdingObject },
        },
        finalState
      );
    }
  }

  // Generate debug log string
  const debugLog = formatFsmDebugLog({
    sceneNum,
    executed: true,
    action: resolvedAction,
    previousState: currentState,
    nextState: finalState,
    validationErrors,
  });

  console.log(`\n${debugLog}\n`);

  return Object.freeze({
    success: true,
    executed: true,
    nextState: finalState,
    appliedAction: resolvedAction,
    validationErrors,
    debugLog,
  });
}

/**
 * Convenience: serializes CharacterState to a human-readable description.
 */
export function describeCharacterState(state: CharacterState): string {
  if (!state) return "";
  const parts: string[] = [];

  parts.push(`Pose: ${state.transform.pose}, Facing: ${state.transform.facing}`);
  parts.push(`Head: ${state.head.position}${state.head.holdingObject ? ` (holding: ${state.head.holdingObject})` : ""}`);
  parts.push(`Torso: ${state.torso.position}`);
  parts.push(`Right Arm: ${state.rightArm.position}${state.rightArm.holdingObject ? ` (holding: ${state.rightArm.holdingObject})` : ""}`);
  parts.push(`Left Arm: ${state.leftArm.position}${state.leftArm.holdingObject ? ` (holding: ${state.leftArm.holdingObject})` : ""}`);
  parts.push(`Right Leg: ${state.rightLeg.position}`);
  parts.push(`Left Leg: ${state.leftLeg.position}`);

  return parts.join("\n");
}

