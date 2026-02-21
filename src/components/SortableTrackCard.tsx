'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Track } from '@/types'
import { extractVideoId, platformBgClass, platformDisplayName, platformIcon, platformTagClass, platformColor } from '@/lib/platform'
import { GripVertical, ExternalLink, Pencil, Trash2, MonitorPlay } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'

interface Props {
  track: Track
  index: number
  isPlaying: boolean
  onPlay: () => void
  onRemove: () => void
  onEdit: () => void
}

export function SortableTrackCard({ track, index, isPlaying, onPlay, onRemove, onEdit }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'group flex items-center gap-4 bg-surface border rounded-2xl px-5 py-4 transition-all duration-200 animate-trackIn',
        isPlaying
          ? 'border-accent bg-accent/5'
          : 'border-border hover:border-accent/30 hover:bg-surface2 hover:translate-x-1',
        isDragging && 'shadow-2xl shadow-black/50'
      )}
    >
      {/* Playing indicator */}
      {isPlaying && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-accent" />
      )}

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="text-muted/30 hover:text-muted cursor-grab active:cursor-grabbing transition-colors flex-shrink-0"
      >
        <GripVertical size={16} />
      </div>

      {/* Platform badge */}
      <div className={clsx(
        'w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0',
        platformBgClass(track.platform)
      )}>
        {platformIcon(track.platform)}
      </div>

      {/* Index / Waveform */}
      <div className="w-7 flex-shrink-0 text-center">
        {isPlaying ? (
          <div className="flex items-end justify-center gap-0.5 h-4">
            {[0, 0.15, 0.3, 0.45].map((delay) => (
              <div
                key={delay}
                className="w-0.5 bg-accent rounded-full animate-wave"
                style={{ animationDelay: `${delay}s`, height: '100%' }}
              />
            ))}
          </div>
        ) : (
          <span className="font-mono-custom text-xs text-muted">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* Thumbnail */}
      {track.thumbnail && (
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative">
          <Image src={track.thumbnail} alt={track.title} fill className="object-cover" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onPlay}>
        <div className={clsx('font-display font-bold text-sm truncate', isPlaying && 'text-accent')}>
          {track.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono-custom text-xs text-muted truncate">{track.artist}</span>
          <span className={clsx('font-mono-custom text-[10px] px-2 py-0.5 rounded-full tracking-wider uppercase flex-shrink-0', platformTagClass(track.platform))}>
            {platformDisplayName(track.platform)}
          </span>
          {track.duration && (
            <span className="font-mono-custom text-[10px] text-muted/60 flex-shrink-0">{track.duration}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg border border-border text-muted hover:text-accent hover:border-accent/50 transition-all"
          title={`Open in ${platformDisplayName(track.platform)}`}
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink size={13} />
        </a>

        {(track.platform === 'youtube' || track.platform === 'ytmusic') && (
          <Link
            href={`/watch/${extractVideoId(track.url)}`}
            className="p-1.5 rounded-lg border border-border text-accent hover:bg-accent/10 hover:border-accent transition-all"
            title="Open in Direct Watch Mode"
            onClick={e => e.stopPropagation()}
          >
            <MonitorPlay size={13} />
          </Link>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-muted transition-all"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-1.5 rounded-lg border border-border text-muted hover:text-red-400 hover:border-red-400/50 transition-all"
          title="Remove"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Platform color accent on hover */}
      <div
        className="absolute right-0 top-0 bottom-0 w-0.5 rounded-l opacity-0 group-hover:opacity-30 transition-opacity"
        style={{ background: platformColor(track.platform) }}
      />
    </div>
  )
}
