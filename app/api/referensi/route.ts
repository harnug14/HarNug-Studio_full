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

  // Channel lookup mode: fetch YouTube channel stats for Profile page
  const channelLookup = req.nextUrl.searchParams.get("channelLookup");
  if (channelLookup) {
    try {
      const { data: keyRow } = await supabase
        .from("api_keys")
        .select("api_key")
        .eq("provider", "youtube")
        .eq("status", "active")
        .limit(1)
        .single();

      if (!keyRow) {
        return NextResponse.json({ error: "No active YouTube API key" }, { status: 400 });
      }

      // Resolve handle/ID to channel ID
      let resolvedId = channelLookup;
      if (channelLookup.startsWith("@")) {
        resolvedId = (await getChannelId(`https://youtube.com/${channelLookup}`, keyRow.api_key)) || "";
      } else if (channelLookup.startsWith("UC")) {
        resolvedId = channelLookup;
      } else {
        resolvedId = (await getChannelId(`https://youtube.com/@${channelLookup}`, keyRow.api_key)) || "";
      }

      if (!resolvedId) {
        return NextResponse.json({ channel: null });
      }

      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings,contentDetails&id=${resolvedId}&key=${keyRow.api_key}`
      );
      const ytData = await ytRes.json();

      if (!ytData.items || ytData.items.length === 0) {
        return NextResponse.json({ channel: null });
      }

      const ch = ytData.items[0];
      const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
      
      let topVideos: any[] = [];
      let latestVideos: any[] = [];

      if (uploadsPlaylistId) {
        // Fetch up to 50 latest uploads
        const playlistRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${keyRow.api_key}`
        );
        const playlistData = await playlistRes.json();
        
        const videoIds = (playlistData.items || []).map((item: any) => item.snippet?.resourceId?.videoId).filter(Boolean);
        
        if (videoIds.length > 0) {
          const statsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds.join(",")}&key=${keyRow.api_key}`
          );
          const statsData = await statsRes.json();
          
          const allVids = (statsData.items || []).map((item: any) => ({
            id: item.id,
            title: item.snippet?.title || "",
            thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
            publishedAt: item.snippet?.publishedAt || "",
            viewCount: parseInt(item.statistics?.viewCount || "0", 10),
            likeCount: parseInt(item.statistics?.likeCount || "0", 10),
            commentCount: parseInt(item.statistics?.commentCount || "0", 10),
            duration: item.contentDetails?.duration || "",
          }));

          // Sort for latest
          latestVideos = [...allVids].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).slice(0, 5);
          
          // Sort for top views
          topVideos = [...allVids].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
        }
      }

      return NextResponse.json({
        channel: {
          title: ch.snippet.title,
          description: ch.snippet.description || "",
          thumbnail: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || "",
          bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl || "",
          country: ch.snippet.country || "",
          publishedAt: ch.snippet.publishedAt || "",
          subscriberCount: ch.statistics.subscriberCount || "0",
          videoCount: ch.statistics.videoCount || "0",
          viewCount: ch.statistics.viewCount || "0",
          topVideos,
          latestVideos,
        },
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Default: list all referensi
  const { data, error } = await supabase
    .from("referensi")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}