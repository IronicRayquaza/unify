import { supabase } from './supabase'

export interface Playlist {
    id: string
    name: string
    description?: string
    cover_url?: string
    is_public: boolean
    created_at: string
}

export interface Track {
    id: string
    title: string
    artist: string
    url: string
    thumbnail?: string
    platform: 'youtube' | 'soundcloud' | 'spotify'
    duration?: number
}

export async function getUserPlaylists(userId: string) {
    const { data, error } = await supabase
        .from('playlists')
        .select(`
            id,
            name,
            description,
            cover_url,
            is_public,
            created_at,
            playlist_tracks (
                position,
                track:tracks (
                    id,
                    title,
                    artist,
                    url,
                    thumbnail,
                    platform,
                    duration
                )
            )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) throw error

    // Map the nested data to match our frontend Playlist interface
    return data.map((p: any) => ({
        id: p.id,
        name: p.name,
        tracks: p.playlist_tracks
            .sort((a: any, b: any) => a.position - b.position)
            .map((pt: any) => pt.track),
        createdAt: p.created_at,
        updatedAt: p.created_at // Assuming updatedAt matches for now
    }))
}

export async function createPlaylist(userId: string, name: string, description?: string, isPublic = false) {
    const { data, error } = await supabase
        .from('playlists')
        .insert([{ user_id: userId, name, description, is_public: isPublic }])
        .select()
        .single()

    if (error) throw error
    return data as Playlist
}

export async function addTrackToPlaylist(playlistId: string, track: Omit<Track, 'id'>) {
    // 1. Check if track exists or create it
    const { data: existingTrack, error: fetchError } = await supabase
        .from('tracks')
        .select('id')
        .eq('url', track.url)
        .maybeSingle()

    if (fetchError) throw fetchError

    let trackId = existingTrack?.id

    if (!trackId) {
        const { data: newTrack, error: createError } = await supabase
            .from('tracks')
            .insert([track])
            .select('id')
            .single()

        if (createError) throw createError
        trackId = newTrack.id
    }

    // 2. Get highest position to append to the end
    const { data: posData, error: posError } = await supabase
        .from('playlist_tracks')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (posError) throw posError
    const nextPosition = (posData?.position ?? -1) + 1

    // 3. Add to playlist_tracks
    const { error: linkError } = await supabase
        .from('playlist_tracks')
        .insert({
            playlist_id: playlistId,
            track_id: trackId,
            position: nextPosition
        })

    if (linkError) throw linkError
}

export async function getPlaylistTracks(playlistId: string) {
    const { data, error } = await supabase
        .from('playlist_tracks')
        .select(`
      track:tracks (*)
    `)
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true })

    if (error) throw error
    return data.map((item: any) => item.track) as Track[]
}

export async function ensureProfile(user: any) {
    const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (fetchError) throw fetchError

    if (!profile) {
        const { error: insertError } = await supabase
            .from('profiles')
            .insert([{
                id: user.id,
                email: user.email,
                username: user.user_metadata?.username || user.email?.split('@')[0],
                avatar_url: user.user_metadata?.avatar_url,
                updated_at: new Date().toISOString()
            }])

        if (insertError) throw insertError
    }
}

