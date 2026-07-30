export async function fetchTavilySearchResults(query: string): Promise<string> {
  if (!query || query.trim().length === 0) return "";

  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey || apiKey.trim() === "" || apiKey.startsWith("tvly-xxxx")) {
    throw new Error(
      "API Key Tavily (TAVILY_API_KEY) belum dikonfigurasi di .env.local. Silakan tambahkan TAVILY_API_KEY yang valid."
    );
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 401) {
        throw new Error("API Key Tavily (TAVILY_API_KEY) tidak valid atau salah.");
      }
      throw new Error(`Gagal pencarian web Tavily (${response.status}): ${errText.slice(0, 150)}`);
    }

    const data = await response.json();
    const outputParts: string[] = [];

    if (data.answer) {
      outputParts.push(`[Ringkasan Jawaban Langsung Tavily]:\n${data.answer}`);
    }

    if (data.results && Array.isArray(data.results) && data.results.length > 0) {
      const formattedResults = data.results.map((item: any, idx: number) => {
        return `[Sumber ${idx + 1}]: ${item.title || "Tanpa Judul"}\nURL: ${item.url || "Tanpa URL"}\nKutipan Snippet: ${item.content || "Tanpa Ringkasan"}`;
      });
      outputParts.push(`[Daftar Hasil Pencarian Web Real-Time]:\n${formattedResults.join("\n\n")}`);
    }

    if (outputParts.length === 0) {
      return "Tidak ditemukan hasil pencarian web yang relevan dari Tavily untuk kueri ini.";
    }

    return outputParts.join("\n\n");
  } catch (err: any) {
    throw new Error(err.message || "Terjadi kesalahan saat memanggil Tavily Search API.");
  }
}