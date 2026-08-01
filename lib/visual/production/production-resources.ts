import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import {
  StoryWorldContext,
  VisualBeatShot,
  DirectorialSpec,
  ProductionResourcesResult,
} from "../types";

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * STEP 4: PRODUCTION RESOURCES MODULE
 * ADR RULE: "Production Resources decides what visual resources should be used."
 * Tanggung Jawab: Murni mengevaluasi Decision Tree Aset (REUSED/POSE_SWAP/NEW) & menyusun SCENE SPECIFICATION.
 * DILARANG MEMBAHAS: Prompt / Vendor AI / Sintaks Prompt -> Wewenang Prompt Composer & Execution!
 */
export async function resolveProductionResources(
  supabase: any,
  storyWorld: StoryWorldContext,
  beatShot: VisualBeatShot,
  directorialSpec: DirectorialSpec,
  existingAssetLibrary: any[] = []
): Promise<ProductionResourcesResult> {
  const systemPrompt = `Kamu adalah HARNUG STUDIO V4 — PRODUCTION RESOURCES MODULE (ART DEPARTMENT & ASSET MANAGER).

ADR RULE: Production Resources decides what visual resources should be used.
Tugasmu MURNI mengevaluasi Keputusan Aset dan menyusun data MURNI "SCENE SPECIFICATION".

DILARANG SAMA SEKALI MEMBUAT PROMPT NARATIF, PROMPT TEXT VENDOR, ATAU SINTAKS PROMPT AI!

HIRARKI DECISION TREE (PILIH SALAH SATU):
1. REUSED: Shot hanya berupa pergerakan kamera (Pan, Tilt, Zoom, Parallax) dari aset sebelumnya.
2. POSE_SWAP: Karakter, Latar, Kamera SAMA, tetapi pose/ekspresi berubah. Sebutkan targetAssetId.
3. NEW: Sudut pandang, lokasi, subjek, atau objek utama berubah total dan belum ada di Asset Library.

ASSET LIBRARY TERSEDIA SAAT INI:
${JSON.stringify(existingAssetLibrary, null, 2)}

FORMAT JSON OUTPUT (MURNI DOMAIN SCENE SPECIFICATION):
{
  "scene": ${beatShot.scene},
  "assetDecision": {
    "assetStatus": "REUSED" | "POSE_SWAP" | "NEW",
    "targetAssetId": "Asset_001",
    "newAssetReason": "Alasan jika NEW",
    "productionInstruction": "Instruksi pergerakan kamera CapCut jika REUSED",
    "createdAsset": {
      "assetId": "Asset_001",
      "assetName": "Nama Deskriptif Aset",
      "assetType": "Character" | "Environment" | "Prop"
    }
  },
  "sceneSpecification": {
    "scene": ${beatShot.scene},
    "beat": "${beatShot.visualBeatType}",
    "subject": {
      "character": "Deskripsi terstruktur subjek karakter utama",
      "object": "Deskripsi terstruktur objek/prop utama"
    },
    "action": "Aksi fisik tunggal yang dilakukan",
    "environment": {
      "location": "Lokasi spesifik era ${storyWorld.primaryEra}",
      "time": "Waktu (pagi, siang, malam)",
      "weather": "Kondisi pencahayaan"
    },
    "camera": ${JSON.stringify(directorialSpec)},
    "focus": "${beatShot.primaryVisualFocus.replace(/"/g, "'")}",
    "continuity": {
      "characterId": "Char_01",
      "costumeId": "Costume_01",
      "environmentId": "Env_01",
      "previousShotScene": ${beatShot.scene > 1 ? beatShot.scene - 1 : null}
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
    "narrativePurpose": "${beatShot.narrativePurpose.replace(/"/g, "'")}",
    "expectedDuration": "${beatShot.expectedDuration}",
    "importance": "${beatShot.importance}",
    "naskahChunk": "${beatShot.naskahChunk.replace(/"/g, "'")}"
  }
}`;

  const userPrompt = `Evaluasi Aset dan susun DOMAIN SCENE SPECIFICATION untuk Shot #${beatShot.scene} (Tipe Beat: ${beatShot.visualBeatType}) dengan fokus visual: "${beatShot.primaryVisualFocus}" (format JSON murni).`;

  let lastError: any = null;

  for (const currentModel of GEMINI_FALLBACK_MODELS) {
    try {
      const rawResponse = await callGeminiWithRotation(supabase, async (apiKey) => {
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
        return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      });

      if (rawResponse) {
        const parsed = parseJsonResponse(rawResponse, {});
        return {
          scene: beatShot.scene,
          assetDecision: parsed.assetDecision || { assetStatus: "NEW" },
          sceneSpecification: parsed.sceneSpecification || {
            scene: beatShot.scene,
            beat: beatShot.visualBeatType,
            subject: { character: "Karakter utama" },
            action: beatShot.primaryVisualFocus,
            environment: { location: storyWorld.primaryEra, time: "Pagi" },
            camera: directorialSpec,
            focus: beatShot.primaryVisualFocus,
            continuity: {},
            constraints: ["Full body visible", "One visual focus"],
            assetReferences: {},
            narrativePurpose: beatShot.narrativePurpose,
            expectedDuration: beatShot.expectedDuration,
            importance: beatShot.importance,
            naskahChunk: beatShot.naskahChunk,
          },
        };
      }
    } catch (err: any) {
      lastError = err;
      await delay(1000);
    }
  }

  throw new Error(`[ProductionResources] Gagal mengevaluasi sumber daya untuk Shot #${beatShot.scene}: ${lastError?.message || "Internal Error"}`);
}