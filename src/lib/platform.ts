import { Platform } from '@/types'

export function detectPlatform(url: string): Platform {
  const u = url.trim().toLowerCase()
  if (u.includes('spotify.com') || u.startsWith('spotify:')) return 'spotify'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('soundcloud.com') || u.includes('on.soundcloud.com')) return 'soundcloud'
  if (u.includes('music.apple.com') || u.includes('itunes.apple.com')) return 'apple'
  return 'unknown'
}

export function platformDisplayName(platform: Platform): string {
  const names: Record<Platform, string> = {
    spotify: 'Spotify',
    youtube: 'YouTube',
    soundcloud: 'SoundCloud',
    apple: 'Apple Music',
    local: 'Local File',
    unknown: 'Unknown',
  }
  return names[platform]
}

export function platformColor(platform: Platform): string {
  const colors: Record<Platform, string> = {
    spotify: '#1DB954',
    youtube: '#FF0000',
    soundcloud: '#ff5500',
    apple: '#fc3c44',
    local: '#818cf8',
    unknown: '#6b6b88',
  }
  return colors[platform]
}

export function platformIcon(platform: Platform): string {
  const icons: Record<Platform, string> = {
    spotify: '♪',
    youtube: '▶',
    soundcloud: '☁',
    apple: '♫',
    local: '📁',
    unknown: '◉',
  }
  return icons[platform]
}

export function platformBgClass(platform: Platform): string {
  const classes: Record<Platform, string> = {
    spotify: 'bg-spotify/15 text-spotify',
    youtube: 'bg-youtube/15 text-youtube',
    soundcloud: 'bg-soundcloud/15 text-soundcloud',
    apple: 'bg-apple/15 text-apple',
    local: 'bg-indigo-400/15 text-indigo-400',
    unknown: 'bg-muted/15 text-muted',
  }
  return classes[platform]
}

export function platformTagClass(platform: Platform): string {
  const classes: Record<Platform, string> = {
    spotify: 'bg-spotify/10 text-spotify',
    youtube: 'bg-youtube/10 text-youtube',
    soundcloud: 'bg-soundcloud/10 text-soundcloud',
    apple: 'bg-apple/10 text-apple',
    local: 'bg-indigo-400/10 text-indigo-400',
    unknown: 'bg-muted/10 text-muted',
  }
  return classes[platform]
}

export function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

export function extractSpotifyId(url: string): string | null {
  const match = url.match(/(?:track\/|spotify:track:)([a-zA-Z0-9]+)/)
  return match ? match[1] : null
}

export function getYoutubeThumbnail(url: string): string | undefined {
  const id = extractVideoId(url)
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : undefined
}

export function parseFallbackInfo(url: string, platform: Platform) {
  let title = 'Unknown Track'
  let artist = platformDisplayName(platform)

  if (platform === 'youtube') {
    const id = extractVideoId(url)
    title = id ? `YouTube Video` : 'YouTube Track'
  } else if (platform === 'soundcloud') {
    const m = url.match(/soundcloud\.com\/([^/]+)\/([^?#]+)/)
    if (m) {
      artist = decodeURIComponent(m[1]).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      title = decodeURIComponent(m[2]).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
  } else if (platform === 'apple') {
    const m = url.match(/\/([^/]+)\/([^?#/]+)\?i=/)
    if (m) {
      artist = decodeURIComponent(m[1]).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      title = decodeURIComponent(m[2]).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
  }

  return { title, artist }
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
