import { transitionCharacterState } from "../lib/visual/character-fsm/fsm-engine";
import { validateTransformLegConsistency } from "../lib/visual/character-fsm/validators";
import { composePrompt, cleanActionContext } from "../lib/visual/composer/prompt-composer";
import { VisualBeatShot, SceneSpecification, CharacterState } from "../lib/visual/types";

console.log("==================================================================");
console.log("BUKTI HASIL PENGUJIAN AKTUALE VISUAL DIRECTOR ENGINE V5");
console.log("==================================================================\n");

// ----------------------------------------------------------------------------
// 1. TEST TRANSISI STAND -> WALK
// ----------------------------------------------------------------------------
console.log("=== 1. HASIL TEST TRANSISI STAND -> WALK ===");
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

console.log("FSM Executed        :", resultWalk.executed);
console.log("Transform Pose      :", resultWalk.nextState?.transform.pose);
console.log("Right Leg Position  :", resultWalk.nextState?.rightLeg.position);
console.log("Left Leg Position   :", resultWalk.nextState?.leftLeg.position);

console.log("\nFull CharacterState Result:");
console.log(JSON.stringify(resultWalk.nextState, null, 2));

// ----------------------------------------------------------------------------
// 2. TEST VALIDATOR WALKING + NEUTRAL + NEUTRAL
// ----------------------------------------------------------------------------
console.log("\n=== 2. HASIL TEST VALIDATOR (WALKING + NEUTRAL + NEUTRAL) ===");
const invalidState: CharacterState = {
  head: { position: "Neutral", holdingObject: null },
  torso: { position: "Neutral", holdingObject: null },
  rightArm: { position: "Neutral", holdingObject: null },
  leftArm: { position: "Neutral", holdingObject: null },
  rightLeg: { position: "Neutral", holdingObject: null },
  leftLeg: { position: "Neutral", holdingObject: null },
  transform: { pose: "Walking", facing: "Forward" },
};

console.log("State Input (Invalid):");
console.log(JSON.stringify(invalidState, null, 2));

const validationErrors = validateTransformLegConsistency(invalidState);
console.log("\nOutput Error Validator:");
console.log(JSON.stringify(validationErrors, null, 2));

// ----------------------------------------------------------------------------
// 3. COMPARISON PROMPT SEBELUM & SESUDAH cleanActionContext()
// ----------------------------------------------------------------------------
console.log("\n=== 3. PERBANDINGAN SEBELUM & SESUDAH cleanActionContext() ===");

const rawAction1 = "Berjalan perlahan ke depan sambil mengangkat tangan kanan ke atas.";
const cleanedAction1 = cleanActionContext(rawAction1);

console.log("--- CONTOH 1 ---");
console.log("SEBELUM (Teks Asli Input) :", rawAction1);
console.log("SESUDAH (cleanActionContext):", cleanedAction1);

const rawAction2 = "Sedang memperhatikan etalase toko sambil menoleh ke kiri.";
const cleanedAction2 = cleanActionContext(rawAction2);

console.log("\n--- CONTOH 2 ---");
console.log("SEBELUM (Teks Asli Input) :", rawAction2);
console.log("SESUDAH (cleanActionContext):", cleanedAction2);

// PROMPT HASIL COMPOSER LENGKAP
const mockSpec: SceneSpecification = {
  scene: 1,
  beat: "Action",
  subject: { character: "Pria utama", object: "-" },
  action: rawAction1,
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
  naskahChunk: rawAction1,
};

// Prompt jika DENGAN cleanActionContext (Hasil Akhir Prompt Composer Engine V5)
const promptResult = composePrompt(mockSpec, "Sinematik 3D", "Google Flow", resultWalk.nextState);

console.log("\n--- PROMPT UTUH HASIL PROMPT COMPOSER V5 (BAGIAN AKSI BERSIH) ---");
console.log(promptResult.compiledPrompt);

console.log("\n==================================================================");
