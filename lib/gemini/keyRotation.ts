import { SupabaseClient } from "@supabase/supabase-js";

export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cek apakah error dari Google benar-benar murni kuota harian (Daily Quota) habis
function isTrueDailyQuotaError(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  return (
    msg.includes("perday") ||
    msg.includes("per day") ||
    msg.includes("daily limit") ||
    msg.includes("quota exceeded for quota metric 'queries' and limit 'queries_per_day'")
  );
}

// Ambil semua API Key Gemini, dan otomatis reset status ke 'active' (HIJAU) agar tidak pernah terkunci mati
export async function getActiveGeminiKeys(
  supabase: any
): Promise<{ id: string; api_key: string }[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, api_key, status, last_checked_at")
    .eq("provider", "gemini");

  if (error || !data || data.length === 0) return [];

  // Reset otomatis seluruh key Gemini ke status 'active' (HIJAU) di database Supabase
  const limitedIds = data.filter((k: any) => k.status === "limited").map((k: any) => k.id);
  if (limitedIds.length > 0) {
    console.log(`[GeminiRotation] Memulihkan ${limitedIds.length} API key kembali ke status ACTIVE (HIJAU)...`);
    await supabase
      .from("api_keys")
      .update({ status: "active", last_checked_at: new Date().toISOString() })
      .in("id", limitedIds);
  }

  return data.map((k: any) => ({ id: k.id, api_key: k.api_key }));
}

// Tandai status 'limited' di Supabase HANYA jika MURNI kuota harian habis 100% dari Google
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

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const result = await fn(key.api_key);
      
      // Jika berhasil, pastikan status di Supabase tetap 'active' (HIJAU)
      await supabase
        .from("api_keys")
        .update({ status: "active", last_checked_at: new Date().toISOString() })
        .eq("id", key.id);

      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(`[GeminiRotation] Key ke-${i + 1} (${key.id.slice(0, 8)}) mengalami kendala: ${err?.message || err}`);

      // HANYA tandai 'limited' di database jika Google secara eksplisit menyatakan kuota HARIAN habis
      if (isTrueDailyQuotaError(err)) {
        console.log(`[GeminiRotation] Key ${key.id.slice(0, 8)} KUOTA HARIAN RESMI HABIS. Tandai limited di DB...`);
        await markGeminiKeyLimited(supabase, key.id);
      } else {
        // Jika hanya limit per menit (RPM) atau traffic sibuk: JANGAN matikan status di DB! Tetap biarkan active.
        console.log(`[GeminiRotation] Key ${key.id.slice(0, 8)} hanya limit sesaat/sibuk. Status TETAP HIJAU.`);
      }

      // Beri jeda sejenak 1 detik sebelum memanggil key cadangan berikutnya agar tidak bentrok
      if (i < keys.length - 1) {
        await sleep(1000);
      }
    }
  }

  throw lastError || new Error("Semua API Key Gemini sedang sibuk. Silakan coba lagi dalam beberapa detik.");
}
