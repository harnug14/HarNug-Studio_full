// Mengirim pesan chat ke Gemini, dengan dukungan mode: biasa, mendalam, berpikir, search (grounding) & multimodal (foto/file)

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
  return "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDailyQuotaError(errText: string): boolean {
  const lower = errText.toLowerCase();
  return lower.includes("perday");
}

export function buildStyleInstruction(mode: ChatMode): string {
  const baseStyle =
    "Gunakan bahasa Indonesia yang netral, sopan, dan jelas. JANGAN gunakan bahasa gaul kasual seperti 'lo', 'gue', 'elo', atau sejenisnya — gunakan 'kamu'/'Anda' dan kata baku.";

  switch (mode) {
    case "mendalam":
      return `${baseStyle} Jawab secara sangat detail, analitis, dan komprehensif. Berikan konteks, latar belakang, dan berbagai sudut pandang jika relevan.`;
    case "berpikir":
      return `${baseStyle} [MODE THINKING AKTIF]: Sebelum memberikan jawaban akhir, kamu WAJIB menganalisis dan menjabarkan proses berpikirmu langkah demi langkah (Chain of Thought) secara mendalam di awal jawaban, baru diikuti dengan kesimpulan akhir.`;
    case "search":
      return `${baseStyle} Jawab pertanyaan pengguna HANYA berdasarkan data hasil pencarian web real-time Tavily yang dilampirkan. Kutip fakta, angka, dan sertakan URL sumbernya (source URL) dalam jawabanmu jika memungkinkan.`;
    case "biasa":
    default:
      return `${baseStyle} Jawab secara natural dan ringkas seperti obrolan biasa, tapi tetap sopan.`;
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
  const activeModel = model || "gemini-1.5-flash";
  let finalContextText = contextText || "";

  // Cari pertanyaan user paling akhir
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  // Jika Mode Web Search Aktif, panggil Tavily Search API
  if ((mode === "search" || (typeof mode === "string" && (mode as string).includes("search"))) && lastUserMsg && lastUserMsg.content) {
    const tavilyData = await fetchTavilySearchResults(lastUserMsg.content);
    if (tavilyData) {
      const searchBlock = `\n\n[DATA PENCARIAN WEB REAL-TIME TAVILY DETIK INI]:\n${tavilyData}\n\nATURAN WAJIB: Jawab pertanyaan pengguna secara akurat berdasarkan data pencarian web Tavily di atas dan cantumkan URL sumbernya bila relevan!`;
      finalContextText = finalContextText ? `${finalContextText}${searchBlock}` : searchBlock;
    }
  }

  const systemInstruction = buildStyleInstruction(mode);

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

    if (m.content || parts.length === 0) {
      parts.push({ text: m.content || "Tolong analisis dan jelaskan lampiran foto/file berikut." });
    }

    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  if (finalContextText) {
    contents.unshift({
      role: "user",
      parts: [{ text: `Konteks & Data Web Real-time:\n${finalContextText}` }],
    });
  }

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

  if (response.ok) {
    const data = await response.json();
    const rawText: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return rawText;
  }

  const errText = await response.text();

  if (response.status === 429) {
    if (isDailyQuotaError(errText)) {
      throw new GeminiQuotaError(
        `Gemini API quota harian habis (429) - ${errText.slice(0, 200)}`
      );
    } else {
      throw new Error(`Rate limit sesaat pada key ini.`);
    }
  }

  throw new Error(`Gemini API error: ${response.status} - ${errText}`);
}