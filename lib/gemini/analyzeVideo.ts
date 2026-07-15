// Mengirim URL video YouTube langsung ke Gemini untuk dianalisis mendalam
// Gemini "menonton" video (visual + audio) tanpa perlu transkrip terpisah

export interface VideoAnalysis {
  niche: string;
  visual: string;
  editing: string;
  hookCta: string;
}

export async function analyzeVideo(
  videoUrl: string,
  apiKey: string
): Promise<VideoAnalysis> {
  const prompt = `Analisis video YouTube Shorts ini secara mendalam. Tonton visual dan dengarkan audionya, lalu berikan hasil analisis dalam format JSON PERSIS seperti ini (tanpa markdown, tanpa backtick, hanya JSON murni):

{
  "niche": "niche dan sub-topik video ini, jelaskan singkat",
  "visual": "konsep visual dan angle kamera yang dipakai, jelaskan singkat",
  "editing": "teknik dan gaya editing: pacing, sound effect, gaya teks, keyframe, motion graphic, jelaskan singkat",
  "hookCta": "pola hook di awal dan call-to-action di akhir, jelaskan singkat"
}

PENTING: Jawab berdasarkan apa yang BENAR-BENAR kamu lihat dan dengar di video ini secara spesifik dan konkret (warna, gerakan kamera, jenis teks overlay, momen tertentu, dsb). JANGAN memberi jawaban generik/template yang bisa berlaku untuk video Shorts manapun. Sebutkan detail konkret yang membuktikan kamu benar-benar menonton video ini.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                file_data: {
                  mime_type: "video/*",
                  file_uri: videoUrl,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Bersihkan kalau Gemini tetap kasih markdown backtick
  const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      niche: parsed.niche || "",
      visual: parsed.visual || "",
      editing: parsed.editing || "",
      hookCta: parsed.hookCta || "",
    };
  } catch (e) {
    throw new Error(`Gagal parse hasil analisis Gemini: ${cleaned.slice(0, 200)}`);
  }
}