import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { analyzeVideo } from "@/lib/gemini/analyzeVideo";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { videoIndex } = await req.json();

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    // Ambil row referensi ini
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

    const videos = row.video_data?.videos || [];
    const video = videos[videoIndex];

    if (!video) {
      return NextResponse.json(
        { error: `Video pada index ${videoIndex} tidak ditemukan` },
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
        { error: "Tidak ada API Key Gemini aktif. Cek halaman Settings > API Keys" },
        { status: 400 }
      );
    }

    // Analisis video ini via Gemini
    let analysisResult;
    let analysisError: string | null = null;
    try {
      analysisResult = await analyzeVideo(video.url, keyRow.api_key);
    } catch (err: any) {
      analysisError = err.message || "Gagal menganalisis video ini";
    }

    // Update video_data.analyses dengan hasil (atau catat error, tapi tetap lanjut)
    const currentAnalyses = row.video_data?.analyses || [];
    currentAnalyses[videoIndex] = analysisResult
      ? { videoId: video.videoId, title: video.title, ...analysisResult }
      : { videoId: video.videoId, title: video.title, error: analysisError };

    const { error: updateError } = await supabase
      .from("referensi")
      .update({
        video_data: { videos, analyses: currentAnalyses },
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "Gagal menyimpan hasil analisis" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: !analysisError,
      error: analysisError,
      videoIndex,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}