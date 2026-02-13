'use client'

import { useState } from 'react'
import { Playlist } from '@/types'
import { Plus, Music2, Trash2, Upload, Download, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  playlists: Playlist[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onImport: () => void
}

export function Sidebar({ playlists, activeId, onSelect, onCreate, onDelete, onExport, onImport }: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim())
      setNewName('')
      setCreating(false)
    }
  }

  if (collapsed) {
    return (
      <div className="w-12 bg-surface border-r border-border flex flex-col items-center py-6 gap-4 transition-all">
        <button onClick={() => setCollapsed(false)} className="text-muted hover:text-accent transition-colors p-2">
          <ChevronRight size={16} />
        </button>
        {playlists.map(p => (
          <button
            key={p.id}
            onClick={() => { onSelect(p.id); setCollapsed(false) }}
            className={clsx('w-8 h-8 rounded-lg flex items-center justify-center transition-all', activeId === p.id ? 'bg-accent text-bg' : 'bg-surface2 text-muted hover:text-text')}
            title={p.name}
          >
            <Music2 size={14} />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="w-64 bg-surface border-r border-border flex flex-col h-screen sticky top-0 transition-all">
      {/* Header */}
      <div className="px-5 py-5 border-b border-border flex items-center justify-between">
        <div>
          <div className="font-display font-black text-xl tracking-tighter"
            style={{ background: 'linear-gradient(135deg, #c8ff00, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            UNIFY
          </div>
          <div className="font-mono-custom text-[9px] tracking-[2px] uppercase text-muted">Playlist Engine</div>
        </div>
        <button onClick={() => setCollapsed(true)} className="text-muted hover:text-text transition-colors p-1 rotate-180">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Playlists */}
      <div className="flex-1 overflow-y-auto py-3">
        <div className="px-4 mb-2 font-mono-custom text-[10px] tracking-[2px] uppercase text-muted/60">
          Your Playlists
        </div>

        {playlists.map(playlist => (
          <div key={playlist.id} className="group relative">
            <button
              onClick={() => onSelect(playlist.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-all',
                activeId === playlist.id
                  ? 'bg-accent/10 text-accent'
                  : 'text-text hover:bg-surface2'
              )}
            >
              <div className={clsx(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                activeId === playlist.id ? 'bg-accent text-bg' : 'bg-surface2 text-muted'
              )}>
                <Music2 size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-sm truncate">{playlist.name}</div>
                <div className="font-mono-custom text-[10px] text-muted">
                  {playlist.tracks.length} track{playlist.tracks.length !== 1 ? 's' : ''}
                </div>
              </div>
            </button>

            {/* Playlist actions */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onExport(playlist.id) }}
                className="p-1 rounded text-muted hover:text-accent transition-colors"
                title="Export"
              >
                <Download size={11} />
              </button>
              {playlists.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(playlist.id) }}
                  className="p-1 rounded text-muted hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* New playlist form */}
        {creating ? (
          <div className="px-4 py-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder="Playlist name..."
              className="w-full bg-bg border border-accent/50 rounded-lg px-3 py-2 font-mono-custom text-xs text-text outline-none caret-accent"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleCreate} className="flex-1 py-1.5 rounded-lg bg-accent text-bg font-display font-bold text-xs">
                Create
              </button>
              <button onClick={() => setCreating(false)} className="flex-1 py-1.5 rounded-lg border border-border text-muted font-display text-xs">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-muted hover:text-text hover:bg-surface2 transition-all"
          >
            <div className="w-8 h-8 rounded-lg border border-dashed border-border flex items-center justify-center">
              <Plus size={14} />
            </div>
            <span className="font-display text-sm">New Playlist</span>
          </button>
        )}
      </div>

      {/* Bottom actions */}
      <div className="px-4 py-4 border-t border-border">
        <button
          onClick={onImport}
          className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border border-border text-muted hover:text-text hover:border-muted transition-all font-display text-sm"
        >
          <Upload size={14} />
          Import Playlist
        </button>
      </div>
    </div>
  )
}
