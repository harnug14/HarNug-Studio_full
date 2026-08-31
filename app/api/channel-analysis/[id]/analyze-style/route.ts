import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { analyzeStyleDna } from "@/lib/gemini/analyzeStyleDna";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const selectedModel = body?.model || DEFAULT_GEMINI_MODEL;

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("channel_analysis")
      .select("*, channel_analysis_entries(*)")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profil referensi tidak ditemukan" },
        { status: 404 }
      );
    }

    const entries = profile.channel_analysis_entries || [];

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Belum ada entri naskah di profil ini. Tambah minimal 1 entri dulu." },
        { status: 400 }
      );
    }

    const entriesForAnalysis = entries.map((e: any) => ({
      title: e.title || "",
      fullScript: e.full_script || "",
    }));

    const styleDna = await callGeminiWithRotation(supabase, (apiKey) =>
      analyzeStyleDna(entriesForAnalysis, apiKey, selectedModel)
    );

    const { error: updateError } = await supabase
      .from("channel_analysis")
      .update({
        style_dna: styleDna,
        style_dna_updated_at: new Date().toISOString(),
        style_dna_entry_count: entries.length,
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "Gagal menyimpan hasil analisis DNA gaya" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, styleDna });
  } catch (err: any) {
    console.error("ANALYZE-STYLE ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Terjadi kesalahan saat menganalisis gaya" },
      { status: 500 }
    );
  }
}
