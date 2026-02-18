'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { AppState, Playlist, Track } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { useAuth } from './auth-context'
import * as db from './db'
import { supabase } from './supabase'

interface PlaylistContextType {
    state: AppState | null
    loading: boolean
    activePlaylist: Playlist | null
    setActivePlaylist: (id: string) => void
    createPlaylist: (name: string) => Promise<Playlist | undefined>
    renamePlaylist: (id: string, name: string) => Promise<void>
    deletePlaylist: (id: string) => Promise<void>
    addTrack: (playlistId: string, track: Track) => Promise<void>
    removeTrack: (playlistId: string, trackId: string) => Promise<void>
    updateTrack: (playlistId: string, trackId: string, updates: Partial<Track>) => Promise<void>
    reorderTracks: (playlistId: string, tracks: Track[]) => Promise<void>
    exportPlaylist: (playlistId: string) => void
    importPlaylist: (json: string) => Promise<boolean>
    refreshPlaylists: () => Promise<void>
}

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined)

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth()
    const [state, setState] = useState<AppState | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchPlaylists = useCallback(async () => {
        if (!user) {
            setState(null)
            setLoading(false)
            return
        }

        try {
            await db.ensureProfile(user)
            let playlists = await db.getUserPlaylists(user.id)

            if (playlists.length === 0) {
                const defaultPlaylist = await db.createPlaylist(user.id, 'My Goated Playlist')
                playlists = [{
                    id: defaultPlaylist.id,
                    name: defaultPlaylist.name,
                    tracks: [],
                    createdAt: defaultPlaylist.created_at,
                    updatedAt: defaultPlaylist.created_at
                }]
            }

            setState({
                playlists,
                activePlaylistId: playlists.length > 0 ? playlists[0].id : null,
            })
        } catch (error) {
            console.error('Error fetching playlists:', error)
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => {
        fetchPlaylists()
    }, [fetchPlaylists])

    const activePlaylist = state?.playlists.find(p => p.id === state.activePlaylistId) ?? null

    const setActivePlaylist = useCallback((id: string) => {
        setState(s => s ? ({ ...s, activePlaylistId: id }) : null)
    }, [])

    const createPlaylist = useCallback(async (name: string) => {
        if (!user || !state) return

        try {
            const newPlaylist = await db.createPlaylist(user.id, name)
            const mappedPlaylist: Playlist = {
                ...newPlaylist,
                tracks: [],
                createdAt: newPlaylist.created_at,
                updatedAt: newPlaylist.created_at
            }

            setState(s => s ? ({
                playlists: [...s.playlists, mappedPlaylist],
                activePlaylistId: mappedPlaylist.id,
            }) : null)
            return mappedPlaylist
        } catch (error) {
            console.error('Error creating playlist:', error)
        }
    }, [user, state])

    const renamePlaylist = useCallback(async (id: string, name: string) => {
        try {
            const { error } = await supabase.from('playlists').update({ name }).eq('id', id)
            if (error) throw error
            setState(s => s ? ({
                ...s,
                playlists: s.playlists.map(p =>
                    p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p
                ),
            }) : null)
        } catch (error) {
            console.error('Error renaming playlist:', error)
        }
    }, [])

    const deletePlaylist = useCallback(async (id: string) => {
        if (!state) return
        try {
            const { error } = await supabase.from('playlists').delete().eq('id', id)
            if (error) throw error
            setState(s => {
                if (!s) return null
                const remaining = s.playlists.filter(p => p.id !== id)
                const nextActive = s.activePlaylistId === id
                    ? (remaining.length > 0 ? remaining[0].id : null)
                    : s.activePlaylistId
                return { playlists: remaining, activePlaylistId: nextActive }
            })
        } catch (error) {
            console.error('Error deleting playlist:', error)
        }
    }, [state])

    const addTrack = useCallback(async (playlistId: string, track: Track) => {
        try {
            // Optimistic update
            setState(s => s ? ({
                ...s,
                playlists: s.playlists.map(p =>
                    p.id === playlistId
                        ? { ...p, tracks: [...p.tracks, track], updatedAt: new Date().toISOString() }
                        : p
                ),
            }) : null)

            // Parse MM:SS to seconds if needed
            let seconds: number | undefined = undefined
            if (track.duration) {
                if (typeof track.duration === 'string' && track.duration.includes(':')) {
                    const [m, s] = track.duration.split(':').map(Number)
                    seconds = (m * 60) + s
                } else {
                    seconds = parseInt(track.duration as any)
                }
            }

            await db.addTrackToPlaylist(playlistId, {
                title: track.title,
                artist: track.artist,
                url: track.url,
                platform: track.platform as any,
                thumbnail: track.thumbnail,
                duration: seconds
            })

            // Refresh to ensure we have the correct DB IDs and sync state
            await fetchPlaylists()
        } catch (error) {
            console.error('Error adding track:', error)
        }
    }, [fetchPlaylists])

    const removeTrack = useCallback(async (playlistId: string, trackId: string) => {
        try {
            // Get track metadata before deleting the junction record
            const { data: trackData, error: trackFetchError } = await supabase
                .from('tracks')
                .select('*')
                .eq('id', trackId)
                .single()

            if (trackFetchError) throw trackFetchError

            // 1. Delete the connection from playlist_tracks
            const { error: deleteError } = await supabase
                .from('playlist_tracks')
                .delete()
                .eq('playlist_id', playlistId)
                .eq('track_id', trackId)

            if (deleteError) throw deleteError

            // 2. If it's a 'local' track, check if it's now orphaned (no other playlists use it)
            if (trackData.platform === 'local') {
                const { count, error: countError } = await supabase
                    .from('playlist_tracks')
                    .select('*', { count: 'exact', head: true })
                    .eq('track_id', trackId)

                if (countError) throw countError

                if (count === 0) {
                    console.log('[Cleanup] Last reference removed. Deleting file from bucket...')

                    // Extract path from storage URL: .../object/public/songs/(captures/filename.mp3)
                    const url = trackData.url
                    if (url.includes('/songs/')) {
                        const storagePath = url.split('/songs/')[1]
                        const decodedPath = decodeURIComponent(storagePath)

                        const { error: storageError } = await supabase
                            .storage
                            .from('songs')
                            .remove([decodedPath])

                        if (storageError) {
                            console.warn('[Cleanup] Storage deletion failed or file already gone:', storageError)
                        } else {
                            console.log('[Cleanup] File removed from storage bucket.')
                        }
                    }

                    // Delete the track record itself from the global library
                    const { error: finalDeleteError } = await supabase
                        .from('tracks')
                        .delete()
                        .eq('id', trackId)

                    if (finalDeleteError) {
                        console.warn('[Cleanup] Failed to delete track record:', finalDeleteError)
                    }
                }
            }

            // Update local state
            setState(s => s ? ({
                ...s,
                playlists: s.playlists.map(p =>
                    p.id === playlistId
                        ? { ...p, tracks: p.tracks.filter(t => t.id !== trackId), updatedAt: new Date().toISOString() }
                        : p
                ),
            }) : null)
        } catch (error) {
            console.error('Error removing track:', error)
        }
    }, [])

    const reorderTracks = useCallback(async (playlistId: string, tracks: Track[]) => {
        try {
            setState(s => s ? ({
                ...s,
                playlists: s.playlists.map(p =>
                    p.id === playlistId ? { ...p, tracks, updatedAt: new Date().toISOString() } : p
                ),
            }) : null)

            const updates = tracks.map((t, index) => ({ playlist_id: playlistId, track_id: t.id, position: index }))
            for (const update of updates) {
                await supabase.from('playlist_tracks').update({ position: update.position }).eq('playlist_id', playlistId).eq('track_id', update.track_id)
            }
        } catch (error) {
            console.error('Error reordering tracks:', error)
        }
    }, [])

    const exportPlaylist = useCallback((playlistId: string) => {
        if (!state) return
        const playlist = state.playlists.find(p => p.id === playlistId)
        if (!playlist) return
        const blob = new Blob([JSON.stringify(playlist, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${playlist.name.replace(/\s+/g, '-').toLowerCase()}.json`
        a.click()
        URL.revokeObjectURL(url)
    }, [state])

    const importPlaylist = useCallback(async (json: string) => {
        if (!user) return false
        try {
            const imported = JSON.parse(json) as Playlist
            if (!imported.name || !Array.isArray(imported.tracks)) return false
            const newPlaylist = await db.createPlaylist(user.id, imported.name)
            for (const track of imported.tracks) {
                await db.addTrackToPlaylist(newPlaylist.id, {
                    title: track.title,
                    artist: track.artist,
                    url: track.url,
                    platform: track.platform as any,
                    thumbnail: track.thumbnail,
                    duration: track.duration ? parseInt(track.duration) : undefined
                })
            }
            await fetchPlaylists()
            return true
        } catch (error) {
            console.error('Error importing playlist:', error)
            return false
        }
    }, [user, fetchPlaylists])

    const updateTrack = useCallback(async (playlistId: string, trackId: string, updates: Partial<Track>) => {
        try {
            setState(s => s ? ({
                ...s,
                playlists: s.playlists.map(p =>
                    p.id === playlistId
                        ? {
                            ...p,
                            tracks: p.tracks.map(t => (t.id === trackId ? { ...t, ...updates } : t)),
                            updatedAt: new Date().toISOString(),
                        }
                        : p
                ),
            }) : null)

            const { error } = await supabase.from('tracks').update({
                title: updates.title,
                artist: updates.artist,
                url: updates.url,
                thumbnail: updates.thumbnail,
                duration: updates.duration ? parseInt(updates.duration as any) : undefined
            }).eq('id', trackId)
            if (error) throw error
        } catch (error) {
            console.error('Error updating track:', error)
        }
    }, [])

    return (
        <PlaylistContext.Provider value={{
            state, loading, activePlaylist, setActivePlaylist, createPlaylist, renamePlaylist, deletePlaylist,
            addTrack, removeTrack, updateTrack, reorderTracks, exportPlaylist, importPlaylist, refreshPlaylists: fetchPlaylists
        }}>
            {children}
        </PlaylistContext.Provider>
    )
}

export function usePlaylists() {
    const context = useContext(PlaylistContext)
    if (!context) throw new Error('usePlaylists must be used within PlaylistProvider')
    return context
}
