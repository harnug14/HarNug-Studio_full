import { SceneSpecification, PromptComposerResult } from "../types";

/**
 * STEP 5: PROMPT COMPOSER MODULE (INFRASTRUCTURE ADAPTER)
 * ADR RULE: "Prompt Composer decides how to speak to the AI. Prompt Composer never changes intent."
 * Tanggung Jawab:
 * 1. Validation (Cek kelengkapan spesifikasi)
 * 2. Constraint Injection (Suntikkan batasan universal teknis)
 * 3. Vendor Translation (Terjemahkan istilah domain ke sintaks vendor)
 * 4. Prompt Normalization (Susun format instruksi terstruktur)
 * 5. Prompt Compression (Hapus kata mubazir / fluff words)
 * DILARANG MEMBAHAS: Keputusan artistik (Framing, Kamera, Aset, Cerita).
 */
export function composePrompt(
  spec: SceneSpecification,
  visualStyle: string = "Sinematik 3D, Unreal Engine 5",
  vendor: string = "Google Flow"
): PromptComposerResult {
  // 1. VALIDATION
  const errors: string[] = [];
  if (!spec) errors.push("SceneSpecification kosong");
  if (!spec?.focus) errors.push("Fokus visual utama kosong");
  if (!spec?.camera) errors.push("Spesifikasi kamera kosong");

  if (errors.length > 0) {
    return {
      compiledPrompt: "",
      vendor,
      isValidationPassed: false,
      validationErrors: errors,
    };
  }

  // 2. CONSTRAINT INJECTION (Mandatory Technical Constraints)
  const mandatoryConstraints = [
    "Full body visible",
    "Clean silhouette",
    "Easy background separation",
    "No limb occlusion",
    "Character separated from background",
    "No cropped body",
    "Consistent appearance",
  ];

  // 3. VENDOR TRANSLATION & PROMPT NORMALIZATION
  const subject = spec.subject?.character || "Subjek utama";
  const action = spec.action || "Posisi keyframe statis";
  const focus = spec.focus || "Fokus visual utama";
  const cameraShot = spec.camera?.shotSize || "Medium Shot";
  const cameraAngle = spec.camera?.angle || "Eye Level";
  const cameraMotion = spec.camera?.movement || "Static Hold";
  const location = spec.environment?.location || "Latar lokasi era sejarah";
  const timeWeather = [spec.environment?.time, spec.environment?.weather].filter(Boolean).join(", ") || "Lighting alami";
  const objectProp = spec.subject?.object || "Objek pendukung adegan";

  const continuityText = spec.continuity
    ? `Character ID: ${spec.continuity.characterId || "Char_01"}, Costume: ${spec.continuity.costumeId || "Costume_01"}, Env: ${spec.continuity.environmentId || "Env_01"}`
    : "Pertahankan identitas karakter dan latar utama";

  const doNotChangeText = spec.continuity?.previousShotScene
    ? `Pertahankan kontinuitas visual dan warna dari Shot #${spec.continuity.previousShotScene}`
    : "Latar dan gaya visual konsisten";

  // 4. PROMPT COMPRESSION & STRUCTURED FORMAT (12-Block Priority Order)
  const structuredBlocks = [
    `SUBJEK UTAMA:\n${cleanFluff(subject)}`,
    `AKSI:\n${cleanFluff(action)}`,
    `FOCUS VISUAL:\n${cleanFluff(focus)}`,
    `SUDUT KAMERA:\n${cameraShot}, ${cameraAngle}`,
    `KOMPOSISI:\nClean composition, 1 Shot = 1 Visual Focus`,
    `LOKASI:\n${cleanFluff(location)}`,
    `ERA / WAKTU:\n${cleanFluff(timeWeather)}`,
    `OBJEK PENTING:\n${cleanFluff(objectProp)}`,
    `LIGHTING:\nAtmospheric lighting, ${spec.camera?.lightingMood || "Sinematik dramatis"}`,
    `GERAK KAMERA:\n${cameraMotion}`,
    `KONTINUITAS:\n${continuityText}`,
    `JANGAN UBAH:\n${doNotChangeText}`,
    `CONSTRAINTS:\n- ${mandatoryConstraints.join("\n- ")}`,
    `STYLE:\n${cleanFluff(visualStyle)}`,
  ];

  const compiledPrompt = structuredBlocks.join("\n\n");

  return {
    compiledPrompt,
    vendor,
    isValidationPassed: true,
  };
}

/**
 * Helper: Prompt Compression untuk membersihkan kata-kata mubazir / fluff words
 */
function cleanFluff(text: string): string {
  if (!text) return "-";
  return text
    .replace(/\b(sangat|amat|sekali|yang|dan|dengan|secara|terlihat|tampak)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}