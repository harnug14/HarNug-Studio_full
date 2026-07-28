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

    const systemPrompt = `You are a World-Class Native English Scriptwriter for YouTube Shorts.
Your task is to translate and adapt the Indonesian script into dynamic, punchy, natural American English.

--- CRITICAL TRANSLATION RULES ---
1. DO NOT do word-for-word Google Translate. Rewrite the script so it feels natively written by a top US YouTube creator.
2. Use short, crisp sentences with natural rhythm, idioms, and high engagement hooks.
3. PRESERVE 100% OF ALL SPECIFIC FACTS, YEARS, DATES, NAMES, AND NUMBERS EXACTLY AS IN THE ORIGINAL SCRIPT.
4. KEEP THE SAME SCENE BREAKDOWN STRUCTURE (1-3 sentences per situation change).
5. Output ONLY the final English Script text, clean and ready for voiceover audio recording.`;

    const userPrompt = `Indonesian Script to Translate to English:
Title: ${naskah.judul}

Script Body:
"${naskah.isi_naskah}"

Produce the natural English script version now.`;

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
