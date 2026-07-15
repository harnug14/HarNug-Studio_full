export async function testGeminiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const data = await res.json();

    if (res.ok) {
      return { valid: true, message: "Key aktif dan berfungsi" };
    }

    const reason = data?.error?.message || "Unknown error";

    if (reason.toLowerCase().includes("quota") || res.status === 429) {
      return { valid: false, message: "Limit rate habis" };
    }
    if (reason.toLowerCase().includes("api key not valid") || res.status === 400 || res.status === 403) {
      return { valid: false, message: "API key tidak valid" };
    }

    return { valid: false, message: `Error: ${reason}` };
  } catch (err) {
    return { valid: false, message: "Gagal terhubung ke Gemini API" };
  }
}