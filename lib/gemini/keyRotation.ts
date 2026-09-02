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
    msg.includes("requests per day") ||
    msg.includes("quota exceeded for quota metric 'queries' and limit 'queries_per_day'")
  );
}

// Kuota harian akun gratis Google pulih tiap ±15:00 WIB (tengah malam Pacific)
function quotaResetTimeToday(): number {
  const d = new Date();
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    15,
    0,
    0
  ).getTime();
}

// Key berstatus 'limited' boleh dicoba lagi HANYA jika tandanya
// dibuat SEBELUM jam reset hari ini (artinya kuota lama, sudah pulih).
// Vercel gratis tidak menjalankan cron, jadi pemulihan dihitung dari waktu.
function limitedButProbablyReset(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return true;
  const marked = new Date(lastCheckedAt).getTime();
  if (isNaN(marked)) return true;
  return marked < quotaResetTimeToday();
}

// Ambil key Gemini yang PATUT dicoba:
// - semua yang bukan 'limited'
// - plus 'limited' lama (sebelum jam reset hari ini)
// Key 'limited' hari ini DILEWATI agar tidak buang waktu (anti-504).
export async function getActiveGeminiKeys(
  supabase: any
): Promise<{ id: string; api_key: string }[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, api_key, status, last_checked_at")
    .eq("provider", "gemini");

  if (error || !data || data.length === 0) return [];

  const usable = data.filter(
    (k: any) =>
      k.status !== "limited" ||
      limitedButProbablyReset(k.last_checked_at)
  );

  return usable.map((k: any) => ({ id: k.id, api_key: k.api_key }));
}

// Tandai status 'limited' di Supabase HANYA jika MURNI kuota harian habis 100% dari Google.
// Status ini menempel sampai lewat jam reset besok (tidak direset otomatis tiap request).
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
      "Kuota harian semua API Key Gemini sudah habis. Kuota pulih otomatis besok (±15:00 WIB). Silakan coba lagi nanti atau tambah key baru di Settings > API Keys."
    );
  }

  let lastError: any = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const result = await fn(key.api_key);

      // Jika berhasil, pastikan status di Supabase 'active' (HIJAU)
      await supabase
        .from("api_keys")
        .update({ status: "active", last_checked_at: new Date().toISOString() })
        .eq("id", key.id);

      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[GeminiRotation] Key ke-${i + 1} (${key.id.slice(0, 8)}) mengalami kendala: ${err?.message || err}`
      );

      if (isTrueDailyQuotaError(err)) {
        // Kuota harian resmi habis: tandai limited, LANGSUNG lompat ke key berikutnya (tanpa jeda)
        console.log(
          `[GeminiRotation] Key ${key.id.slice(0, 8)} KUOTA HARIAN HABIS. Tandai limited, lewati.`
        );
        await markGeminiKeyLimited(supabase, key.id);
        continue;
      }

      // Hanya limit per menit (RPM) / sibuk sesaat: jeda singkat lalu coba key berikutnya
      console.log(
        `[GeminiRotation] Key ${key.id.slice(0, 8)} hanya limit sesaat/sibuk. Status TETAP HIJAU.`
      );
      if (i < keys.length - 1) {
        await sleep(500);
      }
    }
  }

  throw (
    lastError ||
    new Error("Semua API Key Gemini sedang sibuk. Silakan coba lagi dalam beberapa detik.")
  );
}
