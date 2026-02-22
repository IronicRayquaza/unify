'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Playlist } from '@/types'
import { LogIn, LogOut, User, Music } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useSpotify } from '@/lib/spotify-context'
import clsx from 'clsx'
import Image from 'next/image'



interface Props {
  playlist: Playlist | null
  onRename: (name: string) => void
}

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  youtube: '#FF0000',
  ytmusic: '#FF0000',
  soundcloud: '#ff5500',
  apple: '#fc3c44',
  unknown: '#6b6b88',
}

export function Navbar({ playlist, onRename }: Props) {
  const { user, signOut } = useAuth()
  const { isConnected, login: connectSpotify, logout: disconnectSpotify } = useSpotify()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(playlist?.name ?? '')

  const handleRename = () => {
    if (name.trim()) onRename(name.trim())
    setEditing(false)
  }

  const handleSignIn = () => {
    router.push('/auth/signin')
  }

  const platformCounts = playlist
    ? Object.entries(
      playlist.tracks.reduce((acc, t) => {
        acc[t.platform] = (acc[t.platform] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    )
    : []

  return (
    <div className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-40 px-8 py-4 flex items-center gap-6">
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') { setName(playlist?.name ?? ''); setEditing(false) }
            }}
            className="font-display font-bold text-xl tracking-tight bg-transparent border-b-2 border-accent outline-none text-text caret-accent w-full max-w-xs"
          />
        ) : (
          <button
            onClick={() => { setName(playlist?.name ?? ''); setEditing(true) }}
            className="font-display font-bold text-xl tracking-tight hover:text-accent transition-colors text-left truncate max-w-xs group"
          >
            {playlist?.name ?? 'Playlist'}
            <span className="font-mono-custom text-[10px] text-muted/50 ml-2 tracking-widest group-hover:text-muted transition-colors">RENAME</span>
          </button>
        )}
      </div>

      <div className="hidden md:flex items-center gap-4">
        <div className="text-right">
          <div className="font-display font-bold text-lg text-accent leading-none">{playlist?.tracks.length ?? 0}</div>
          <div className="font-mono-custom text-[9px] tracking-[2px] text-muted uppercase">Tracks</div>
        </div>
        {platformCounts.length > 0 && (
          <div className="flex gap-1.5 items-center">
            {platformCounts.map(([platform, count]) => (
              <div key={platform} className="flex items-center gap-1 font-mono-custom text-[10px] px-2 py-1 rounded-full bg-surface2 border border-border">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PLATFORM_COLORS[platform] }} />
                <span className="text-muted">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        {user ? (
          <div className="flex items-center gap-3">
            {/* Spotify Connection Status */}
            {!isConnected ? (
              <button
                onClick={connectSpotify}
                className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1DB954]/10 border border-[#1DB954]/20 text-[#1DB954] hover:bg-[#1DB954]/20 transition-all mr-2"
              >
                <Music size={12} />
                <span className="font-mono-custom text-[10px] tracking-wider uppercase">Connect Spotify</span>
              </button>
            ) : (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface2 border border-border mr-2 opacity-60 hover:opacity-100 transition-opacity cursor-pointer group relative" title="Connected to Spotify">
                <div className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
                <span className="font-mono-custom text-[10px] text-muted tracking-wider uppercase">Spotify Active</span>
                <button onClick={disconnectSpotify} className="absolute inset-0 w-full h-full opacity-0" aria-label="Disconnect Spotify"></button>
              </div>
            )}

            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-surface2 border border-border flex items-center justify-center">
                <User size={14} className="text-muted" />
              </div>
              <span className="font-mono-custom text-xs text-muted">
                {user.user_metadata?.display_name || user.email?.split('@')[0]}
              </span>
            </div>
            {/* 
                The signOut function from useAuth requires no arguments. 
                However, to satisfy the event handler signature, we can wrap it in an arrow function. 
                Since signOut returns a Promise<void>, the arrow function satisfies () => void | Promise<void>.
            */}
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 font-mono-custom text-xs text-muted hover:text-red-400 border border-border hover:border-red-400/30 rounded-lg px-3 py-2 transition-all"
            >
              <LogOut size={12} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            className={clsx('flex items-center gap-1.5 font-mono-custom text-xs px-3 py-2 rounded-lg border transition-all', 'border-accent/40 text-accent hover:bg-accent/10')}
          >
            <LogIn size={12} />
            Sign in
          </button>
        )}
      </div>
    </div>
  )
}
