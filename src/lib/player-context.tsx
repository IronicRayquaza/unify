
'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { Track } from '@/types'

type RepeatMode = 'off' | 'all' | 'one'

interface PlayerContextType {
    currentTrack: Track | null
    isPlaying: boolean
    queue: Track[]
    currentIndex: number
    volume: number
    isMuted: boolean
    isShuffle: boolean
    repeatMode: RepeatMode
    play: (track: Track, newQueue?: Track[]) => void
    pause: () => void
    resume: () => void
    next: (isAuto?: boolean) => void
    prev: () => void
    setQueue: (tracks: Track[]) => void
    setVolume: (val: number) => void
    toggleMute: () => void
    toggleShuffle: () => void
    toggleRepeat: () => void
    seek: (time: number) => void // Placeholder if needed
}

const PlayerContext = createContext<PlayerContextType | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
    const [queue, _setQueue] = useState<Track[]>([])
    const [currentIndex, setCurrentIndex] = useState(-1)
    const [isPlaying, setIsPlaying] = useState(false)

    // New Features
    const [volume, setVolume] = useState(0.8)
    const [isMuted, setIsMuted] = useState(false)
    const [isShuffle, setIsShuffle] = useState(false)
    const [repeatMode, setRepeatMode] = useState<RepeatMode>('off')

    const play = useCallback((track: Track, newQueue?: Track[]) => {
        if (newQueue) {
            _setQueue(newQueue)
            const idx = newQueue.findIndex(t => t.id === track.id)
            setCurrentIndex(idx)
        } else {
            // If playing from existing queue, find index
            const idx = queue.findIndex(t => t.id === track.id)
            if (idx !== -1) setCurrentIndex(idx)
        }
        setCurrentTrack(track)
        setIsPlaying(true)
    }, [queue])

    const pause = useCallback(() => setIsPlaying(false), [])
    const resume = useCallback(() => setIsPlaying(true), [])

    const next = useCallback((isAuto = false) => {
        console.log('[PlayerContext] Next called:', {
            isAuto,
            currentIndex,
            queueLength: queue.length,
            repeatMode,
            isShuffle
        })

        if (queue.length === 0) {
            console.warn('[PlayerContext] Next called with empty queue')
            return
        }

        // Handle Repeat One (only on auto-advance)
        if (isAuto && repeatMode === 'one' && currentTrack) {
            console.log('[PlayerContext] Repeating current track...')
            const track = currentTrack
            setCurrentTrack(null)
            setTimeout(() => {
                setCurrentTrack(track)
                setIsPlaying(true)
            }, 50)
            return
        }

        let nextIdx = -1

        if (isShuffle) {
            nextIdx = Math.floor(Math.random() * queue.length)
            if (queue.length > 1 && nextIdx === currentIndex) {
                nextIdx = (nextIdx + 1) % queue.length
            }
        } else {
            if (currentIndex < queue.length - 1) {
                nextIdx = currentIndex + 1
            } else if (repeatMode === 'all') {
                nextIdx = 0
            }
        }

        if (nextIdx !== -1) {
            const nextTrack = queue[nextIdx]
            console.log('[PlayerContext] Advancing to:', nextTrack.title)
            setCurrentIndex(nextIdx)
            setCurrentTrack(nextTrack)
            setIsPlaying(true)
        } else {
            console.log('[PlayerContext] End of queue reached')
            setIsPlaying(false)
        }
    }, [currentIndex, queue, isShuffle, repeatMode, currentTrack])

    const prev = useCallback(() => {
        if (queue.length === 0) return

        let prevIdx = -1

        if (isShuffle) {
            // For now, random prev (or could implement history stack later)
            prevIdx = Math.floor(Math.random() * queue.length)
        } else {
            if (currentIndex > 0) {
                prevIdx = currentIndex - 1
            } else if (repeatMode === 'all') {
                prevIdx = queue.length - 1 // Loop to end
            }
        }

        if (prevIdx !== -1) {
            setCurrentIndex(prevIdx)
            setCurrentTrack(queue[prevIdx])
            setIsPlaying(true)
        }
    }, [currentIndex, queue, isShuffle, repeatMode])

    const setQueue = useCallback((tracks: Track[]) => {
        _setQueue(tracks)
        // If we are currently playing something, sync the index in the new queue
        const currentId = currentTrack?.id
        if (currentId) {
            const idx = tracks.findIndex(t => t.id === currentId)
            if (idx !== -1) {
                console.log('[PlayerContext] Syncing currentIndex to:', idx)
                setCurrentIndex(idx)
            }
        }
    }, [currentTrack?.id])

    const toggleShuffle = useCallback(() => setIsShuffle(prev => !prev), [])

    const toggleRepeat = useCallback(() => {
        setRepeatMode(prev => {
            if (prev === 'off') return 'all'
            if (prev === 'all') return 'one'
            return 'off'
        })
    }, [])

    const toggleMute = useCallback(() => setIsMuted(prev => !prev), [])

    return (
        <PlayerContext.Provider value={{
            currentTrack,
            isPlaying,
            queue,
            currentIndex,
            volume,
            isMuted,
            isShuffle,
            repeatMode,
            play,
            pause,
            resume,
            next,
            prev,
            setQueue,
            setVolume,
            toggleMute,
            toggleShuffle,
            toggleRepeat,
            seek: () => { }
        }}>
            {children}
        </PlayerContext.Provider>
    )
}

export const usePlayer = () => {
    const context = useContext(PlayerContext)
    if (!context) throw new Error('usePlayer must be used within PlayerProvider')
    return context
}
