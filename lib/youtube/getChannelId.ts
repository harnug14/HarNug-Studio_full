// Mengambil Channel ID dari berbagai format link YouTube
// Support: /channel/UCxxx, /@handle, /c/namachannel, /user/namachannel

export async function getChannelId(
  channelUrl: string,
  apiKey: string
): Promise<string | null> {
  const url = channelUrl.trim();

  // Format 1: link sudah mengandung Channel ID langsung
  const directMatch = url.match(/\/channel\/(UC[\w-]{22})/);
  if (directMatch) {
    return directMatch[1];
  }

  // Format 2: link pakai @handle (paling umum sekarang)
  const handleMatch = url.match(/\/@([\w.-]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    return await resolveHandleToChannelId(handle, apiKey);
  }

  // Format 3: link lama /c/namachannel atau /user/namachannel
  const legacyMatch = url.match(/\/(c|user)\/([\w-]+)/);
  if (legacyMatch) {
    const name = legacyMatch[2];
    return await resolveHandleToChannelId(name, apiKey);
  }

  return null;
}

async function resolveHandleToChannelId(
  handle: string,
  apiKey: string
): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(
      handle
    )}&key=${apiKey}`
  );
  const data = await res.json();

  if (data.items && data.items.length > 0) {
    return data.items[0].id;
  }

  // Fallback: coba search kalau forHandle tidak ketemu (untuk format /c/ atau /user/ lama)
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(
      handle
    )}&key=${apiKey}`
  );
  const searchData = await searchRes.json();

  if (searchData.items && searchData.items.length > 0) {
    return searchData.items[0].snippet.channelId;
  }

  return null;
}