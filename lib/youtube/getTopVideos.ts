// Mengambil video terpopuler dari sebuah channel YouTube
// Filter: durasi di bawah 3 menit, diurutkan by viewCount, ambil 10 teratas

export interface VideoInfo {
  videoId: string;
  title: string;
  viewCount: number;
  durationSeconds: number;
  url: string;
}

export async function getTopVideos(
  channelId: string,
  apiKey: string,
  maxResults: number = 10
): Promise<VideoInfo[]> {
  // 1. Ambil uploads playlist ID dari channel
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
  );
  const channelData = await channelRes.json();

  const uploadsPlaylistId =
    channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error("Tidak bisa menemukan uploads playlist untuk channel ini");
  }

  // 2. Ambil daftar video dari uploads playlist (maksimal 50 video pertama untuk dianalisa)
  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}`
  );
  const playlistData = await playlistRes.json();

  const videoIds: string[] = (playlistData.items || [])
    .map((item: any) => item.snippet?.resourceId?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) {
    return [];
  }

  // 3. Ambil statistics + duration untuk semua video itu (batch, maksimal 50 ID per request)
  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds.join(
      ","
    )}&key=${apiKey}`
  );
  const statsData = await statsRes.json();

  const allVideos: VideoInfo[] = (statsData.items || []).map((item: any) => ({
    videoId: item.id,
    title: item.snippet?.title || "",
    viewCount: parseInt(item.statistics?.viewCount || "0", 10),
    durationSeconds: parseISO8601Duration(item.contentDetails?.duration || ""),
    url: `https://www.youtube.com/watch?v=${item.id}`,
  }));

  // 4. Filter durasi di bawah 3 menit (180 detik), lalu sort by viewCount, ambil teratas
  const filtered = allVideos
    .filter((v) => v.durationSeconds > 0 && v.durationSeconds < 180)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, maxResults);

  return filtered;
}

// Helper: ubah format durasi YouTube (contoh: "PT1M30S") jadi total detik
function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}