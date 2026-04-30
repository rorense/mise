export function extractYoutubeVideoId(input: string): string | null {
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace('/', '').trim();
      return id.length >= 6 ? id : null;
    }
    if (host.includes('youtube.com')) {
      if (u.pathname.startsWith('/watch')) {
        return u.searchParams.get('v');
      }
      if (u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/')[2] ?? null;
      }
      if (u.pathname.startsWith('/embed/')) {
        return u.pathname.split('/')[2] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchYoutubeDescription(
  videoId: string,
  apiKey: string
): Promise<{ title: string; description: string }> {
  const url =
    'https://www.googleapis.com/youtube/v3/videos?' +
    new URLSearchParams({
      part: 'snippet',
      id: videoId,
      key: apiKey,
    }).toString();
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`YouTube API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    items?: { snippet?: { title?: string; description?: string } }[];
  };
  const sn = data.items?.[0]?.snippet;
  if (!sn) throw new Error('Video not found or API key invalid');
  return {
    title: sn.title ?? 'Untitled',
    description: sn.description ?? '',
  };
}
