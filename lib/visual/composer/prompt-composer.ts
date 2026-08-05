import { SceneSpecification, PromptComposerResult, CharacterState } from "../types";
import { describeCharacterState } from "../character-fsm/fsm-engine";
import { validateCharacterState, validateActionAgainstCharacterState } from "../character-fsm/validators";

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
 * Task 4: Membersihkan instruksi pose fisik dari teks AKSI.
 * Bagian AKSI hanya boleh berisi konteks aktivitas naratif,
 * BUKAN instruksi posisi anggota tubuh (yang sudah ada di STATE KARAKTER).
 */
export function cleanActionContext(actionText: string): string {
  if (!actionText) return "";
  let cleaned = actionText;

  // Hapus frasa instruksi pose tubuh dari deskripsi aksi
  const posePatterns = [
    // Sambil + frasa fisik/pose
    /sambil\s+(?:mengangkat|menurunkan|merentangkan|menggenggam|memegang|menekuk|mengulurkan)\s+(?:tangan|lengan|kaki|kepala|badan|tubuh|mata|wajah)[^,.]*[,.]?/gi,
    /sambil\s+(?:menoleh|menunduk|mendongak|melirik|memandang|menatap)(?:\s+ke\s+\w+)?[^,.]*[,.]?/gi,
    /sambil\s+(?:berdiri|duduk|berlutut|bersandar|jongkok|terbaring)[^,.]*[,.]?/gi,

    // Kaki
    /(?:kaki|leg)\s*(?:kanan|kiri)?\s*(?:terentang|direntangkan|rentang|tertekuk|ditekuk|tekuk|terangkat|diangkat|diluruskan|terlurus|diulurkan|terulur|statis|neutral|extended|bent|lurus)[^,.]*[,.]?/gi,

    // Tangan & Lengan
    /(?:tangan|lengan|arm)\s*(?:kanan|kiri)?\s*(?:terangkat|diturunkan|direntangkan|terentang|diulurkan|terulur|ditekuk|tertekuk|tergenggam|menggenggam|terlipat|ke\s+atas|ke\s+bawah)[^,.]*[,.]?/gi,

    // Kepala
    /(?:kepala|head)\s*(?:menoleh|menunduk|tertunduk|mendongak|terangkat|terpaling)[^,.]*[,.]?/gi,

    // Mata
    /(?:mata|eye|eyes)\s*(?:melirik|memandang|menatap|terpejam|terbuka)[^,.]*[,.]?/gi,

    // Postur & Posisi tubuh/badan/anggota tubuh
    /(?:postur|pose|posisi)\s+(?:tubuh|badan|berdiri|duduk|berlutut|bersandar|jongkok|terbaring|tegak|tegap|kepala|tangan|lengan|kaki)[^,.]*[,.]?/gi,
    /(?:dalam|dengan)\s+(?:postur|pose|posisi)\s+[^,.]*[,.]?/gi,

    // Generik 'posisi/postur ...' di pertengahan/akhir
    /(?:postur|posisi)\s+(?:berdiri|duduk|berlutut|bersandar|jongkok)[^,.]*[,.]?/gi,
  ];

  for (const pattern of posePatterns) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  // Bersihkan sisa kata sambung menggantung dan koma/titik ganda
  cleaned = cleaned
    .replace(/\s+(?:dan|dengan|sambil)\s*([,.]|$)/gi, "$1")
    .replace(/\s*[,.]+\s*[,.]+/g, ".")
    .replace(/^\s*[,.]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  // Jika input awal berakhiran titik, pastikan cleaned juga berakhiran titik
  if (cleaned && !/[.!?]$/.test(cleaned) && /[.!?]$/.test(actionText.trim())) {
    cleaned += ".";
  }

  return cleaned;
}

/**
 * TUGAS 4: Formats CharacterState into an authoritative, binding physical contract for vendor AI models.
 * Tells the AI explicitly to maintain the state and what must NOT be changed.
 */
export function formatAuthoritativeCharacterState(state: CharacterState): string {
  if (!state) return "";
  const lines: string[] = [];

  lines.push(`STATE KARAKTER (WAJIB DIPERTAHANKAN - PHYSICAL CANON)`);
  lines.push(``);

  // Head
  lines.push(`Head:`);
  lines.push(`Position: ${state.head.position}. Tetap ${state.head.position}. Jangan diubah.`);
  lines.push(``);

  // Right Arm
  lines.push(`Right Arm:`);
  const rHold = state.rightArm.holdingObject ? `. Holding: ${state.rightArm.holdingObject}` : "";
  const rAction = state.rightArm.holdingObject
    ? `Tetap ${state.rightArm.position} dan memegang ${state.rightArm.holdingObject}. Jangan diturunkan atau dilepas.`
    : `Tetap ${state.rightArm.position}. Jangan diubah.`;
  lines.push(`Position: ${state.rightArm.position}${rHold}. ${rAction}`);
  lines.push(``);

  // Left Arm
  lines.push(`Left Arm:`);
  const lHold = state.leftArm.holdingObject ? `. Holding: ${state.leftArm.holdingObject}` : "";
  const lAction = state.leftArm.holdingObject
    ? `Tetap ${state.leftArm.position} dan memegang ${state.leftArm.holdingObject}. Jangan diturunkan atau dilepas.`
    : `Tetap ${state.leftArm.position}. Jangan diubah.`;
  lines.push(`Position: ${state.leftArm.position}${lHold}. ${lAction}`);
  lines.push(``);

  // Legs
  lines.push(`Legs:`);
  lines.push(`Right Leg: ${state.rightLeg.position}, Left Leg: ${state.leftLeg.position}. Tetap pertahankan posisi kaki.`);
  lines.push(``);

  // Transform
  lines.push(`Transform:`);
  lines.push(`Pose: ${state.transform.pose}, Facing: ${state.transform.facing}. Tetap berhadapan ${state.transform.facing}.`);

  return lines.join("\n");
}

/**
 * STEP 5: PROMPT COMPOSER MODULE (INFRASTRUCTURE ADAPTER - V5 HARDENED)
 * ADR RULE: "Prompt Composer decides how to speak to the AI. Prompt Composer never changes intent."
 * GOLDEN RULE #3: Every layer after FSM is READ ONLY.
 *
 * Prompt Composer translates Character State into vendor prompt blocks.
 * Prompt Composer NEVER invents poses and NEVER alters Character State.
 */
export function composePrompt(
  spec: SceneSpecification,
  visualStyle: string = "Sinematik 3D, Unreal Engine 5",
  vendor: string = "Google Flow",
  characterState?: CharacterState | null
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

  // Task 5: Validasi CharacterState sebelum menyusun prompt
  if (characterState) {
    const stateErrors = validateCharacterState(characterState);
    // Hanya perhatikan fatal validation errors (bukan peringatan kontinuitas)
    const fatalErrors = stateErrors.filter(
      (e) => e.code === "INVALID_BODY_STATE" || e.code === "MISSING_BODY_PART" || e.code === "ILLEGAL_MUTATION"
    );
    if (fatalErrors.length > 0) {
      errors.push(...fatalErrors.map((e) => `[${e.code}] ${e.message}`));
    }

    // V6: Action-State Consistency Validator
    // AKSI tidak boleh mendeskripsikan gerakan yang bertentangan dengan Character State
    const actionText = getSafeString(spec.action, "");
    if (actionText) {
      const actionStateErrors = validateActionAgainstCharacterState(actionText, characterState);
      if (actionStateErrors.length > 0) {
        errors.push(...actionStateErrors.map((e) => `[${e.code}] ${e.message}`));
      }
    }
  }

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

  const sceneNum = typeof spec.scene === "number" ? spec.scene : 1;
  const formattedShotNum = `Shot #${String(sceneNum).padStart(2, "0")}`;

  const subject = getSafeString(spec.subject?.character, "Subjek utama");
  const action = getSafeString(spec.action, "");
  const focus = getSafeString(spec.focus, "");
  const cameraAngle = getSafeString(spec.camera?.angle, "Eye Level");
  const location = getSafeString(spec.environment?.location, "Latar lokasi era sejarah");
  const timeWeather = [spec.environment?.time, spec.environment?.weather].filter(Boolean).join(", ") || "Lighting alami";
  const objectProp = getSafeString(spec.subject?.object, "Objek pendukung adegan");

  // RESOLUSI AKSI (NO DUMMY FALLBACK):
  // 1. cleanActionContext(action)
  // 2. jika kosong -> gunakan Focus Visual (focus)
  // 3. jika focus juga kosong -> gunakan Subjek Utama (subject)
  // 4. jika semuanya kosong -> string kosong ("")
  const cleanedAction = cleanActionContext(action);
  let finalAction = cleanedAction;
  if (!finalAction) {
    const safeFocus = (typeof spec.focus === "string" && spec.focus.trim() && spec.focus.trim() !== "-") ? spec.focus.trim() : "";
    if (safeFocus) {
      finalAction = safeFocus;
    } else {
      const safeSubject = (typeof spec.subject?.character === "string" && spec.subject.character.trim() && spec.subject.character.trim() !== "-") ? spec.subject.character.trim() : "";
      finalAction = safeSubject || "";
    }
  }

  // TUGAS 5: Perkuat section kontinuitas & kebenaran fisik
  const continuityText = `Character ID: ${getSafeString(spec.continuity?.characterId, "Char_01")}, Costume: ${getSafeString(spec.continuity?.costumeId, "Costume_01")}, Env: ${getSafeString(spec.continuity?.environmentId, "Env_01")}\nPhysical Continuity Directive: Gunakan Character State di atas sebagai sumber kebenaran tunggal kondisi fisik karakter. DILARANG mengubah pose, arah tubuh, atau anggota tubuh kecuali sesuai state yang diberikan!`;

  // RESOLUSI JANGAN UBAH (Kontinuitas Shot Sebelumnya):
  // Hanya buat referensi Shot #XX jika ini BUKAN shot pertama dan terdapat previousShotScene valid > 0
  const prevShotNum = typeof spec.continuity?.previousShotScene === "number" && spec.continuity.previousShotScene > 0
    ? spec.continuity.previousShotScene
    : null;
  const hasPreviousShot = prevShotNum !== null && sceneNum > 1;

  const doNotChangeText = hasPreviousShot
    ? `Pertahankan kontinuitas visual dan warna dari Shot #${String(prevShotNum).padStart(2, "0")}`
    : "Latar dan gaya visual konsisten";

  // TUGAS 2 & TUGAS 4: Skip poseBlock if no characterState (actor-less scene), or format authoritatively if character present
  const poseBlock = characterState
    ? formatAuthoritativeCharacterState(characterState)
    : null;

  const structuredBlocks = [
    `NOMOR SHOT:\n${formattedShotNum}`,
    `SUBJEK UTAMA:\n${cleanFluff(subject)}`,
    poseBlock,
    `AKSI (Konteks Aktivitas Saja — Pose Diatur Oleh Character State):\n${finalAction ? cleanFluff(finalAction) : ""}`,
    `FOCUS VISUAL:\n${cleanFluff(focus)}`,
    `SUDUT KAMERA:\n${cleanFluff(cameraAngle)}`,
    `KOMPOSISI:\nClean composition, 1 Shot = 1 Visual Focus`,
    `LOKASI:\n${cleanFluff(location)}`,
    `ERA / WAKTU:\n${cleanFluff(timeWeather)}`,
    `OBJEK PENTING:\n${cleanFluff(objectProp)}`,
    `LIGHTING:\nAtmospheric lighting, ${cleanFluff(spec.camera?.lightingMood || "Sinematik dramatis")}`,
    `KONTINUITAS & KEBENARAN FISIK:\n${continuityText}`,
    `JANGAN UBAH:\n${doNotChangeText}`,
    `CONSTRAINTS:\n- ${mandatoryConstraints.join("\n- ")}`,
    `STYLE:\n${cleanFluff(visualStyle)}`,
  ].filter(Boolean);

  return {
    compiledPrompt: structuredBlocks.join("\n\n"),
    vendor,
    isValidationPassed: true,
  };
}