import { GroqQuotaError } from "./keyRotation";
import { ChatMode, ContentTarget, ChatMessage, buildStyleInstruction } from "../gemini/chatWithGemini";
import { fetchTavilySearchResults } from "../tavily";

export async function chatWithGroq(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  mode: ChatMode,
  contextText?: string,
  contentTarget?: ContentTarget
): Promise<string> {
  const activeModel = model || "groq-llama-3.3-70b-versatile";
  const groqModel = activeModel.replace(/^groq-/, "");
  let finalContextText = contextText || "";

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

  const formattedMessages: any[] = [
    {
      role: "system",
      content: finalContextText
        ? `${systemInstruction}\n\n[Konteks Tambahan & Data Web Real-time]:\n${finalContextText}`
        : systemInstruction,
    },
  ];

  for (const m of messages) {
    formattedMessages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content || " ",
    });
  }

  const body = {
    model: groqModel,
    messages: formattedMessages,
    temperature: 0.7,
    max_tokens: 4096,
  };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
    throw new GroqQuotaError(`Groq API quota/rate limit habis (429) - ${errText.slice(0, 200)}`);
  }

  throw new Error(`Groq API error: ${response.status} - ${errText}`);
}