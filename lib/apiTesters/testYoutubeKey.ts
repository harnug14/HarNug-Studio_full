export async function testYoutubeKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${apiKey}`
    );
    const data = await res.json();

    if (res.ok) {
      return { valid: true, message: "Key aktif dan berfungsi" };
    }

    const reason = data?.error?.errors?.[0]?.reason || data?.error?.message || "Unknown error";

    if (reason.includes("quotaExceeded") || reason.includes("dailyLimitExceeded")) {
      return { valid: false, message: "Limit harian habis" };
    }
    if (reason.includes("keyInvalid") || res.status === 400) {
      return { valid: false, message: "API key tidak valid" };
    }

    return { valid: false, message: `Error: ${reason}` };
  } catch (err) {
    return { valid: false, message: "Gagal terhubung ke YouTube API" };
  }
}