'use client'

import { AuthProvider } from '@/lib/auth-context'
import { PlayerProvider } from '@/lib/player-context'
import { PlaylistProvider } from '@/lib/playlist-context'
import { SpotifyProvider } from '@/lib/spotify-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PlaylistProvider>
        <SpotifyProvider>
          <PlayerProvider>
            {children}
          </PlayerProvider>
        </SpotifyProvider>
      </PlaylistProvider>
    </AuthProvider>
  )
}
