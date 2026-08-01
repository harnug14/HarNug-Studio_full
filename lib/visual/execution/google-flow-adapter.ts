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
  const sceneNum = typeof payload?.sceneSpecification?.scene === "number" ? payload.sceneSpecification.scene : 1;

  try {
    if (!payload?.sceneSpecification) {
      throw new Error("Payload sceneSpecification null atau undefined");
    }

    if (payload.assetDecision?.assetStatus === "REUSED") {
      return {
        scene: sceneNum,
        status: "Skipped",
        vendor: "Google Flow (CapCut Reframing)",
        productionInstruction: payload.assetDecision?.productionInstruction ?? "Gunakan pergerakan kamera CapCut (Pan/Tilt/Zoom) dari aset sebelumnya.",
      };
    }

    return {
      scene: sceneNum,
      status: "Succeeded",
      vendor: "Google Flow",
      outputPrompt: payload.compiledPrompt ?? "",
      productionInstruction: payload.assetDecision?.newAssetReason ?? undefined,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Gagal mengeksekusi driver Google Flow";
    return {
      scene: sceneNum,
      status: "Failed",
      vendor: "Google Flow",
      error: errMsg,
    };
  }
}