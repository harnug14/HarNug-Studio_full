import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { summarizeChannel } from "@/lib/gemini/summarizeChannel";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    const { data: row, error: rowError } = await supabase
      .from("referensi")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (rowError || !row) {
      return NextResponse.json(
        { error: "Data referensi tidak ditemukan" },
        { status: 404 }
      );
    }

    const analyses = row.video_data?.analyses || [];

    // Hanya pakai analisis yang sukses (tidak error) untuk dirangkum
    const validAnalyses = analyses.filter((a: any) => a && !a.error);

    if (validAnalyses.length === 0) {
      await supabase
        .from("referensi")
        .update({ status: "error" })
        .eq("id", id);

      return NextResponse.json(
        { error: "Tidak ada video yang berhasil dianalisis untuk dirangkum" },
        { status: 400 }
      );
    }

    // Ambil API key Gemini yang aktif
    const { data: keyRow, error: keyError } = await supabase
      .from("api_keys")
      .select("api_key")
      .eq("provider", "gemini")
      .eq("status", "active")
      .limit(1)
      .single();

    if (keyError || !keyRow) {
      return NextResponse.json(
        { error: "Tidak ada API Key Gemini aktif" },
        { status: 400 }
      );
    }

    const summary = await summarizeChannel(validAnalyses, keyRow.api_key);

    const { error: updateError } = await supabase
      .from("referensi")
      .update({
        status: "done",
        analysis_niche: summary.niche,
        analysis_visual: summary.visual,
        analysis_editing: summary.editing,
        analysis_hook_cta: summary.hookCta,
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "Gagal menyimpan hasil rangkuman" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.from("referensi").update({ status: "error" }).eq("id", id);
    } catch {
      // abaikan kalau update status error ini sendiri gagal
    }

    return NextResponse.json(
      { error: err.message || "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}