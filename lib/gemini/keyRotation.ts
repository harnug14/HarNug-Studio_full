import { SupabaseClient } from "@supabase/supabase-js";

export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

// Cek apakah key berstatus "limited" (MERAH) sudah melewati jam 16:00 WIB (waktu reset resmi Google)
function shouldResetByNow(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return true;

  const now = new Date();
  const wibFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const nowParts = wibFormatter.formatToParts(now);
  const nowDate = `${nowParts.find((p) => p.type === "year")?.value}-${nowParts.find((p) => p.type === "month")?.value}-${nowParts.find((p) => p.type === "day")?.value}`;
  const nowHour = parseInt(nowParts.find((p) => p.type === "hour")?.value || "0");

  const lcParts = wibFormatter.formatToParts(new Date(lastCheckedAt));
  const lcDate = `${lcParts.find((p) => p.type === "year")?.value}-${lcParts.find((p) => p.type === "month")?.value}-${lcParts.find((p) => p.type === "day")?.value}`;

  // Reset ke HIJAU jika diisi hari sebelumnya atau hari ini sudah lewat jam 16:00 WIB
  if (lcDate < nowDate) return true;
  if (lcDate === nowDate && nowHour >= 16) return true;

  return false;
}

// Ambil API Key aktif, dan otomatis reset key yang MERAH kembali HIJAU jika sudah lewat jam 16:00 WIB
export async function getActiveGeminiKeys(
  supabase: any
): Promise<{ id: string; api_key: string }[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, api_key, status, last_checked_at")
    .eq("provider", "gemini");

  if (error || !data || data.length === 0) return [];

  const idsToReset: string[] = [];
  const usableKeys: { id: string; api_key: string }[] = [];

  for (const key of data) {
    if (key.status === "active") {
      usableKeys.push({ id: key.id, api_key: key.api_key });
    } else if (key.status === "limited" && shouldResetByNow(key.last_checked_at)) {
      idsToReset.push(key.id);
      usableKeys.push({ id: key.id, api_key: key.api_key });
    }
  }

  // Otomatis ubah kembali status menjadi "active" (HIJAU) di Supabase jika sudah lewat jam 16:00 WIB
  if (idsToReset.length > 0) {
    await supabase
      .from("api_keys")
      .update({ status: "active", last_checked_at: new Date().toISOString() })
      .in("id", idsToReset);
  }

  // AUTO-HEAL: Jika sama sekali tidak ada key yang usable (semua limited & belum direset),
  // otomatis reset seluruh key di DB ke 'active' (HIJAU) agar aplikasi tidak pernah terkunci mati!
  if (usableKeys.length === 0) {
    console.log("[GeminiRotation] AUTO-HEAL: Semua key berstatus limited. Otomatis reset ke 'active'...");
    await supabase
      .from("api_keys")
      .update({ status: "active", last_checked_at: new Date().toISOString() })
      .eq("provider", "gemini");

    return data.map((k: any) => ({ id: k.id, api_key: k.api_key }));
  }

  return usableKeys;
}

// Tandai status 'limited' (MERAH) di Supabase HANYA jika MURNI Kuota Harian (429 Daily Quota) habis 100%
export async function markGeminiKeyLimited(supabase: any, keyId: string) {
  await supabase
    .from("api_keys")
    .update({ status: "limited", last_checked_at: new Date().toISOString() })
    .eq("id", keyId);
}

export async function callGeminiWithRotation<T>(
  supabase: any,
  fn: (apiKey: string) => Promise<T>
): Promise<T> {
  const keys = await getActiveGeminiKeys(supabase);

  if (keys.length === 0) {
    throw new Error(
      "Tidak ada API Key Gemini aktif. Cek halaman Settings > API Keys"
    );
  }

  let lastError: any = null;

  for (const key of keys) {
    try {
      const result = await fn(key.api_key);
      // Jika pemanggilan berhasil, pastikan status di DB tetap 'active' (HIJAU)
      await supabase
        .from("api_keys")
        .update({ status: "active", last_checked_at: new Date().toISOString() })
        .eq("id", key.id);
      return result;
    } catch (err: any) {
      lastError = err;

      // HANYA tandai status 'limited' (MERAH) di DB jika MURNI Error 429 Kuota Harian Habis dari Google!
      const isQuotaExhausted =
        err instanceof GeminiQuotaError ||
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.includes("RESOURCE_EXHAUSTED");

      if (isQuotaExhausted) {
        console.log(`[GeminiRotation] Key ${key.id.slice(0, 8)} KUOTA HARIAN HABIS (429). Tandai 'limited' (MERAH) di DB...`);
        await markGeminiKeyLimited(supabase, key.id);
      } else {
        // Error biasa (500, 503, timeout, network error) -> Status di DB TETAP HIJAU ('active'), rotasi ke key berikutnya!
        console.log(`[GeminiRotation] Key ${key.id.slice(0, 8)} error biasa (${err?.message || "unknown"}). Status TETAP HIJAU, rotasi ke key berikutnya...`);
      }
    }
  }

  throw lastError || new Error("Semua API Key Gemini sedang sibuk. Coba lagi dalam beberapa saat.");
}