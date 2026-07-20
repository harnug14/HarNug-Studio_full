// Helper untuk otomatis mencoba semua API Key Groq yang aktif secara berurutan.
// Kalau satu key kena limit kuota (429), otomatis tandai key itu "limited" di Supabase
// lalu coba key aktif berikutnya, sampai berhasil atau semua key habis.

export class GroqQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqQuotaError";
  }
}

export async function getActiveGroqKeys(
  supabase: any
): Promise<{ id: string; api_key: string }[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, api_key")
    .eq("provider", "groq")
    .eq("status", "active");

  if (error || !data) return [];
  return data;
}

export async function markGroqKeyLimited(supabase: any, keyId: string) {
  await supabase.from("api_keys").update({ status: "limited" }).eq("id", keyId);
}

export async function callGroqWithRotation<T>(
  supabase: any,
  fn: (apiKey: string) => Promise<T>
): Promise<T> {
  const keys = await getActiveGroqKeys(supabase);

  if (keys.length === 0) {
    throw new Error(
      "Tidak ada API Key Groq aktif. Cek halaman Settings > API Keys"
    );
  }

  let lastError: any = null;

  for (const key of keys) {
    try {
      return await fn(key.api_key);
    } catch (err: any) {
      lastError = err;

      if (err instanceof GroqQuotaError) {
        // Key ini kena limit kuota, tandai limited lalu coba key berikutnya
        await markGroqKeyLimited(supabase, key.id);
        continue;
      }

      // Error selain kuota (misal error parsing, network) -> jangan rotasi, langsung gagal
      throw err;
    }
  }

  // Semua key sudah dicoba dan semuanya kena limit kuota
  throw new Error(
    "Semua API Key Groq aktif sudah mencapai limit kuota harian. Tambah key baru atau tunggu reset kuota besok."
  );
}
