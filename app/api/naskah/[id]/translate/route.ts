import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";

const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    const { data: naskah, error: fetchErr } = await supabase
      .from("naskah")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !naskah) {
      return NextResponse.json({ error: "Naskah tidak ditemukan" }, { status: 404 });
    }

    const systemPrompt = `You are a World-Class Native American Scriptwriter & Voiceover Director for top US YouTube Shorts creators.
Your task is to translate and adapt the Indonesian script into highly engaging, punchy, and authentic Natural American English.

--- MANDATORY TRANSLATION QUALITY RULES ---
1. NATURAL AMERICAN ENGLISH CONVERSATIONAL STYLE (NO LITERAL TRANSLATION):
   - Translate thoughts, context, and emotion naturally as spoken by top US storytellers (e.g., Vox, Johnny Harris, Magnates Media style).
   - NEVER perform word-for-word or literal translations from Indonesian phrasing.
   - Strictly avoid awkward textbook syntax or stiff translation structures.

2. ELIMINATE ENGLISH AI TEMPLATES & FILLERS:
   - STRIKTLY PROHIBIT AI TEMPLATE CLICHÉS in the translated English text, such as:
     * "Have you ever wondered..."
     * "Did you know that..."
     * "In this video..."
     * "Imagine a world where..."
     * "Little did they know..."
     * "Stay tuned until the end..."
     * "Don't forget to like and subscribe..."
   - Open immediately with a sharp, punchy Hook. Make transitions smooth and natural.

3. PRESERVE 100% FACTS, KNOWLEDGE, NUMBERS, & TIMELINE:
   - PRESERVE ALL HISTORICAL FACTS, DATES, YEARS, PROPER NAMES, LOCATIONS, KNOWLEDGE, AND STATISTICAL NUMBERS EXACTLY AS THEY ARE IN THE ORIGINAL SCRIPT.
   - Do NOT change the chronological sequence, pacing, narrative meaning, or storytelling logic.

4. STRUCTURE & OUTPUT FORMAT:
   - Maintain the line-by-line / paragraph-by-paragraph layout of the original script.
   - Output ONLY the clean, final American English voiceover script text without markdown conversational intros or meta comments.`;

    const userPrompt = `Indonesian Script to Adapt into Natural American English:
Title: ${naskah.judul}

Script Body:
"${naskah.isi_naskah}"

Produce the natural American English voiceover script version now following all translation rules above.`;

    const englishScript = await callGeminiWithRotation(supabase, async (apiKey) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
      }

      const json = await response.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
    });

    // Update database
    const { data: updatedNaskah, error: updateErr } = await supabase
      .from("naskah")
      .update({
        english_script: englishScript,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      console.error("Gagal update english_script:", updateErr);
    }

    return NextResponse.json({
      data: updatedNaskah || naskah,
      englishScript,
    });
  } catch (err: any) {
    console.error("Translation error:", err);
    return NextResponse.json(
      { error: err.message || "Gagal menerjemahkan naskah" },
      { status: 500 }
    );
  }
}