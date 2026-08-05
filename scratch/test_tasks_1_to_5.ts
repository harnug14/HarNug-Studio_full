import { transitionCharacterState } from "../lib/visual/character-fsm/fsm-engine";
import { validateTransformLegConsistency, validateCharacterState } from "../lib/visual/character-fsm/validators";
import { composePrompt, cleanActionContext } from "../lib/visual/composer/prompt-composer";
import { VisualBeatShot, SceneSpecification, CharacterState } from "../lib/visual/types";

console.log("==================================================================");
console.log("PENGUJIAN TASK 1 — TASK 5 CONSISTENCY V5");
console.log("==================================================================\n");

// ----------------------------------------------------------------------------
// TEST 3: Uji Transisi Stand -> Walk
// ----------------------------------------------------------------------------
console.log("--- TEST 3: Stand -> Walk ---");
const beatWalk: VisualBeatShot = {
  scene: 1,
  visualBeatType: "Action",
  naskahChunk: "Dia berjalan perlahan ke depan.",
  primaryVisualFocus: "Karakter berjalan",
  narrativePurpose: "Pergerakan",
  expectedDuration: "2-3s",
  importance: "High",
  primaryAction: "Walk",
  targetObject: "transform",
  modifier: "perlahan",
};

const resultWalk = transitionCharacterState(null, beatWalk, {
  primaryAction: "Walk",
  targetObject: "transform",
  modifier: "perlahan",
});

console.log("Transform Pose:", resultWalk.nextState?.transform.pose);
console.log("Right Leg Position:", resultWalk.nextState?.rightLeg.position);
console.log("Left Leg Position:", resultWalk.nextState?.leftLeg.position);

const isTest3Pass =
  resultWalk.nextState?.transform.pose === "Walking" &&
  resultWalk.nextState?.rightLeg.position === "Extended" &&
  resultWalk.nextState?.leftLeg.position === "Bent";

console.log("Hasil Test 3:", isTest3Pass ? "PASS ✓" : "FAIL ✗");

// ----------------------------------------------------------------------------
// TEST 4: Uji Validator (State sengaja salah Walking + Neutral + Neutral)
// ----------------------------------------------------------------------------
console.log("\n--- TEST 4: Uji Validator State Invalid ---");
const invalidState: CharacterState = {
  head: { position: "Neutral", holdingObject: null },
  torso: { position: "Neutral", holdingObject: null },
  rightArm: { position: "Neutral", holdingObject: null },
  leftArm: { position: "Neutral", holdingObject: null },
  rightLeg: { position: "Neutral", holdingObject: null },
  leftLeg: { position: "Neutral", holdingObject: null },
  transform: { pose: "Walking", facing: "Forward" },
};

const errors = validateTransformLegConsistency(invalidState);
console.log("Validation Errors Count:", errors.length);
console.log("First Error Code:", errors[0]?.code);
console.log("First Error Message:", errors[0]?.message);

const isTest4Pass = errors.some((e) => e.code === "INVALID_BODY_STATE");
console.log("Hasil Test 4:", isTest4Pass ? "PASS ✓" : "FAIL ✗");

// ----------------------------------------------------------------------------
// TEST 5: Uji Prompt Composer (AKSI Cleaning)
// ----------------------------------------------------------------------------
console.log("\n--- TEST 5: Uji Prompt Composer AKSI Cleaning ---");
const rawAction = "Berjalan sambil mengangkat tangan kanan ke atas.";
const cleaned = cleanActionContext(rawAction);
console.log("Raw Action Input:", rawAction);
console.log("Cleaned Action Output:", cleaned);

const mockSpec: SceneSpecification = {
  scene: 1,
  beat: "Action",
  subject: { character: "Pria utama", object: "-" },
  action: rawAction,
  environment: { location: "Jalanan", time: "Siang", weather: "Cerah" },
  camera: {
    shotSize: "Wide Shot",
    angle: "Eye Level",
    movement: "Pan Right",
    lightingMood: "Sinematik",
    compositionGoal: "Clean",
    emotionalEmphasis: "Dinamis",
  },
  focus: "Karakter berjalan",
  continuity: { characterId: "Char_01" },
  constraints: ["Full body visible"],
  assetReferences: {},
  narrativePurpose: "Pergerakan",
  expectedDuration: "2-3s",
  importance: "High",
  naskahChunk: rawAction,
};

const promptResult = composePrompt(mockSpec, "Sinematik 3D", "Google Flow", resultWalk.nextState);
console.log("\n--- PROMPT HASIL TEST 5 ---");
console.log(promptResult.compiledPrompt);

const isTest5Pass =
  promptResult.compiledPrompt.includes("Berjalan.") &&
  !promptResult.compiledPrompt.includes("sambil mengangkat tangan");

console.log("\nHasil Test 5:", isTest5Pass ? "PASS ✓" : "FAIL ✗");

console.log("\n==================================================================");
console.log("PENGUJIAN SELESAI!");
console.log("==================================================================");
