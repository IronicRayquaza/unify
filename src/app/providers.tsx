'use client'

import { AuthProvider } from '@/lib/auth-context'
import { PlayerProvider } from '@/lib/player-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PlayerProvider>
        {children}
      </PlayerProvider>
    </AuthProvider>
  )
}
