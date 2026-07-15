// Helper untuk otomatis mencoba semua API Key Gemini yang aktif secara berurutan.
// Kalau satu key kena limit kuota (429), otomatis tandai key itu "limited" di Supabase
// lalu coba key aktif berikutnya, sampai berhasil atau semua key habis.

export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

export async function getActiveGeminiKeys(
  supabase: any
): Promise<{ id: string; api_key: string }[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, api_key")
    .eq("provider", "gemini")
    .eq("status", "active");

  if (error || !data) return [];
  return data;
}

export async function markGeminiKeyLimited(supabase: any, keyId: string) {
  await supabase.from("api_keys").update({ status: "limited" }).eq("id", keyId);
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

      if (err instanceof GeminiQuotaError) {
        // Key ini kena limit kuota, tandai limited lalu coba key berikutnya
        await markGeminiKeyLimited(supabase, key.id);
        continue;
      }

      // Error selain kuota (misal error parsing, network) -> jangan rotasi, langsung gagal
      throw err;
    }
  }

  // Semua key sudah dicoba dan semuanya kena limit kuota
  throw new Error(
    "Semua API Key Gemini aktif sudah mencapai limit kuota harian. Tambah key baru atau tunggu reset kuota besok."
  );
}