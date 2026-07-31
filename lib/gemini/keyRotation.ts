import { SupabaseClient } from "@supabase/supabase-js";

export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

// Cek apakah key "limited" seharusnya sudah reset (lewat jam 16:00 WIB hari ini)
function shouldResetByNow(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return false;

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

  return lcDate < nowDate && nowHour >= 16;
}

// Ambil API Key aktif, dan otomatis reset key yang sudah lewat jam 16:00 WIB kembali ke "active" (Hijau)
export async function getActiveGeminiKeys(
  supabase: any
): Promise<{ id: string; api_key: string }[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, api_key, status, last_checked_at")
    .eq("provider", "gemini");

  if (error || !data) return [];

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

  // Otomatis ubah kembali status menjadi "active" (Hijau) di database jika sudah lewat jam 16:00 WIB
  if (idsToReset.length > 0) {
    await supabase
      .from("api_keys")
      .update({ status: "active", last_checked_at: new Date().toISOString() })
      .in("id", idsToReset);
  }

  return usableKeys;
}

// Tandai key sebagai limited HANYA jika kuota harian beneran 100% habis
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
      return await fn(key.api_key);
    } catch (err: any) {
      lastError = err;

      // HANYA ubah status ke 'limited' (merah) jika MURNI Kuota Harian (PerDay) dari Google yang habis 100%!
      if (err instanceof GeminiQuotaError) {
        console.log(`[GeminiRotation] Key ${key.id.slice(0, 8)} kuota harian habis. Tandai limited di DB...`);
        await markGeminiKeyLimited(supabase, key.id);
      } else {
        // Error biasa/rate-limit sesaat -> Rotasi ke key berikutnya tanpa merubah warna indikator di DB
        console.log(`[GeminiRotation] Key ${key.id.slice(0, 8)} sibuk/error biasa. Rotasi ke key berikutnya...`);
      }
    }
  }

  throw lastError || new Error("Semua API Key Gemini sedang sibuk. Coba lagi dalam beberapa saat.");
}