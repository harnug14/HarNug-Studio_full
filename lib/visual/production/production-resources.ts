import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import {
  StoryWorldContext,
  VisualBeatShot,
  DirectorialSpec,
  ProductionResourcesResult,
  SceneSpecification,
  AssetDecision,
} from "../types";

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getSafeString(val: unknown, fallback: string = ""): string {
  if (typeof val === "string") return val.trim();
  return fallback;
}

/**
 * STEP 4: PRODUCTION RESOURCES MODULE
 * ADR RULE: "Production Resources decides what visual resources should be used."
 * Tanggung Jawab: Murni mengevaluasi Decision Tree Aset (REUSED/POSE_SWAP/NEW) & menyusun SCENE SPECIFICATION.
 * DILARANG MEMBAHAS: Prompt / Vendor AI / Sintaks Prompt -> Wewenang Prompt Composer & Execution!
 */
export async function resolveProductionResources(
  supabase: unknown,
  storyWorld: StoryWorldContext,
  beatShot: VisualBeatShot,
  directorialSpec: DirectorialSpec,
  existingAssetLibrary: unknown[] = []
): Promise<ProductionResourcesResult> {
  const safeAssetLib = Array.isArray(existingAssetLibrary) ? existingAssetLibrary : [];
  const sceneNum = typeof beatShot?.scene === "number" ? beatShot.scene : 1;
  const safeEra = getSafeString(storyWorld?.primaryEra, "Era Sejarah");
  const safeFocus = getSafeString(beatShot?.primaryVisualFocus, "Fokus Visual Utama");

  const systemPrompt = `Kamu adalah HARNUG STUDIO V4 — PRODUCTION RESOURCES MODULE (ART DEPARTMENT & ASSET MANAGER).

ADR RULE: Production Resources decides what visual resources should be used.
Tugasmu MURNI mengevaluasi Keputusan Aset dan menyusun data MURNI "SCENE SPECIFICATION".

DILARANG SAMA SEKALI MEMBUAT PROMPT NARATIF, PROMPT TEXT VENDOR, ATAU SINTAKS PROMPT AI!

HIRARKI DECISION TREE:
1. REUSED: Shot hanya berupa pergerakan kamera (Pan, Tilt, Zoom, Parallax) dari aset sebelumnya.
2. POSE_SWAP: Karakter, Latar, Kamera SAMA, tetapi pose/ekspresi berubah. Sebutkan targetAssetId.
3. NEW: Sudut pandang, lokasi, subjek, atau objek utama berubah total.

ASSET LIBRARY TERSEDIA:
${JSON.stringify(safeAssetLib, null, 2)}

FORMAT JSON OUTPUT (MURNI DOMAIN SCENE SPECIFICATION):
{
  "scene": ${sceneNum},
  "assetDecision": {
    "assetStatus": "REUSED" | "POSE_SWAP" | "NEW",
    "targetAssetId": "Asset_001",
    "newAssetReason": "Alasan jika NEW",
    "productionInstruction": "Instruksi CapCut jika REUSED",
    "createdAsset": {
      "assetId": "Asset_001",
      "assetName": "Nama Deskriptif Aset",
      "assetType": "Character" | "Environment" | "Prop"
    }
  },
  "sceneSpecification": {
    "scene": ${sceneNum},
    "beat": "${beatShot?.visualBeatType ?? "Action"}",
    "subject": {
      "character": "Deskripsi terstruktur subjek karakter utama",
      "object": "Deskripsi terstruktur objek/prop utama"
    },
    "action": "Aksi fisik tunggal yang dilakukan",
    "environment": {
      "location": "Lokasi spesifik era ${safeEra}",
      "time": "Waktu (pagi, siang, malam)",
      "weather": "Kondisi pencahayaan"
    },
    "camera": ${JSON.stringify(directorialSpec ?? {})},
    "focus": "${safeFocus.replace(/"/g, "'")}",
    "continuity": {
      "characterId": "Char_01",
      "costumeId": "Costume_01",
      "environmentId": "Env_01",
      "previousShotScene": ${sceneNum > 1 ? sceneNum - 1 : null}
    },
    "constraints": [
      "Full body visible",
      "No occlusion",
      "One visual focus",
      "Easy layer separation",
      "Puppet Parallax friendly"
    ],
    "assetReferences": {
      "characterAnchor": "Anchor_Char_01",
      "environmentAnchor": "Anchor_Env_01",
      "propAnchor": "Anchor_Prop_01"
    },
    "narrativePurpose": "${getSafeString(beatShot?.narrativePurpose, "Tujuan visual").replace(/"/g, "'")}",
    "expectedDuration": "${getSafeString(beatShot?.expectedDuration, "2-3s")}",
    "importance": "${beatShot?.importance ?? "High"}",
    "naskahChunk": "${getSafeString(beatShot?.naskahChunk, "").replace(/"/g, "'")}"
  }
}`;

  const userPrompt = `Evaluasi Aset dan susun DOMAIN SCENE SPECIFICATION untuk Shot #${sceneNum} (Tipe Beat: ${beatShot?.visualBeatType ?? "Action"}) dengan fokus visual: "${safeFocus}" (format JSON murni).`;

  let lastError: unknown = null;

  for (const currentModel of GEMINI_FALLBACK_MODELS) {
    try {
      const rawResponse = await callGeminiWithRotation(supabase, async (apiKey: string) => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              systemInstruction: { parts: [{ text: systemPrompt }] },
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );

        if (!response.ok) {
          if (response.status === 429) throw new GeminiQuotaError("Gemini rate-limited (429)");
          throw new Error(`Gemini Error: ${response.status}`);
        }

        const json = await response.json();
        return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      });

      if (rawResponse) {
        try {
          const parsed = parseJsonResponse(rawResponse, {});
          const rawDecision = parsed?.assetDecision ?? {};
          const rawSpec = parsed?.sceneSpecification ?? {};

          const assetDecision: AssetDecision = {
            assetStatus: (["REUSED", "POSE_SWAP", "NEW"].includes(rawDecision?.assetStatus)
              ? rawDecision.assetStatus
              : "NEW") as AssetDecision["assetStatus"],
            targetAssetId: getSafeString(rawDecision?.targetAssetId, undefined),
            newAssetReason: getSafeString(rawDecision?.newAssetReason, undefined),
            productionInstruction: getSafeString(rawDecision?.productionInstruction, undefined),
            createdAsset: rawDecision?.createdAsset
              ? {
                  assetId: getSafeString(rawDecision.createdAsset?.assetId, `Asset_00${sceneNum}`),
                  assetName: getSafeString(rawDecision.createdAsset?.assetName, `Aset Beat #${sceneNum}`),
                  assetType: (["Character", "Environment", "Prop"].includes(rawDecision.createdAsset?.assetType)
                    ? rawDecision.createdAsset.assetType
                    : "Environment") as "Character" | "Environment" | "Prop",
                }
              : undefined,
          };

          // HARDENING SCENE SPECIFICATION (NO UNDEFINED NESTED PROPERTIES)
          const sceneSpecification: SceneSpecification = {
            scene: sceneNum,
            beat: beatShot?.visualBeatType ?? "Action",
            subject: {
              character: getSafeString(rawSpec?.subject?.character, "Subjek karakter utama"),
              object: getSafeString(rawSpec?.subject?.object, "Objek utama adegan"),
            },
            action: getSafeString(rawSpec?.action, safeFocus),
            environment: {
              location: getSafeString(rawSpec?.environment?.location, safeEra),
              time: getSafeString(rawSpec?.environment?.time, "Pagi"),
              weather: getSafeString(rawSpec?.environment?.weather, "Cerah"),
            },
            camera: {
              shotSize: directorialSpec?.shotSize ?? "Medium Shot",
              angle: directorialSpec?.angle ?? "Eye Level",
              movement: directorialSpec?.movement ?? "Static Hold",
              lightingMood: directorialSpec?.lightingMood ?? "Atmospheric sinematik",
              compositionGoal: directorialSpec?.compositionGoal ?? "Clean visual focus",
              emotionalEmphasis: directorialSpec?.emotionalEmphasis ?? safeFocus,
            },
            focus: safeFocus,
            continuity: {
              characterId: getSafeString(rawSpec?.continuity?.characterId, "Char_01"),
              costumeId: getSafeString(rawSpec?.continuity?.costumeId, "Costume_01"),
              environmentId: getSafeString(rawSpec?.continuity?.environmentId, "Env_01"),
              previousShotScene: typeof rawSpec?.continuity?.previousShotScene === "number" ? rawSpec.continuity.previousShotScene : null,
            },
            constraints: Array.isArray(rawSpec?.constraints) && rawSpec.constraints.length > 0
              ? rawSpec.constraints.map((c: unknown) => getSafeString(c)).filter(Boolean)
              : ["Full body visible", "One visual focus", "Clean background"],
            assetReferences: {
              characterAnchor: getSafeString(rawSpec?.assetReferences?.characterAnchor, "Anchor_Char_01"),
              environmentAnchor: getSafeString(rawSpec?.assetReferences?.environmentAnchor, "Anchor_Env_01"),
              propAnchor: getSafeString(rawSpec?.assetReferences?.propAnchor, "Anchor_Prop_01"),
            },
            narrativePurpose: getSafeString(beatShot?.narrativePurpose, "Tujuan visual"),
            expectedDuration: getSafeString(beatShot?.expectedDuration, "2-3s"),
            importance: beatShot?.importance ?? "High",
            naskahChunk: getSafeString(beatShot?.naskahChunk, ""),
          };

          return {
            scene: sceneNum,
            assetDecision,
            sceneSpecification,
          };
        } catch (parseErr) {
          console.error("[ProductionResources] JSON Parse Error:", parseErr);
        }
      }
    } catch (err: unknown) {
      lastError = err;
      await delay(1000);
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : "Internal Error";
  throw new Error(`[ProductionResources] Gagal mengevaluasi sumber daya untuk Shot #${sceneNum}: ${errMsg}`);
}