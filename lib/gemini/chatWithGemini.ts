// Mengirim pesan chat ke Gemini, dengan dukungan mode: biasa, mendalam, berpikir, search (Tavily deep grounding) & multimodal (foto/file)

import { GeminiQuotaError } from "./keyRotation";
import { fetchTavilySearchResults } from "../tavily";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ name?: string; url?: string; type?: string; base64?: string }>;
}

export type ChatMode = "biasa" | "mendalam" | "berpikir" | "search";
export type ContentTarget = "topik" | "naskah" | "visual" | null;

export function buildContentInstruction(contentTarget?: ContentTarget): string {
  if (contentTarget === "topik") {
    return "Fokuskan respon pada perumusan ide topik video YouTube Shorts yang menarik, orisinal, dan berbasis fakta sejarah unik.";
  }
  if (contentTarget === "naskah") {
    return "Fokuskan respon pada penyusunan struktur naskah video yang memiliki Hook kuat, alur kronologis runtut, dan bebas klise.";
  }
  if (contentTarget === "visual") {
    return "Fokuskan respon pada visual director prompt, camera angle, dan komposisi pencahayaan sinematik.";
  }
  return "";
}

function isDailyQuotaError(errText: string): boolean {
  const lower = errText.toLowerCase();
  return lower.includes("perday") || lower.includes("per day") || lower.includes("daily limit");
}

// 💡 hasWebData dibuat opsional (default = false) agar kompatibel dengan Groq & panggilan lainnya
export function buildStyleInstruction(mode: ChatMode, hasWebData: boolean = false): string {
  const baseStyle =
    "Gunakan bahasa Indonesia yang netral, sopan, dan jelas. JANGAN gunakan bahasa gaul kasual seperti 'lo', 'gue', 'elo', atau sejenisnya — gunakan 'kamu'/'Anda' dan kata baku.";

  if (hasWebData) {
    return `${baseStyle} [INSTRUKSI KHUSUS REAL-TIME]: Kamu DIBEKALI data riset web internet terkini di bawah. Kamu WAJIB menggunakan data, angka, kurs, atau fakta tersebut untuk menjawab pertanyaan pengguna secara langsung dan spesifik. DILARANG menyatakan bahwa kamu tidak memiliki akses internet atau tidak tahu kurs real-time, karena datanya sudah tertera lengkap di lampiran.`;
  }

  switch (mode) {
    case "mendalam":
      return `${baseStyle} Jawab secara sangat detail, analitis, dan komprehensif. Berikan konteks dan latar belakang mendalam.`;
    case "berpikir":
      return `${baseStyle} [MODE THINKING AKTIF]: Sebelum memberikan jawaban akhir, analisis proses berpikirmu langkah demi langkah secara mendalam, baru diikuti dengan kesimpulan akhir.`;
    case "search":
      return `${baseStyle} Jawab pertanyaan pengguna secara akurat berdasarkan data hasil pencarian web real-time yang dilampirkan.`;
    case "biasa":
    default:
      return `${baseStyle} Jawab secara natural dan ringkas seperti obrolan diskusi profesional.`;
  }
}

function parseInlineData(att: { name?: string; url?: string; type?: string; base64?: string }) {
  const rawData = att.base64 || att.url || "";
  if (!rawData) return null;

  let mimeType = att.type || "image/png";
  let base64Data = rawData;

  const dataUrlMatch = rawData.match(/^data:(.+?);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    base64Data = dataUrlMatch[2];
  }

  if (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/")
  ) {
    return {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    };
  }

  return null;
}

export async function chatWithGemini(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  mode: ChatMode,
  contextText?: string,
  contentTarget?: ContentTarget
): Promise<string> {
  const activeModel = model || "gemini-3.6-flash";
  const modeStr = String(mode || "biasa").toLowerCase();
  const isSearchRequested = modeStr.includes("search");

  // Cari pertanyaan user paling akhir
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  let tavilyData = "";

  // 💡 JIKA MODE SEARCH AKTIF: Panggil Tavily dan suntikkan langsung ke pertanyaan user
  if (isSearchRequested && lastUserMsg && lastUserMsg.content) {
    try {
      tavilyData = await fetchTavilySearchResults(lastUserMsg.content);
    } catch (e) {
      console.warn("[Chat] Tavily search fallback:", e);
    }
  }

  const targetInstruction = buildContentInstruction(contentTarget);
  const styleInstruction = buildStyleInstruction(mode, Boolean(tavilyData));
  const systemInstruction = targetInstruction
    ? `${styleInstruction}\n\n${targetInstruction}`
    : styleInstruction;

  const contents = messages.map((m) => {
    const parts: any[] = [];

    if (m.attachments && Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        const inlinePart = parseInlineData(att);
        if (inlinePart) {
          parts.push(inlinePart);
        }
      }
    }

    let textContent = m.content || "Tolong analisis lampiran berikut.";

    // 💡 INJEKSI LANGSUNG: Tempelkan data web ke pesan user paling terakhir
    if (m === lastUserMsg && tavilyData) {
      textContent = `${textContent}\n\n[DATA FAKTA & WEB SEARCH REAL-TIME TERKINI]:\n${tavilyData}\n\nGunakan data terkini di atas untuk menjawab secara akurat dan lugas.`;
    }

    parts.push({ text: textContent });

    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const body: any = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const rawText = await response.text();

  if (response.ok) {
    try {
      const data = JSON.parse(rawText);
      const answer: string =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return answer;
    } catch {
      return rawText;
    }
  }

  if (response.status === 429) {
    if (isDailyQuotaError(rawText)) {
      throw new GeminiQuotaError(
        `Gemini API quota harian habis (429) - ${rawText.slice(0, 200)}`
      );
    } else {
      throw new Error(`Rate limit sesaat pada model ${activeModel}.`);
    }
  }

  let errorDetail = rawText;
  try {
    const errJson = JSON.parse(rawText);
    errorDetail = errJson.error?.message || rawText;
  } catch {}

  throw new Error(`Gemini API error (${response.status}): ${errorDetail}`);
}
