import { composePrompt, cleanActionContext } from "../lib/visual/composer/prompt-composer";
import { SceneSpecification, CharacterState } from "../lib/visual/types";

console.log("==================================================================");
console.log("TEST VERIFIKASI: PENYEMPURNAAN PROMPT COMPOSER V5");
console.log("==================================================================\n");

const mockCharacterState: CharacterState = {
  head: { position: "Neutral", holdingObject: null },
  torso: { position: "Neutral", holdingObject: null },
  rightArm: { position: "Raised", holdingObject: null },
  leftArm: { position: "Neutral", holdingObject: null },
  rightLeg: { position: "Extended", holdingObject: null },
  leftLeg: { position: "Bent", holdingObject: null },
  transform: { pose: "Walking", facing: "Forward" },
};

// ----------------------------------------------------------------------------
// TEST 1: Section JANGAN UBAH (Shot Pertama vs Shot Selanjutnya)
// ----------------------------------------------------------------------------
console.log("--- TEST 1: Section JANGAN UBAH ---");

// Shot 1 (Tidak boleh ada referensi Shot sebelumnya)
const mockSpecShot1: SceneSpecification = {
  scene: 1,
  beat: "Establishing",
  subject: { character: "Pria utama", object: "-" },
  action: "Berjalan di jalanan",
  environment: { location: "Jalanan", time: "Siang", weather: "Cerah" },
  camera: { shotSize: "Wide Shot", angle: "Eye Level", movement: "Pan Right", lightingMood: "Sinematik", compositionGoal: "Clean", emotionalEmphasis: "Fokus" },
  focus: "Suasana jalanan",
  continuity: { characterId: "Char_01", previousShotScene: null },
  constraints: ["Full body visible"],
  assetReferences: {},
  narrativePurpose: "Establishing",
  expectedDuration: "2-3s",
  importance: "High",
  naskahChunk: "Berjalan di jalanan",
};

const promptShot1 = composePrompt(mockSpecShot1, "Sinematik 3D", "Google Flow", mockCharacterState);
const shot1Pass = promptShot1.compiledPrompt.includes("JANGAN UBAH:\nLatar dan gaya visual konsisten") &&
  !promptShot1.compiledPrompt.includes("Pertahankan kontinuitas visual dan warna dari Shot #");

console.log("[Shot #01 JANGAN UBAH]:", shot1Pass ? "PASS ✓" : "FAIL ✗");

// Shot 7 dengan previousShotScene: 6
const mockSpecShot7: SceneSpecification = {
  scene: 7,
  beat: "Action",
  subject: { character: "Pemuda utama", object: "-" },
  action: "menunggu di depan toko",
  environment: { location: "Depan Toko", time: "Siang", weather: "Cerah" },
  camera: { shotSize: "Medium Shot", angle: "Eye Level", movement: "Static Hold", lightingMood: "Atmospheric", compositionGoal: "Clean", emotionalEmphasis: "Fokus" },
  focus: "Karakter menunggu",
  continuity: { characterId: "Char_01", previousShotScene: 6 },
  constraints: ["Full body visible"],
  assetReferences: {},
  narrativePurpose: "Melihat situasi",
  expectedDuration: "2-3s",
  importance: "High",
  naskahChunk: "Menunggu di depan toko",
};

const promptShot7 = composePrompt(mockSpecShot7, "Sinematik 3D", "Google Flow", mockCharacterState);
const shot7Pass = promptShot7.compiledPrompt.includes("JANGAN UBAH:\nPertahankan kontinuitas visual dan warna dari Shot #06");

console.log("[Shot #07 JANGAN UBAH]:", shot7Pass ? "PASS ✓" : "FAIL ✗");

// ----------------------------------------------------------------------------
// TEST 2: Fallback AKSI (No Dummy Text)
// ----------------------------------------------------------------------------
console.log("\n--- TEST 2: AKSI Fallback (Focus Visual -> Subjek Utama -> String Kosong) ---");

// Case A: AKSI berisi pose murni "kaki kanan terentang", Focus Visual = "Karakter memperhatikan toko"
const specFallbackFocus: SceneSpecification = {
  ...mockSpecShot7,
  action: "kaki kanan terentang",
  focus: "Karakter memperhatikan toko",
};
const promptFallbackFocus = composePrompt(specFallbackFocus, "Sinematik 3D", "Google Flow", mockCharacterState);
const hasFocusFallback = promptFallbackFocus.compiledPrompt.includes("AKSI (Konteks Aktivitas Saja — Pose Diatur Oleh Character State):\nKarakter memperhatikan toko");

console.log("[AKSI Fallback Ke Focus Visual]:", hasFocusFallback ? "PASS ✓" : "FAIL ✗");

// Case B: AKSI & Focus Visual keduanya kosong/pose murni, Subjek Utama = "Pendekar Pedang"
const specFallbackSubject: SceneSpecification = {
  ...mockSpecShot7,
  action: "postur berdiri",
  focus: "-",
  subject: { character: "Pendekar Pedang", object: "-" },
};
const promptFallbackSubject = composePrompt(specFallbackSubject, "Sinematik 3D", "Google Flow", mockCharacterState);
const hasSubjectFallback = promptFallbackSubject.compiledPrompt.includes("AKSI (Konteks Aktivitas Saja — Pose Diatur Oleh Character State):\nPendekar Pedang");

console.log("[AKSI Fallback Ke Subjek Utama]:", hasSubjectFallback ? "PASS ✓" : "FAIL ✗");

// Case C: Pastikan TIDAK ADA teks dummy dalam prompt apapun
const hasDummyText = promptShot1.compiledPrompt.includes("Aktivitas naratif adegan") ||
  promptShot7.compiledPrompt.includes("Aktivitas naratif adegan") ||
  promptFallbackFocus.compiledPrompt.includes("Aktivitas naratif adegan") ||
  promptFallbackSubject.compiledPrompt.includes("Aktivitas naratif adegan");

console.log("[Tidak Ada Teks Dummy 'Aktivitas naratif adegan']:", !hasDummyText ? "PASS ✓" : "FAIL ✗");

console.log("\n==================================================================");
console.log("PENGUJIAN VERIFIKASI SELESAI!");
console.log("==================================================================");
