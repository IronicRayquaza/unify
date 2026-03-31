export function detectPlatform(url: string) {
  if (url.includes('spotify.com')) return 'spotify'
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    if (url.includes('music.youtube.com')) return 'ytmusic'
    return 'youtube'
  }
  if (url.includes('soundcloud.com')) return 'soundcloud'
  if (url.includes('apple.com')) return 'apple'
  return 'unknown'
}

export function parseFallbackInfo(url: string, platform: string) {
  return {
    title: 'Unknown Title',
    artist: 'Unknown Artist'
  }
}

export function getYoutubeThumbnail(url: string) {
  const vid = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1]
  return vid ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : ''
}
