import { composePrompt } from "../lib/visual/composer/prompt-composer";
import { validateActionAgainstCharacterState } from "../lib/visual/character-fsm/validators";
import { SceneSpecification, CharacterState } from "../lib/visual/types";

console.log("==================================================================");
console.log("TEST: ACTION-STATE CONSISTENCY VALIDATOR V6");
console.log("==================================================================\n");

// Helper: buat SceneSpecification dengan action tertentu
function makeSpec(action: string, scene: number = 1): SceneSpecification {
  return {
    scene,
    beat: "Action",
    subject: { character: "Pria utama", object: "-" },
    action,
    environment: { location: "Jalanan", time: "Siang", weather: "Cerah" },
    camera: { shotSize: "Wide Shot", angle: "Eye Level", movement: "Static Hold", lightingMood: "Sinematik", compositionGoal: "Clean", emotionalEmphasis: "Fokus" },
    focus: "Fokus karakter",
    continuity: { characterId: "Char_01" },
    constraints: ["Full body visible"],
    assetReferences: {},
    narrativePurpose: "Aksi",
    expectedDuration: "2-3s",
    importance: "High",
    naskahChunk: action,
  };
}

let totalTests = 0;
let passedTests = 0;

function test(name: string, passed: boolean) {
  totalTests++;
  if (passed) passedTests++;
  console.log(`[${passed ? "PASS ✓" : "FAIL ✗"}] ${name}`);
}

// ============================================================================
// STATE: Walking, Right Arm Neutral, Head Neutral, Holding = null
// ============================================================================
const stateWalking: CharacterState = {
  head: { position: "Neutral", holdingObject: null },
  torso: { position: "Neutral", holdingObject: null },
  rightArm: { position: "Neutral", holdingObject: null },
  leftArm: { position: "Neutral", holdingObject: null },
  rightLeg: { position: "Extended", holdingObject: null },
  leftLeg: { position: "Bent", holdingObject: null },
  transform: { pose: "Walking", facing: "Forward" },
};

// STATE: Standing, Right Arm Neutral, Head Raised, Holding = null
const stateStanding: CharacterState = {
  head: { position: "Raised", holdingObject: null },
  torso: { position: "Neutral", holdingObject: null },
  rightArm: { position: "Neutral", holdingObject: null },
  leftArm: { position: "Neutral", holdingObject: null },
  rightLeg: { position: "Neutral", holdingObject: null },
  leftLeg: { position: "Neutral", holdingObject: null },
  transform: { pose: "Standing", facing: "Forward" },
};

// STATE: Standing, Right Arm Raised, Head Neutral, Holding kotak
const stateHolding: CharacterState = {
  head: { position: "Neutral", holdingObject: null },
  torso: { position: "Neutral", holdingObject: null },
  rightArm: { position: "Raised", holdingObject: "kotak" },
  leftArm: { position: "Neutral", holdingObject: null },
  rightLeg: { position: "Neutral", holdingObject: null },
  leftLeg: { position: "Neutral", holdingObject: null },
  transform: { pose: "Standing", facing: "Forward" },
};

// --- TEST 1: PASS — AKSI "berjalan menyusuri jalan" + State Walking ---
console.log("--- TEST 1: PASS — Walking + 'berjalan menyusuri jalan' ---");
const errs1 = validateActionAgainstCharacterState("berjalan menyusuri jalan", stateWalking);
test("Validator returns 0 errors", errs1.length === 0);

const prompt1 = composePrompt(makeSpec("berjalan menyusuri jalan"), "Sinematik 3D", "Google Flow", stateWalking);
test("Prompt generated (isValidationPassed = true)", prompt1.isValidationPassed === true);
test("compiledPrompt is not empty", prompt1.compiledPrompt.length > 0);

