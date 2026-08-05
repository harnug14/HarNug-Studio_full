/**
 * VISUAL DIRECTOR ENGINE V5 — CHARACTER STATE
 * Immutable Value Object Factory
 *
 * GOLDEN RULE #1: Character State is the ONLY source of truth.
 * GOLDEN RULE #2: Only FSM may write Character State.
 */

import type { CharacterState, BodyPartState } from "../types";

/**
 * Creates a neutral body part state — the default "at rest" position.
 */
function createNeutralBodyPart(): BodyPartState {
  return Object.freeze({
    position: "Neutral" as const,
    holdingObject: null,
  });
}

/**
 * Creates the default Character State — neutral standing pose facing forward.
 * This is the genesis state for every new character at the start of a story.
 *
 * Every field is frozen (Object.freeze) to enforce immutability at runtime.
 */
export function createDefaultCharacterState(): CharacterState {
  return Object.freeze({
    head: createNeutralBodyPart(),
    torso: createNeutralBodyPart(),
    rightArm: createNeutralBodyPart(),
    leftArm: createNeutralBodyPart(),
    rightLeg: createNeutralBodyPart(),
    leftLeg: createNeutralBodyPart(),
    transform: Object.freeze({
      pose: "Standing" as const,
      facing: "Forward" as const,
    }),
  });
}

/**
 * Creates a new CharacterState from partial overrides.
 * Returns a fully frozen immutable object.
 *
 * ONLY the FSM engine should call this function.
 */
export function createCharacterState(
  overrides: Partial<{
    head: BodyPartState;
    torso: BodyPartState;
    rightArm: BodyPartState;
    leftArm: BodyPartState;
    rightLeg: BodyPartState;
    leftLeg: BodyPartState;
    transform: { pose: CharacterState["transform"]["pose"]; facing: CharacterState["transform"]["facing"] };
  }>,
  base?: CharacterState
): CharacterState {
  const baseState = base ?? createDefaultCharacterState();

  return Object.freeze({
    head: overrides.head ? Object.freeze({ ...overrides.head }) : baseState.head,
    torso: overrides.torso ? Object.freeze({ ...overrides.torso }) : baseState.torso,
    rightArm: overrides.rightArm ? Object.freeze({ ...overrides.rightArm }) : baseState.rightArm,
    leftArm: overrides.leftArm ? Object.freeze({ ...overrides.leftArm }) : baseState.leftArm,
    rightLeg: overrides.rightLeg ? Object.freeze({ ...overrides.rightLeg }) : baseState.rightLeg,
    leftLeg: overrides.leftLeg ? Object.freeze({ ...overrides.leftLeg }) : baseState.leftLeg,
    transform: overrides.transform
      ? Object.freeze({ ...overrides.transform })
      : baseState.transform,
  });
}
