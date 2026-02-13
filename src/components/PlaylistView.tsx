'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Playlist, Track, Platform } from '@/types'
import { SortableTrackCard } from './SortableTrackCard'
import { AddTrack } from './AddTrack'
import { EditTrackModal } from './EditTrackModal'
import { Music2 } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  playlist: Playlist
  onAddTrack: (track: Track) => void
  onRemoveTrack: (trackId: string) => void
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void
  onReorderTracks: (tracks: Track[]) => void
}

type FilterType = 'all' | Platform

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Spotify', value: 'spotify' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'SoundCloud', value: 'soundcloud' },
  { label: 'Apple Music', value: 'apple' },
]

import { usePlayer } from '@/lib/player-context'

export function PlaylistView({ playlist, onAddTrack, onRemoveTrack, onUpdateTrack, onReorderTracks }: Props) {
  const { currentTrack, play, isPlaying } = usePlayer()
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = playlist.tracks.findIndex(t => t.id === active.id)
    const newIndex = playlist.tracks.findIndex(t => t.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderTracks(arrayMove(playlist.tracks, oldIndex, newIndex))
    }
  }

  const filteredTracks = filter === 'all'
    ? playlist.tracks
    : playlist.tracks.filter(t => t.platform === filter)

  const availableFilters = FILTERS.filter(f => {
    if (f.value === 'all') return true
    return playlist.tracks.some(t => t.platform === f.value)
  })

  return (
    <div className="flex-1 min-h-screen">
      <AddTrack
        playlistId={playlist.id}
        existingUrls={playlist.tracks.map(t => t.url)}
        onAdd={onAddTrack}
      />

      {/* Filter tabs */}
      {playlist.tracks.length > 0 && (
        <div className="flex items-center justify-between mb-5">
          <div className="font-mono-custom text-[11px] tracking-[3px] uppercase text-muted/60">
            Playlist · {playlist.tracks.length} track{playlist.tracks.length !== 1 ? 's' : ''}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {availableFilters.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={clsx(
                  'font-mono-custom text-[11px] tracking-wider uppercase px-3 py-1.5 rounded-full border transition-all',
                  filter === f.value
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-muted hover:border-muted hover:bg-surface2'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Track list */}
      {filteredTracks.length === 0 ? (
        <div className="text-center py-20 animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4 text-muted">
            <Music2 size={24} />
          </div>
          <div className="font-display font-bold text-lg text-muted mb-2">
            {playlist.tracks.length === 0 ? 'No tracks yet' : `No ${filter} tracks`}
          </div>
          <div className="font-mono-custom text-xs text-muted/50 max-w-xs mx-auto leading-relaxed">
            {playlist.tracks.length === 0
              ? 'Paste a Spotify, YouTube, SoundCloud, or Apple Music link above to get started.'
              : `Add some ${filter} links to see them here.`}
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={filteredTracks.map(t => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2.5 relative">
              {filteredTracks.map((track, i) => (
                <SortableTrackCard
                  key={track.id}
                  track={track}
                  index={i}
                  isPlaying={currentTrack?.id === track.id && isPlaying}
                  onPlay={() => play(track, playlist.tracks)}
                  onRemove={() => onRemoveTrack(track.id)}
                  onEdit={() => setEditingTrack(track)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Edit modal */}
      <EditTrackModal
        track={editingTrack}
        onSave={(updates) => editingTrack && onUpdateTrack(editingTrack.id, updates)}
        onClose={() => setEditingTrack(null)}
      />
    </div>
  )
}
