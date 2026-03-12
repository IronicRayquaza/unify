export type Platform = 'spotify' | 'youtube' | 'ytmusic' | 'soundcloud' | 'apple' | 'local' | 'unknown'

export interface Track {
  id: string
  url: string
  platform: Platform
  title: string
  artist: string
  thumbnail?: string
  duration?: string
  embedUrl?: string
  addedAt: string
  libraryTrackId?: string
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: string
  updatedAt: string
}

export interface AppState {
  playlists: Playlist[]
  activePlaylistId: string | null
}

export interface ResolveResponse {
  title: string
  artist: string
  thumbnail?: string
  duration?: string
  platform: Platform
  url?: string
  embedUrl?: string
  isSnippet?: boolean
}