// --- TEST 2: FAIL — AKSI "berjalan menyusuri jalan" + State Standing ---
console.log("\n--- TEST 2: FAIL — Standing + 'berjalan menyusuri jalan' ---");
const errs2 = validateActionAgainstCharacterState("berjalan menyusuri jalan", stateStanding);
test("Validator returns INVALID_ACTION_STATE", errs2.some(e => e.code === "INVALID_ACTION_STATE"));
test("Error mentions 'berjalan'", errs2.some(e => e.message.includes("berjalan")));

const prompt2 = composePrompt(makeSpec("berjalan menyusuri jalan"), "Sinematik 3D", "Google Flow", stateStanding);
test("Prompt BLOCKED (isValidationPassed = false)", prompt2.isValidationPassed === false);
test("compiledPrompt is empty", prompt2.compiledPrompt === "");

// --- TEST 3: FAIL — AKSI "mengangkat tangan kanan" + State Right Arm Neutral ---
console.log("\n--- TEST 3: FAIL — Right Arm Neutral + 'mengangkat tangan kanan' ---");
const errs3 = validateActionAgainstCharacterState("mengangkat tangan kanan", stateWalking);
test("Validator returns INVALID_ACTION_STATE", errs3.some(e => e.code === "INVALID_ACTION_STATE"));
test("Error field is rightArm", errs3.some(e => e.field === "rightArm"));

const prompt3 = composePrompt(makeSpec("mengangkat tangan kanan"), "Sinematik 3D", "Google Flow", stateWalking);
test("Prompt BLOCKED (isValidationPassed = false)", prompt3.isValidationPassed === false);

// --- TEST 4: FAIL — AKSI "menundukkan kepala" + State Head Raised ---
console.log("\n--- TEST 4: FAIL — Head Raised + 'menundukkan kepala' ---");
const errs4 = validateActionAgainstCharacterState("menundukkan kepala", stateStanding);
test("Validator returns INVALID_ACTION_STATE", errs4.some(e => e.code === "INVALID_ACTION_STATE"));
test("Error field is head", errs4.some(e => e.field === "head"));

const prompt4 = composePrompt(makeSpec("menundukkan kepala"), "Sinematik 3D", "Google Flow", stateStanding);
test("Prompt BLOCKED (isValidationPassed = false)", prompt4.isValidationPassed === false);

// --- TEST 5: FAIL — AKSI "memegang kotak" + State Holding = null ---
console.log("\n--- TEST 5: FAIL — Holding null + 'memegang kotak' ---");
const errs5 = validateActionAgainstCharacterState("memegang kotak", stateWalking);
test("Validator returns INVALID_ACTION_STATE", errs5.some(e => e.code === "INVALID_ACTION_STATE"));

const prompt5 = composePrompt(makeSpec("memegang kotak"), "Sinematik 3D", "Google Flow", stateWalking);
test("Prompt BLOCKED (isValidationPassed = false)", prompt5.isValidationPassed === false);

// --- TEST 6: PASS — AKSI "memegang kotak" + State Holding = "kotak" ---
console.log("\n--- TEST 6: PASS — Holding 'kotak' + 'memegang kotak' ---");
const errs6 = validateActionAgainstCharacterState("memegang kotak", stateHolding);
test("Validator returns 0 errors", errs6.length === 0);

const prompt6 = composePrompt(makeSpec("memegang kotak"), "Sinematik 3D", "Google Flow", stateHolding);
test("Prompt generated (isValidationPassed = true)", prompt6.isValidationPassed === true);

// --- TEST 7: PASS — AKSI "mengangkat tangan kanan" + State Right Arm Raised ---
console.log("\n--- TEST 7: PASS — Right Arm Raised + 'mengangkat tangan kanan' ---");
const errs7 = validateActionAgainstCharacterState("mengangkat tangan kanan", stateHolding);
test("Validator returns 0 errors", errs7.length === 0);

// --- SUMMARY ---
console.log("\n==================================================================");
console.log(`HASIL: ${passedTests}/${totalTests} tests passed`);
console.log(passedTests === totalTests ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗");
console.log("==================================================================");
