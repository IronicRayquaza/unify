'use client'

import { useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaylists } from '@/lib/playlist-context'
import { Sidebar } from '@/components/Sidebar'
import { Navbar } from '@/components/Navbar'
import { PlaylistView } from '@/components/PlaylistView'
import { Track } from '@/types'
import { useAuth } from '@/lib/auth-context'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin')
    }
  }, [user, loading, router])

  const {
    state,
    loading: playlistsLoading,
    activePlaylist,
    setActivePlaylist,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addTrack,
    removeTrack,
    updateTrack,
    reorderTracks,
    exportPlaylist,
    importPlaylist,
  } = usePlaylists()

  const importInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => {
    importInputRef.current?.click()
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const json = evt.target?.result as string
      const ok = importPlaylist(json)
      if (!ok) alert('Invalid playlist file. Make sure it is a UNIFY export.')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  if (loading || playlistsLoading || !state) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="font-display font-black text-4xl tracking-tighter"
            style={{ background: 'linear-gradient(135deg, #c8ff00, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            UNIFY
          </div>
          <div className="font-mono-custom text-xs text-muted tracking-[3px] uppercase animate-pulse">
            {loading ? 'Authenticating…' : 'Syncing Playlists…'}
          </div>
        </div>
      </div>
    )
  }

  // If we are not loading and have no user, the effect will redirect. 
  // We can return null or the loading screen here to prevent flash of content.
  if (!user) return null

  return (
    <div className="flex min-h-screen bg-bg relative">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 grid-bg opacity-[0.18]" />
        <div className="absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full animate-bgPulse"
          style={{ background: 'radial-gradient(circle, rgba(200,255,0,0.04) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,107,53,0.04) 0%, transparent 70%)', animationDelay: '4s' }} />
      </div>

      {/* Hidden import input */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Sidebar */}
      <div className="relative z-10 flex-shrink-0">
        <Sidebar
          playlists={state.playlists}
          activeId={state.activePlaylistId}
          onSelect={setActivePlaylist}
          onCreate={createPlaylist}
          onDelete={deletePlaylist}
          onExport={exportPlaylist}
          onImport={handleImportClick}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 h-screen flex flex-col relative z-10 min-w-0 overflow-hidden">
        <Navbar
          playlist={activePlaylist}
          onRename={(name) => activePlaylist && renamePlaylist(activePlaylist.id, name)}
        />

        <main className="flex-1 overflow-y-auto px-8 py-8 pb-32 max-w-5xl w-full mx-auto scrollbar-thin">
          {activePlaylist ? (
            <PlaylistView
              playlist={activePlaylist}
              onAddTrack={(track: Track) => addTrack(activePlaylist.id, track)}
              onRemoveTrack={(id) => removeTrack(activePlaylist.id, id)}
              onUpdateTrack={(id, updates) => updateTrack(activePlaylist.id, id, updates)}
              onReorderTracks={(tracks) => reorderTracks(activePlaylist.id, tracks)}
            />
          ) : (
            <div className="text-center py-20 text-muted font-mono-custom text-sm">
              Select or create a playlist to get started.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
