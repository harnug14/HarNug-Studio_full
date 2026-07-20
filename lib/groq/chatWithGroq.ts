import { GroqQuotaError, callGroqWithRotation } from "./keyRotation";
import { ChatMode, ContentTarget, ChatMessage, buildStyleInstruction, buildContentInstruction } from "../gemini/chatWithGemini";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function chatWithGroq(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  mode: ChatMode,
  contextText?: string,
  contentTarget: ContentTarget = null
): Promise<string> {
  const styleInstruction = buildStyleInstruction(mode);
  const contentInstruction = buildContentInstruction(contentTarget);
  const systemInstruction = contentInstruction
    ? `${contentInstruction}\n\n${styleInstruction}`
    : styleInstruction;

  // Remove the 'groq-' prefix if it was added in the UI
  const actualModel = model.startsWith("groq-") ? model.replace("groq-", "") : model;

  const formattedMessages = [];
  
  // Add system instruction
  formattedMessages.push({
    role: "system",
    content: systemInstruction
  });

  // Add context if exists
  if (contextText) {
    formattedMessages.push({
      role: "user",
      content: `Konteks awal:\n${contextText}`
    });
  }

  // Add all chat history
  formattedMessages.push(...messages);

  const body = {
    model: actualModel,
    messages: formattedMessages,
  };

  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 5000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      const rawText: string = data.choices?.[0]?.message?.content || "";
      return rawText;
    }

    const errText = await response.text();

    if (response.status === 429) {
      if (errText.toLowerCase().includes("quota") || errText.toLowerCase().includes("limit")) {
        throw new GroqQuotaError(
          `Groq API quota exceeded (429) - ${errText.slice(0, 200)}`
        );
      } else {
        if (attempt < MAX_RETRIES) {
          lastError = new Error(`Groq API Rate Limit (429) - mencoba lagi...`);
          await sleep(20000); // 20 detik
          continue;
        } else {
          throw new Error(`Terlalu sering request (Rate Limit 429). Mohon tunggu beberapa saat.`);
        }
      }
    }

    if (response.status === 503 && attempt < MAX_RETRIES) {
      lastError = new Error(
        `Groq API 503 (percobaan ${attempt + 1}/${MAX_RETRIES + 1}) - server sibuk, mencoba lagi...`
      );
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    throw new Error(`Groq API error: ${response.status} - ${errText}`);
  }

  throw lastError || new Error("Gagal chat setelah beberapa percobaan");
}
