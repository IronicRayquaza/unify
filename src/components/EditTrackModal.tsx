'use client'

import { useState, useEffect } from 'react'
import { Track } from '@/types'
import { platformDisplayName, platformColor } from '@/lib/platform'
import { X } from 'lucide-react'

interface Props {
  track: Track | null
  onSave: (updates: Partial<Track>) => void
  onClose: () => void
}

export function EditTrackModal({ track, onSave, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')

  useEffect(() => {
    if (track) {
      setTitle(track.title)
      setArtist(track.artist)
    }
  }, [track])

  if (!track) return null

  const handleSave = () => {
    if (title.trim()) {
      onSave({ title: title.trim(), artist: artist.trim() })
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm animate-fadeIn"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md mx-4 relative"
        style={{ animation: 'modalIn 0.3s cubic-bezier(0.16,1,0.3,1) both' }}>

        <style>{`
          @keyframes modalIn {
            from { opacity: 0; transform: scale(0.94) translateY(16px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>

        {/* Top accent */}
        <div className="absolute top-0 left-6 right-6 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${platformColor(track.platform)}, transparent)` }} />

        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-surface2 border border-border text-muted hover:text-text transition-colors">
          <X size={14} />
        </button>

        <div className="font-mono-custom text-[10px] tracking-[3px] uppercase mb-1"
          style={{ color: platformColor(track.platform) }}>
          {platformDisplayName(track.platform)}
        </div>
        <h2 className="font-display font-bold text-xl mb-6 tracking-tight">Edit Track</h2>

        <div className="space-y-4">
          <div>
            <label className="font-mono-custom text-[11px] tracking-[2px] uppercase text-muted mb-2 block">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 font-display font-semibold text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 caret-accent transition-all"
            />
          </div>

          <div>
            <label className="font-mono-custom text-[11px] tracking-[2px] uppercase text-muted mb-2 block">
              Artist
            </label>
            <input
              value={artist}
              onChange={e => setArtist(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 font-mono-custom text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 caret-accent transition-all"
            />
          </div>

          <div>
            <label className="font-mono-custom text-[11px] tracking-[2px] uppercase text-muted mb-2 block">
              URL (read-only)
            </label>
            <div className="w-full bg-bg/50 border border-border/50 rounded-xl px-4 py-3 font-mono-custom text-xs text-muted truncate">
              {track.url}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-accent text-bg font-display font-bold text-sm hover:shadow-lg hover:shadow-accent/25 hover:-translate-y-0.5 transition-all"
          >
            Save Changes
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-border text-text font-display text-sm hover:border-muted hover:bg-surface2 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
