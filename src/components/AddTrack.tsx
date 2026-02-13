'use client'

import { useState, useRef } from 'react'
import { Track, Platform } from '@/types'
import { detectPlatform, isValidUrl, platformDisplayName } from '@/lib/platform'
import { v4 as uuidv4 } from 'uuid'
import { Plus, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  playlistId: string
  existingUrls: string[]
  onAdd: (track: Track) => void
}

const PLATFORM_HINTS: { platform: Platform; color: string }[] = [
  { platform: 'spotify', color: '#1DB954' },
  { platform: 'youtube', color: '#FF0000' },
  { platform: 'soundcloud', color: '#ff5500' },
  { platform: 'apple', color: '#fc3c44' },
]

export function AddTrack({ playlistId, existingUrls, onAdd }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; type: 'error' | 'success' } | null>(null)
  const [detectedPlatform, setDetectedPlatform] = useState<Platform | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showFeedback = (msg: string, type: 'error' | 'success') => {
    setFeedback({ msg, type })
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500)
  }

  const handleChange = (val: string) => {
    setUrl(val)
    if (val.trim()) {
      const p = detectPlatform(val)
      setDetectedPlatform(p !== 'unknown' ? p : null)
    } else {
      setDetectedPlatform(null)
    }
  }

  const handleAdd = async () => {
    const trimmed = url.trim()
    if (!trimmed) return showFeedback('Please enter a URL', 'error')
    if (!isValidUrl(trimmed)) return showFeedback("That doesn't look like a valid URL", 'error')
    if (existingUrls.includes(trimmed)) return showFeedback('Track already in playlist!', 'error')

    setLoading(true)
    try {
      const res = await fetch(`/api/resolve?url=${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`)
      }
      const data = await res.json()

      const track: Track = {
        id: uuidv4(),
        url: data.url || trimmed,
        platform: data.platform,
        title: data.title,
        artist: data.artist,
        thumbnail: data.thumbnail,
        duration: data.duration,
        addedAt: new Date().toISOString(),
      }

      onAdd(track)
      setUrl('')
      setDetectedPlatform(null)
      showFeedback(`Added "${track.title}" ✓`, 'success')
    } catch (e: any) {
      console.error('Add Track Error:', e)
      showFeedback(e.message || 'Failed to resolve track. Check the URL.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-8 relative overflow-hidden">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: 'linear-gradient(90deg, #c8ff00, #ff6b35)' }} />

      <div className="font-mono-custom text-[11px] tracking-[3px] uppercase text-muted mb-4">
        Add Track — Paste Any Link
      </div>

      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            value={url}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleAdd()}
            placeholder="https://open.spotify.com/track/... or youtube.com/watch?v=..."
            className="w-full bg-bg border border-border rounded-xl px-4 py-3.5 font-mono-custom text-sm text-text placeholder-muted outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 caret-accent"
            spellCheck={false}
            autoComplete="off"
          />
          {detectedPlatform && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="font-mono-custom text-[10px] tracking-wider uppercase px-2 py-1 rounded-full"
                style={{
                  background: `${PLATFORM_HINTS.find(h => h.platform === detectedPlatform)?.color}20`,
                  color: PLATFORM_HINTS.find(h => h.platform === detectedPlatform)?.color,
                }}>
                {platformDisplayName(detectedPlatform)}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={loading || !url.trim()}
          className={clsx(
            'flex items-center gap-2 px-6 py-3.5 rounded-xl font-display font-bold text-sm transition-all',
            'bg-accent text-bg hover:shadow-lg hover:shadow-accent/30 hover:-translate-y-0.5',
            'disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0'
          )}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          {loading ? 'Resolving…' : 'Add'}
        </button>
      </div>

      {/* Platform hints */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {PLATFORM_HINTS.map(({ platform, color }) => (
          <span key={platform} className="flex items-center gap-1.5 font-mono-custom text-[11px] text-muted bg-surface2 border border-border rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {platformDisplayName(platform)}
          </span>
        ))}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={clsx(
          'mt-3 px-4 py-2.5 rounded-xl font-mono-custom text-xs border',
          feedback.type === 'error'
            ? 'text-red-400 bg-red-400/8 border-red-400/20'
            : 'text-accent bg-accent/8 border-accent/20'
        )}>
          {feedback.msg}
        </div>
      )}
    </div>
  )
}
