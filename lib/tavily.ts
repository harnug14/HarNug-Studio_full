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
        // 💡 MODE MENDALAM: Membaca isi artikel web secara komprehensif, detail, dan utuh
        search_depth: "advanced",
        max_results: 6,
        include_answer: true,
        // 💡 BLOKIR TOTAL WIKIPEDIA: Menolak semua domain Wikipedia dari hasil pencarian
        exclude_domains: [
          "wikipedia.org",
          "id.wikipedia.org",
          "en.wikipedia.org",
          "m.wikipedia.org",
          "wikidata.org",
        ],
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
      outputParts.push(`[Ringkasan Fakta Mendalam Tavily]:\n${data.answer}`);
    }

    if (data.results && Array.isArray(data.results) && data.results.length > 0) {
      // Filter proteksi ganda: pastikan 0% data Wikipedia yang lolos
      const filteredResults = data.results.filter(
        (item: any) =>
          !item.url?.toLowerCase().includes("wikipedia.org") &&
          !item.url?.toLowerCase().includes("wikidata.org")
      );

      const formattedResults = filteredResults.map((item: any, idx: number) => {
        return `[Sumber Terpercaya ${idx + 1}]: ${item.title || "Tanpa Judul"}\nURL Sumber: ${item.url || "Tanpa URL"}\nUraian Fakta Detail: ${item.content || "Tanpa Ringkasan"}`;
      });

      if (formattedResults.length > 0) {
        outputParts.push(`[Daftar Hasil Riset Web Otentik & Terverifikasi (Non-Wikipedia)]:\n${formattedResults.join("\n\n")}`);
      }
    }

    if (outputParts.length === 0) {
      return "Tidak ditemukan hasil pencarian web yang relevan dari sumber terverifikasi non-Wikipedia.";
    }

    return outputParts.join("\n\n");
  } catch (err: any) {
    throw new Error(err.message || "Terjadi kesalahan saat memanggil Tavily Search API.");
  }
}
