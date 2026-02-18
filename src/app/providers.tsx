'use client'

import { AuthProvider } from '@/lib/auth-context'
import { PlayerProvider } from '@/lib/player-context'
import { PlaylistProvider } from '@/lib/playlist-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PlaylistProvider>
        <PlayerProvider>
          {children}
        </PlayerProvider>
      </PlaylistProvider>
    </AuthProvider>
  )
}
