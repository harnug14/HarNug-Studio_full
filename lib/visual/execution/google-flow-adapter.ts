import { ExecutionPayload, ExecutionResult } from "../types";

/**
 * STEP 6: EXECUTION ADAPTER MODULE (VENDOR DRIVER)
 * ADR RULE: "Execution decides how to call the vendor. Execution never changes prompt meaning."
 * Tanggung Jawab: Driver teknis penerima prompt terstruktur + aset + parameter untuk disiapkan ke vendor AI.
 * DILARANG MEMBAHAS: Cerita, Kamera, Karakter, atau Logika Bisnis.
 */
export async function executeGoogleFlow(
  payload: ExecutionPayload
): Promise<ExecutionResult> {
  const { compiledPrompt, assetDecision, sceneSpecification } = payload;
  const sceneNum = sceneSpecification.scene;

  try {
    // Jika Aset berstatus REUSED: Tidak perlu eksekusi prompt baru ke vendor AI
    if (assetDecision.assetStatus === "REUSED") {
      return {
        scene: sceneNum,
        status: "Skipped",
        vendor: "Google Flow (CapCut Reframing)",
        productionInstruction:
          assetDecision.productionInstruction ||
          "Gunakan pergerakan kamera CapCut (Pan/Tilt/Zoom) dari aset sebelumnya.",
      };
    }

    // Eksekusi Vendor Google Flow Driver Paket Aset
    return {
      scene: sceneNum,
      status: "Succeeded",
      vendor: "Google Flow",
      outputPrompt: compiledPrompt,
      productionInstruction: assetDecision.newAssetReason || undefined,
    };
  } catch (err: any) {
    return {
      scene: sceneNum,
      status: "Failed",
      vendor: "Google Flow",
      error: err?.message || "Gagal mengeksekusi driver Google Flow",
    };
  }
}