import { transitionCharacterState } from "c:/Users/HarNug/Desktop/harnug-studio-full/lib/visual/character-fsm/fsm-engine";
import { composePrompt } from "c:/Users/HarNug/Desktop/harnug-studio-full/lib/visual/composer/prompt-composer";
import { VisualBeatShot, SceneSpecification } from "c:/Users/HarNug/Desktop/harnug-studio-full/lib/visual/types";

console.log("==================================================================");
console.log("TEST SINKRONISASI PHYSICAL CANON TRANSFORM & LEGS (WALK / RUN)");
console.log("==================================================================\n");

// TEST 1: TRANSISI KE WALK
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

console.log("--- RESULT WALK ---");
console.log("Executed:", resultWalk.executed);
console.log("Transform Pose:", resultWalk.nextState?.transform.pose);
console.log("Right Leg Position:", resultWalk.nextState?.rightLeg.position);
console.log("Left Leg Position:", resultWalk.nextState?.leftLeg.position);
console.log("Validation Errors Count:", resultWalk.validationErrors.length);

const mockSpecWalk: SceneSpecification = {
  scene: 1,
  beat: "Action",
  subject: { character: "Pria utama", object: "-" },
  action: "Berjalan perlahan ke depan sambil mengangkat tangan",
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
  naskahChunk: "Dia berjalan perlahan ke depan",
};

const promptWalk = composePrompt(mockSpecWalk, "Sinematik 3D", "Google Flow", resultWalk.nextState);
console.log("\n--- PROMPT HASIL WALK ---");
console.log(promptWalk.compiledPrompt);

console.log("\n==================================================================");
console.log("PENGUJIAN SINKRONISASI SELESAI!");
console.log("==================================================================");
