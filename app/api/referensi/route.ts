import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getChannelId } from "@/lib/youtube/getChannelId";
import { getTopVideos } from "@/lib/youtube/getTopVideos";

export async function POST(req: NextRequest) {
  try {
    const { channelUrl } = await req.json();

    if (!channelUrl) {
      return NextResponse.json(
        { error: "channelUrl wajib diisi" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    // Ambil salah satu API key YouTube yang aktif
    const { data: keyRow, error: keyError } = await supabase
      .from("api_keys")
      .select("api_key")
      .eq("provider", "youtube")
      .eq("status", "active")
      .limit(1)
      .single();

    if (keyError || !keyRow) {
      return NextResponse.json(
        { error: "Tidak ada API Key YouTube aktif. Cek halaman Settings > API Keys" },
        { status: 400 }
      );
    }

    const youtubeApiKey = keyRow.api_key;

    // 1. Ambil Channel ID dari link
    const channelId = await getChannelId(channelUrl, youtubeApiKey);
    if (!channelId) {
      return NextResponse.json(
        { error: "Channel tidak ditemukan dari link yang diberikan" },
        { status: 400 }
      );
    }

    // 2. Ambil 10 video terpopuler (durasi di bawah 3 menit)
    const topVideos = await getTopVideos(channelId, youtubeApiKey, 10);

    if (topVideos.length === 0) {
      return NextResponse.json(
        {
          error:
            "Tidak ditemukan video dengan durasi di bawah 3 menit di channel ini",
        },
        { status: 400 }
      );
    }

    // 3. Simpan row awal ke Supabase dengan status processing
    const { data: newRow, error: insertError } = await supabase
      .from("referensi")
      .insert({
        user_id: user.id,
        channel_url: channelUrl,
        channel_id: channelId,
        status: "processing",
        video_data: { videos: topVideos, analyses: [] },
      })
      .select()
      .single();

    if (insertError || !newRow) {
      return NextResponse.json(
        { error: "Gagal menyimpan data ke database" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: newRow.id,
      totalVideos: topVideos.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("referensi")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}