import { Platform } from '@/types'

export function detectPlatform(url: string): Platform {
  const u = url.trim().toLowerCase()
  if (u.includes('spotify.com') || u.startsWith('spotify:')) return 'spotify'
  if (u.includes('music.youtube.com')) return 'ytmusic'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('soundcloud.com') || u.includes('on.soundcloud.com')) return 'soundcloud'
  if (u.includes('music.apple.com') || u.includes('itunes.apple.com')) return 'apple'
  return 'unknown'
}

export function platformDisplayName(platform: Platform): string {
  const names: Record<Platform, string> = {
    spotify: 'Spotify',
    youtube: 'YouTube',
    ytmusic: 'YouTube Music',
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
    ytmusic: '#FF0000',
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
    ytmusic: 'm',
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
    ytmusic: 'bg-youtube/20 text-youtube',
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
    ytmusic: 'bg-youtube/15 text-youtube',
    soundcloud: 'bg-soundcloud/10 text-soundcloud',
    apple: 'bg-apple/10 text-apple',
    local: 'bg-indigo-400/10 text-indigo-400',
    unknown: 'bg-muted/10 text-muted',
  }
  return classes[platform]
}

export function extractVideoId(url: string): string | null {
  if (!url) return null

  // Clean the URL
  const cleanedUrl = url.trim()

  // Regular expressions for various YouTube URL formats
  const patterns = [
    /(?:v=|\/v\/|embed\/|shorts\/|youtu\.be\/|\/watch\?v=|\/watch\?.+&v=)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = cleanedUrl.match(pattern)
    if (match && match[1]) return match[1]
  }

  // Fallback using URL search params for robustness
  try {
    const urlObj = new URL(cleanedUrl)
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      const v = urlObj.searchParams.get('v')
      if (v && v.length === 11) return v

      // Handle paths like /v/ID or /embed/ID
      const pathParts = urlObj.pathname.split('/')
      for (const part of pathParts) {
        if (part.length === 11 && /^[a-zA-Z0-9_-]+$/.test(part)) return part
      }
    }
  } catch (e) { }

  return null
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
    title = id ? `${platformDisplayName(platform)} Track` : `${platformDisplayName(platform)} Video`
  }
  else if (platform === 'soundcloud') {
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

// ─────────────────────────────────────────────
// YouTube logic moved to @/lib/platform
// ─────────────────────────────────────────────

export function buildYouTubeEmbedUrl(videoId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
    origin,
    widget_referrer: origin,
    playsinline: '1',
    hl: 'en',
    color: 'white',
    iv_load_policy: '3', // Hide annotations
  })
  // youtube-nocookie.com often bypasses certain region/domain restrictions
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
