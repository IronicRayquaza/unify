'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppState, Playlist, Track } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { useAuth } from './auth-context'
import * as db from './db'
import { supabase } from './supabase'

export function usePlaylists() {
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
      // Ensure profile exists (for users who signed up before the trigger was added)
      await db.ensureProfile(user)

      let playlists = await db.getUserPlaylists(user.id)

      // If no playlists exist, create a default one for a better UX
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
    if (!state) return
    setState({ ...state, activePlaylistId: id })
  }, [state])

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

      setState({
        playlists: [...state.playlists, mappedPlaylist],
        activePlaylistId: mappedPlaylist.id,
      })
      return mappedPlaylist
    } catch (error) {
      console.error('Error creating playlist:', error)
    }
  }, [user, state])

  const renamePlaylist = useCallback(async (id: string, name: string) => {
    if (!state) return

    try {
      const { error } = await supabase
        .from('playlists')
        .update({ name })
        .eq('id', id)

      if (error) throw error

      setState({
        ...state,
        playlists: state.playlists.map(p =>
          p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p
        ),
      })
    } catch (error) {
      console.error('Error renaming playlist:', error)
    }
  }, [state])

  const deletePlaylist = useCallback(async (id: string) => {
    if (!state) return

    try {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', id)

      if (error) throw error

      const remaining = state.playlists.filter(p => p.id !== id)
      const nextActive = state.activePlaylistId === id
        ? (remaining.length > 0 ? remaining[0].id : null)
        : state.activePlaylistId

      setState({ playlists: remaining, activePlaylistId: nextActive })
    } catch (error) {
      console.error('Error deleting playlist:', error)
    }
  }, [state])

  const addTrack = useCallback(async (playlistId: string, track: Track) => {
    if (!state) return

    try {
      // Optimistic update
      setState({
        ...state,
        playlists: state.playlists.map(p =>
          p.id === playlistId
            ? { ...p, tracks: [...p.tracks, track], updatedAt: new Date().toISOString() }
            : p
        ),
      })

      // Database sync
      await db.addTrackToPlaylist(playlistId, {
        title: track.title,
        artist: track.artist,
        url: track.url,
        platform: track.platform as any,
        thumbnail: track.thumbnail,
        duration: track.duration ? parseInt(track.duration) : undefined
      })
    } catch (error) {
      console.error('Error adding track:', error)
      // Rollback on error? For now just log
    }
  }, [state])

  const removeTrack = useCallback(async (playlistId: string, trackId: string) => {
    if (!state) return

    try {
      const { error } = await supabase
        .from('playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('track_id', trackId)

      if (error) throw error

      setState({
        ...state,
        playlists: state.playlists.map(p =>
          p.id === playlistId
            ? { ...p, tracks: p.tracks.filter(t => t.id !== trackId), updatedAt: new Date().toISOString() }
            : p
        ),
      })
    } catch (error) {
      console.error('Error removing track:', error)
    }
  }, [state])

  const reorderTracks = useCallback(async (playlistId: string, tracks: Track[]) => {
    if (!state) return

    try {
      // Optimistic update
      setState({
        ...state,
        playlists: state.playlists.map(p =>
          p.id === playlistId ? { ...p, tracks, updatedAt: new Date().toISOString() } : p
        ),
      })

      // Update positions in DB
      const updates = tracks.map((t, index) => ({
        playlist_id: playlistId,
        track_id: t.id,
        position: index
      }))

      // This is a bit complex for a single call if tracks already exist.
      // Easiest is to use an upsert if we have a primary key or a specific RPC.
      // For now, let's assume position update is enough if we have the list.
      for (const update of updates) {
        await supabase
          .from('playlist_tracks')
          .update({ position: update.position })
          .eq('playlist_id', playlistId)
          .eq('track_id', update.track_id)
      }
    } catch (error) {
      console.error('Error reordering tracks:', error)
    }
  }, [state])

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
    if (!user || !state) return false
    try {
      const imported = JSON.parse(json) as Playlist
      if (!imported.name || !Array.isArray(imported.tracks)) return false

      const newPlaylist = await db.createPlaylist(user.id, imported.name)

      // Add all tracks
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

      await fetchPlaylists() // Refetch to get everything synced
      return true
    } catch (error) {
      console.error('Error importing playlist:', error)
      return false
    }
  }, [user, state, fetchPlaylists])

  const updateTrack = useCallback(async (playlistId: string, trackId: string, updates: Partial<Track>) => {
    if (!state) return

    try {
      // Optimistic update
      setState({
        ...state,
        playlists: state.playlists.map(p =>
          p.id === playlistId
            ? {
              ...p,
              tracks: p.tracks.map(t => (t.id === trackId ? { ...t, ...updates } : t)),
              updatedAt: new Date().toISOString(),
            }
            : p
        ),
      })

      // Database sync
      const { error } = await supabase
        .from('tracks')
        .update({
          title: updates.title,
          artist: updates.artist,
          url: updates.url,
          thumbnail: updates.thumbnail,
          duration: updates.duration ? parseInt(updates.duration as any) : undefined
        })
        .eq('id', trackId)

      if (error) throw error
    } catch (error) {
      console.error('Error updating track:', error)
    }
  }, [state])

  return {
    state,
    loading,
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
  }
}

