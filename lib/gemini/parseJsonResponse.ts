/**
 * Robust JSON parser for AI/Gemini responses.
 * Handles unescaped newlines, markdown code blocks, quote escaping issues, trailing commas,
 * truncated JSON closing brackets, and partial extraction of arrays.
 */

export function parseJsonResponse<T = any>(rawText: string, fallbackObject: Partial<T> = {}): T {
  if (!rawText || typeof rawText !== "string") {
    return fallbackObject as T;
  }

  // Step 1: Clean markdown block wrappers
  let cleaned = rawText
    .replace(/```json/gi, "")
    .replace(/```/gi, "")
    .trim();

  // Step 2: Try standard JSON parse
  try {
    return JSON.parse(cleaned);
  } catch (err1) {
    // Continue
  }

  // Step 3: Extract first JSON object {...} or array [...] via regex
  const firstJsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (firstJsonMatch) {
    let candidate = firstJsonMatch[0];

    try {
      return JSON.parse(candidate);
    } catch (err2) {
      // Continue to repair
    }

    // Step 4: Fix common JSON syntax errors in LLM outputs
    try {
      let repaired = candidate
        .replace(/,\s*([\}\]])/g, "$1") // Remove trailing commas before } or ]
        .replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, "\\n") // Fix unescaped raw newlines inside quotes
        .replace(/\r\n/g, "\\n")
        .replace(/\r/g, "\\n");

      return JSON.parse(repaired);
    } catch (err3) {
      // Continue to bracket repair
    }

    // Step 5: Fix unclosed brackets/braces from truncated responses
    try {
      let repaired = candidate.replace(/,\s*([\}\]])/g, "$1");
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;

      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]";
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += "}";

      return JSON.parse(repaired);
    } catch (err4) {
      // Continue
    }
  }

  // Step 6: Regex extraction of "scenes" or "adegan" array if full JSON parse failed
  const scenesMatch = cleaned.match(/"(?:scenes|adegan|storyboard)"\s*:\s*(\[\s*\{[\s\S]*\}\s*\])/i);
  let extractedScenes: any[] = [];
  if (scenesMatch) {
    try {
      extractedScenes = JSON.parse(scenesMatch[1]);
    } catch {
      // Try fixing trailing commas in scenes array match
      try {
        const repairedArray = scenesMatch[1].replace(/,\s*([\}\]])/g, "$1");
        extractedScenes = JSON.parse(repairedArray);
      } catch {}
    }
  }

  console.warn("parseJsonResponse: Partial parsing applied.");

  return {
    ...fallbackObject,
    scenes: extractedScenes.length > 0 ? extractedScenes : (fallbackObject as any)?.scenes || [],
    rawOutput: cleaned,
  } as unknown as T;
}
