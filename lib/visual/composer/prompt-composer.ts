import { SceneSpecification, PromptComposerResult } from "../types";

function getSafeString(val: unknown, fallback: string = "-"): string {
  if (typeof val === "string" && val.trim().length > 0) return val.trim();
  return fallback;
}

/**
 * PROMPT COMPOSER HARDENING:
 * Helper cleanFluff MURNI merapikan spasi ganda, newline berlebih, dan trim().
 * DILARANG MEMOTONG ATAU MENGUBAH NAMA ENTITAS DENGAN REGEX DICTIONARY!
 */
function cleanFluff(text: unknown): string {
  const safe = getSafeString(text, "-");
  return safe.replace(/\s+/g, " ").trim();
}

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
  const errors: string[] = [];

  if (!spec) {
    errors.push("SceneSpecification null atau undefined");
    return {
      compiledPrompt: "",
      vendor,
      isValidationPassed: false,
      validationErrors: errors,
    };
  }

  if (!getSafeString(spec.focus, "")) errors.push("Fokus visual utama kosong");

  if (errors.length > 0) {
    return {
      compiledPrompt: "",
      vendor,
      isValidationPassed: false,
      validationErrors: errors,
    };
  }

  const mandatoryConstraints = [
    "Full body visible",
    "Clean silhouette",
    "Easy background separation",
    "No limb occlusion",
    "Character separated from background",
    "No cropped body",
    "Consistent appearance",
  ];

  const subject = getSafeString(spec.subject?.character, "Subjek utama");
  const action = getSafeString(spec.action, "Posisi keyframe statis");
  const focus = getSafeString(spec.focus, "Fokus visual utama");
  const cameraShot = getSafeString(spec.camera?.shotSize, "Medium Shot");
  const cameraAngle = getSafeString(spec.camera?.angle, "Eye Level");
  const cameraMotion = getSafeString(spec.camera?.movement, "Static Hold");
  const location = getSafeString(spec.environment?.location, "Latar lokasi era sejarah");
  const timeWeather = [spec.environment?.time, spec.environment?.weather].filter(Boolean).join(", ") || "Lighting alami";
  const objectProp = getSafeString(spec.subject?.object, "Objek pendukung adegan");

  const continuityText = `Character ID: ${getSafeString(spec.continuity?.characterId, "Char_01")}, Costume: ${getSafeString(spec.continuity?.costumeId, "Costume_01")}, Env: ${getSafeString(spec.continuity?.environmentId, "Env_01")}`;

  const doNotChangeText = typeof spec.continuity?.previousShotScene === "number"
    ? `Pertahankan kontinuitas visual dan warna dari Shot #${spec.continuity.previousShotScene}`
    : "Latar dan gaya visual konsisten";

  const structuredBlocks = [
    `SUBJEK UTAMA:\n${cleanFluff(subject)}`,
    `AKSI:\n${cleanFluff(action)}`,
    `FOCUS VISUAL:\n${cleanFluff(focus)}`,
    `SUDUT KAMERA:\n${cameraShot}, ${cameraAngle}`,
    `KOMPOSISI:\nClean composition, 1 Shot = 1 Visual Focus`,
    `LOKASI:\n${cleanFluff(location)}`,
    `ERA / WAKTU:\n${cleanFluff(timeWeather)}`,
    `OBJEK PENTING:\n${cleanFluff(objectProp)}`,
    `LIGHTING:\nAtmospheric lighting, ${cleanFluff(spec.camera?.lightingMood || "Sinematik dramatis")}`,
    `GERAK KAMERA:\n${cameraMotion}`,
    `KONTINUITAS:\n${continuityText}`,
    `JANGAN UBAH:\n${doNotChangeText}`,
    `CONSTRAINTS:\n- ${mandatoryConstraints.join("\n- ")}`,
    `STYLE:\n${cleanFluff(visualStyle)}`,
  ];

  return {
    compiledPrompt: structuredBlocks.join("\n\n"),
    vendor,
    isValidationPassed: true,
  };
}