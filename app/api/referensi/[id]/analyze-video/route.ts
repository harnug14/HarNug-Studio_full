import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { analyzeVideo } from "@/lib/gemini/analyzeVideo";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { videoIndex, model } = await req.json();
    const selectedModel = model || "gemini-2.5-flash";

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

    const videos = row.video_data?.videos || [];
    const video = videos[videoIndex];

    if (!video) {
      return NextResponse.json(
        { error: `Video pada index ${videoIndex} tidak ditemukan` },
        { status: 400 }
      );
    }

    let analysisResult;
    let analysisError: string | null = null;
    try {
      analysisResult = await callGeminiWithRotation(supabase, (apiKey) =>
        analyzeVideo(video.url, apiKey, selectedModel)
      );
    } catch (err: any) {
      analysisError = err.message || "Gagal menganalisis video ini";
    }

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
    console.error("ANALYZE-VIDEO ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}