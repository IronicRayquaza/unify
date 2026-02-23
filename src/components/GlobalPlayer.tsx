'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePlayer } from '@/lib/player-context'
import Image from 'next/image'
import {
    Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
    Loader2, Music2, Shuffle, Repeat, Repeat1, ExternalLink,
    Maximize2, Download, CloudDownload, Video,
} from 'lucide-react'
import * as Slider from '@radix-ui/react-slider'
import { extractVideoId, platformDisplayName } from '@/lib/platform'
import { useAuth } from '@/lib/auth-context'
import { usePlaylists } from '@/lib/playlist-context'
import { useSpotify } from '@/lib/spotify-context'
import clsx from 'clsx'

function formatTime(seconds: number) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00'
    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return `${min}:${sec < 10 ? '0' : ''}${sec}`
}

function getYouTubeErrorMessage(code: any): string {
    const c = (code !== undefined && code !== null) ? Number(code) : NaN
    if (isNaN(c)) return 'YouTube playback error. Try refreshing.'
    switch (c) {
        case 2: return 'Invalid link or video ID.'
        case 5: return 'HTML5 Player error.'
        case 100: return 'Track removed or private.'
        case 101:
        case 150: return 'Label restricted embedding. Try the search again or open on YouTube.'
        default: return `YouTube error code ${c}.`
    }
}

declare global {
    interface Window {
        Spotify: any
        onSpotifyWebPlaybackSDKReady: () => void
        SC: any
        YT: any
        onYouTubeIframeAPIReady: () => void
    }
}

export function GlobalPlayer() {
    const { user } = useAuth()
    const {
        currentTrack, isPlaying, pause, resume, next, prev,
        volume, isMuted, isShuffle, repeatMode,
        setVolume, toggleMute, toggleShuffle, toggleRepeat
    } = usePlayer()
    const { token: spotifyToken } = useSpotify()

    const isYoutube = currentTrack?.platform === 'youtube' || currentTrack?.platform === 'ytmusic'
    const isSoundCloud = currentTrack?.platform === 'soundcloud'
    const isSpotify = currentTrack?.platform === 'spotify'
    const isApple = currentTrack?.platform === 'apple'
    const isLocal = currentTrack?.platform === 'local'
    const isEmbedPlatform = isYoutube || isSoundCloud || isApple

    const [progress, setProgress] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isBuffering, setIsBuffering] = useState(false)
    const [playerError, setPlayerError] = useState<string | null>(null)
    const [playReady, setPlayReady] = useState(false)
    const [showVideo, setShowVideo] = useState(true)
    const [hasMounted, setHasMounted] = useState(false)

    const localAudioRef = useRef<HTMLAudioElement>(null)
    const ytPlayerRef = useRef<any>(null)
    const ytIntervalRef = useRef<any>(null)
    const scWidgetRef = useRef<any>(null)
    const spotifyPlayerRef = useRef<any>(null)
    const ytContainerRef = useRef<HTMLDivElement>(null)

    const { activePlaylist, addTrack: addTrackToPlaylist, refreshPlaylists } = usePlaylists()
    const [isCapturing, setIsCapturing] = useState(false)

    const isPlayingRef = useRef(isPlaying)
    const volumeRef = useRef(volume)
    const isMutedRef = useRef(isMuted)
    const nextRef = useRef(next)
    const resumeRef = useRef(resume)
    const pauseRef = useRef(pause)
    const prevPlatformRef = useRef<string | null>(null)
    const currentTrackRef = useRef(currentTrack)

    useEffect(() => { setHasMounted(true) }, [])
    useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
    useEffect(() => { volumeRef.current = volume }, [volume])
    useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
    useEffect(() => { nextRef.current = next }, [next])
    useEffect(() => { resumeRef.current = resume }, [resume])
    useEffect(() => { pauseRef.current = pause }, [pause])
    useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])

    // ... (keyboard hotkeys) ...
    // Cleanup on logout
    useEffect(() => {
        if (!user && isPlaying) {
            pause()
        }
    }, [user, isPlaying, pause])

    // ─── Global Stops & Resets ───
    const stopAllPlayers = useCallback(() => {
        console.log('[GlobalPlayer] Stop all players triggered')
        // 1. YouTube
        try {
            if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo()
        } catch (e) { }

        // 2. SoundCloud
        try {
            if (scWidgetRef.current?.pause) scWidgetRef.current.pause()
        } catch (e) { }

        // 3. Spotify
        try {
            if (spotifyPlayerRef.current?.pause) spotifyPlayerRef.current.pause()
        } catch (e) { }

        // 4. Local
        try {
            if (localAudioRef.current) {
                localAudioRef.current.pause()
                localAudioRef.current.currentTime = 0
            }
        } catch (e) { }
    }, [])

    // Reset on track change
    useEffect(() => {
        const now = Date.now()
        trackChangeTimeRef.current = now // Update transition timer for ALL changes

        // If track becomes null (transitioning), stop all players immediately
        if (!currentTrack) {
            stopAllPlayers()
            lastSpotifyIdRef.current = null // Clear stale ID
            prevPlatformRef.current = null // CRITICAL: Stop Spotify listener from reacting
            setProgress(0)
            setDuration(0)
            setPlayerError(null)
            return
        }

        const currentPlatform = currentTrack.platform
        // If switching platforms, stop the previous one to avoid overlap
        if (prevPlatformRef.current && prevPlatformRef.current !== currentPlatform) {
            stopAllPlayers()
        }
        prevPlatformRef.current = currentPlatform

        setProgress(0)
        setDuration(0)
        setPlayerError(null)

        // Reset state for new track
        const isPlatformChanging = prevPlatformRef.current !== currentPlatform
        // For YouTube/Spotify/SoundCloud, we reset for better sync.
        // For Local, we keep it true so the button doesn't lock up.
        if (isPlatformChanging || isSpotify || isSoundCloud) {
            setPlayReady(false)
            setIsBuffering(true)
        } else if (isLocal) {
            setPlayReady(true)
            setIsBuffering(false)
        }

        if (isEmbedPlatform) setShowVideo(true)
    }, [currentTrack, isEmbedPlatform, isLocal, isSpotify, isSoundCloud, stopAllPlayers])

    // ─── YouTube Logic ───
    const initYTPlayer = useCallback((videoId: string) => {
        if (!window.YT || !window.YT.Player) {
            if (!document.getElementById('youtube-sdk')) {
                const script = document.createElement('script')
                script.id = 'youtube-sdk'
                script.src = 'https://www.youtube.com/iframe_api'
                document.body.appendChild(script)
            }
            window.onYouTubeIframeAPIReady = () => initYTPlayer(videoId)
            return
        }

        // Detect if player is alive and functional
        const isPlayerHealthy = ytPlayerRef.current &&
            typeof ytPlayerRef.current.loadVideoById === 'function' &&
            typeof ytPlayerRef.current.getPlayerState === 'function'

        if (isPlayerHealthy) {
            try {
                console.log('[YouTube] Reusing existing player for:', videoId)
                setPlayReady(true)
                setIsBuffering(true)

                ytPlayerRef.current.loadVideoById({
                    videoId: videoId,
                    startSeconds: 0
                })

                // If isPlaying is true, we want to start it immediately.
                // However, loadVideoById usually autoplays. We force it just in case.
                if (isPlayingRef.current) {
                    if (ytPlayerRef.current?.playVideo) ytPlayerRef.current.playVideo()
                }

                // Sync volume
                ytPlayerRef.current.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                return
            } catch (e) {
                console.warn('[YouTube] Reuse failed, recreating player:', e)
                ytPlayerRef.current = null
            }
        }

        // If we need a new player, ensure the target div exists. 
        // If the old one was an iframe, the API will handle replacing it if we provide the same ID.
        if (!document.getElementById('yt-player')) {
            console.error('[YouTube] Player target element not found')
            return
        }

        ytPlayerRef.current = new window.YT.Player('yt-player', {
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                controls: 1,
                modestbranding: 1,
                rel: 0,
                enablejsapi: 1,
                origin: typeof window !== 'undefined' ? window.location.origin : ''
            },
            events: {
                onReady: (e: any) => {
                    setPlayReady(true)
                    setIsBuffering(false)
                    if (isPlayingRef.current && typeof e.target.playVideo === 'function') {
                        e.target.playVideo()
                    }
                    if (typeof e.target.setVolume === 'function') {
                        e.target.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                    }
                    if (typeof e.target.getDuration === 'function') {
                        const d = e.target.getDuration()
                        if (d > 0) setDuration(d)
                    }
                },
                onStateChange: (e: any) => {
                    const state = e.data
                    console.log('[YouTube] State Change:', state)

                    if (state === 0) { // ENDED
                        console.log('[YouTube] Video Finished, calling next')
                        setTimeout(() => nextRef.current(true), 200)
                    }
                    else if (state === 1) { // PLAYING
                        setIsBuffering(false)
                        setPlayerError(null)
                        if (!isPlayingRef.current) resumeRef.current()

                        if (typeof e.target.getDuration === 'function') {
                            const d = e.target.getDuration()
                            if (d > 0) setDuration(d)
                        }
                    } else if (state === 2) { // PAUSED
                        if (isPlayingRef.current) pauseRef.current()
                    } else if (state === 3) { // BUFFERING
                        setIsBuffering(true)
                    } else if (state === 5 || state === -1) { // CUED / UNSTARTED
                        // If it's loaded but not playing, and we want it to be playing, force it.
                        if (isPlayingRef.current && typeof e.target.playVideo === 'function') {
                            e.target.playVideo()
                        }
                    }
                },
                onError: (e: any) => {
                    const msg = getYouTubeErrorMessage(e.data)
                    setPlayerError(msg)
                    setIsBuffering(false)
                    console.error('[YouTube] Error:', e.data, msg)

                    // Auto-skip on fatal embed errors after a delay
                    if (e.data === 150 || e.data === 101 || e.data === 100) {
                        console.log('[YouTube] Fatal error, skipping track in 3s...')
                        setTimeout(() => {
                            if (currentTrack && currentTrack.platform === (isYoutube ? 'youtube' : 'ytmusic')) {
                                nextRef.current(true)
                            }
                        }, 3000)
                    }
                }
            }
        })
    }, [])

    // ─── Global Progress Sync ───
    useEffect(() => {
        if (!hasMounted || !isPlaying) return

        let interval: any
        if (isYoutube && ytPlayerRef.current) {
            interval = setInterval(() => {
                const p = ytPlayerRef.current
                if (p && typeof p.getCurrentTime === 'function') {
                    const state = p.getPlayerState?.()
                    if (state === 1) { // Playing
                        const current = p.getCurrentTime()
                        const total = p.getDuration()
                        if (total > 0) {
                            setProgress(current / total)
                            setDuration(total)
                        }
                    }
                    // Occasional volume sync check
                    if (state === 1) {
                        p.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                    }
                }
            }, 500)
        }

        return () => clearInterval(interval)
    }, [isYoutube, isPlaying, hasMounted, currentTrack?.url])

    useEffect(() => {
        if (isYoutube && hasMounted) {
            const videoId = extractVideoId(currentTrack?.url || '')
            if (videoId) initYTPlayer(videoId)
        }
    }, [isYoutube, currentTrack?.url, hasMounted, initYTPlayer])

    useEffect(() => {
        if (!ytPlayerRef.current || !isYoutube || !playReady) return
        try {
            const playerState = ytPlayerRef.current.getPlayerState?.()
            if (isPlaying) {
                // Only call play if not already playing/buffering to avoid loops
                if (playerState !== 1 && playerState !== 3) {
                    ytPlayerRef.current.playVideo()
                }
            } else {
                if (playerState === 1 || playerState === 3) {
                    ytPlayerRef.current.pauseVideo()
                }
            }
        } catch (e) {
            console.warn('[YouTube] Sync effect failed:', e)
        }
    }, [isPlaying, isYoutube, playReady, currentTrack?.url])

    useEffect(() => {
        if (!ytPlayerRef.current || !isYoutube) return
        ytPlayerRef.current.setVolume?.(isMuted ? 0 : Math.round(volume * 100))
    }, [volume, isMuted, isYoutube])

    const [captureStatus, setCaptureStatus] = useState<string | null>(null)

    const handleCaptureToLocal = async (type: 'audio' | 'video' = 'audio') => {
        if (!currentTrack || !isYoutube || !activePlaylist) return

        setIsCapturing(true)
        setPlayerError(null)
        setCaptureStatus(`Initializing ${type} Capture...`)

        try {
            const endpoint = type === 'audio' ? '/api/capture-audio' : '/api/capture-video'

            // Step 1: Backend Extraction
            setCaptureStatus(`Extracting from YouTube...`)
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: currentTrack.url,
                    title: currentTrack.title,
                    artist: currentTrack.artist,
                    thumbnail: currentTrack.thumbnail
                })
            })

            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.error || 'Capture failed.')
            }

            const data = await res.json()
            if (data.success && data.track) {
                // Step 2: Database Registration
                setCaptureStatus(`Adding to Library...`)

                // CRITICAL: Save to DB from frontend to preserve RLS session
                await addTrackToPlaylist(activePlaylist.id, data.track)

                setCaptureStatus(`Successfully Saved!`)
                setTimeout(() => setCaptureStatus(null), 3500)
            }
        } catch (err: any) {
            setPlayerError(`Capture Error: ${err.message}`)
            setCaptureStatus(null)
        } finally {
            setIsCapturing(false)
        }
    }

    const spotifyIntervalRef = useRef<any>(null)
    const spotifyTokenRef = useRef(spotifyToken)
    useEffect(() => { spotifyTokenRef.current = spotifyToken }, [spotifyToken])

    const lastSpotifyIdRef = useRef<string | null>(null)
    const lastNextActionTimeRef = useRef<number>(0)

    const initSpotifyPlayer = useCallback((initialToken: string) => {
        if (spotifyPlayerRef.current || !window.Spotify) return

        const player = new window.Spotify.Player({
            name: 'UNIFY Web Player',
            getOAuthToken: (cb: any) => cb(spotifyTokenRef.current || initialToken),
            volume: isMutedRef.current ? 0 : volumeRef.current
        })

        player.addListener('ready', ({ device_id }: any) => {
            console.log('[Spotify] Ready with Device ID', device_id)
            spotifyPlayerRef.current = player
            player._deviceId = device_id
            setPlayReady(true)
        })

        player.addListener('player_state_changed', (state: any) => {
            if (!state) return

            const now = Date.now()
            const timeSinceChange = now - trackChangeTimeRef.current
            const isTransiting = timeSinceChange < 2000

            // CRITICAL: Only process Spotify events if we are actually ON the Spotify platform
            // This prevents "Autoplay" or background Spotify activity from hijacking the UI
            if (currentTrackRef.current?.platform !== 'spotify') {
                if (!state.paused && !isTransiting) {
                    player.pause()
                }
                return
            }

            const currentTrackData = state.track_window?.current_track
            const trackId = currentTrackData?.id

            // 1. Sync Play/Pause State
            const isPaused = state.paused

            if (isPaused) {
                if (!isTransiting && isPlayingRef.current) pauseRef.current()
            } else {
                if (!isPlayingRef.current) resumeRef.current()
            }

            // 2. Sync Duration & Progress
            setDuration(state.duration / 1000)

            // 4. Update track ID ref to detect internal changes
            const trackIdFromSDK = state.track_window?.current_track?.id
            const expectedTrackId = currentTrackRef.current?.url.split('track/')[1]?.split('?')[0]
            const isEndOfTrack = state.position === 0 && isPaused && state.repeat_mode === 0

            if (isEndOfTrack && isPlayingRef.current && !isTransiting) {
                if (trackIdFromSDK === expectedTrackId) {
                    const timeSinceLastNext = now - lastNextActionTimeRef.current
                    if (timeSinceLastNext > 2000) {
                        lastNextActionTimeRef.current = now
                        nextRef.current(true)
                    }
                }
            }

            // 5. Real-time Progress Tracking
            clearInterval(spotifyIntervalRef.current)
            if (!isPaused) {
                spotifyIntervalRef.current = setInterval(() => {
                    player.getCurrentState().then((s: any) => {
                        if (s) setProgress(s.position / s.duration)
                    })
                }, 1000)
            }
        })

        player.addListener('authentication_error', ({ message }: any) => {
            console.error('[Spotify] Authentication Error:', message)
            setPlayerError('Spotify session expired. Please reconnect.')
        })

        player.connect()
    }, [])

    const trackChangeTimeRef = useRef<number>(0)

    useEffect(() => {
        if (!hasMounted) return
        if (spotifyToken) {
            if (!window.Spotify) {
                const script = document.createElement('script')
                script.src = 'https://sdk.scdn.co/spotify-player.js'
                script.async = true
                document.body.appendChild(script)
                window.onSpotifyWebPlaybackSDKReady = () => initSpotifyPlayer(spotifyToken)
            } else {
                initSpotifyPlayer(spotifyToken)
            }
        }
    }, [hasMounted, initSpotifyPlayer])

    // Effect to play track when currentTrack changes to Spotify
    useEffect(() => {
        let retryCount = 0
        const maxRetries = 2
        trackChangeTimeRef.current = Date.now()

        const playSpotifyTrack = async () => {
            if (!isSpotify || !spotifyPlayerRef.current?._deviceId) return
            const trackId = currentTrack?.url.split('track/')[1]?.split('?')[0]
            if (!trackId || !spotifyToken) return

            const attemptPlay = async (): Promise<boolean> => {
                try {
                    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyPlayerRef.current._deviceId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${spotifyToken}`
                        }
                    })

                    if (res.status === 404) {
                        // Device might be "gone" if we swapped rapidly, wait and retry
                        return false
                    }

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}))
                        if (errData.error?.message === 'Player command failed: No active device found') return false
                        throw new Error(errData.error?.message || 'Play failed')
                    }

                    setPlayReady(true)
                    setIsBuffering(false)
                    return true
                } catch (err) {
                    console.error('[Spotify] Play Attempt Failed:', err)
                    return false
                }
            }

            // Small initial delay to let the SDK settle
            await new Promise(r => setTimeout(r, 150))

            while (retryCount <= maxRetries) {
                const success = await attemptPlay()
                if (success) break
                retryCount++
                if (retryCount <= maxRetries) {
                    console.log(`[Spotify] Retrying play (${retryCount}/${maxRetries})...`)
                    await new Promise(r => setTimeout(r, 500 * retryCount))
                }
            }

            if (retryCount > maxRetries) {
                setPlayerError('Spotify failed to start. Try clicking Play again.')
            }
        }

        if (isSpotify && hasMounted) {
            playSpotifyTrack()
        }
    }, [isSpotify, currentTrack?.url, hasMounted])

    // Sync Play/Pause with Spotify
    useEffect(() => {
        if (!spotifyPlayerRef.current || !isSpotify) return
        if (isPlaying) spotifyPlayerRef.current.resume()
        else spotifyPlayerRef.current.pause()
    }, [isPlaying, isSpotify, currentTrack?.url])

    // Sync Volume with Spotify
    useEffect(() => {
        if (!spotifyPlayerRef.current || !isSpotify) return
        spotifyPlayerRef.current.setVolume(isMuted ? 0 : volume)
    }, [volume, isMuted, isSpotify])

    // ─── SoundCloud Logic ───
    useEffect(() => {
        if (!isSoundCloud || !hasMounted) return

        // Reset state for new track
        setPlayReady(false)
        setIsBuffering(true)
        setProgress(0)
        setDuration(0)

        const setup = () => {
            const iframe = document.getElementById('sc-iframe') as HTMLIFrameElement
            if (!iframe || !window.SC) return
            const widget = window.SC.Widget(iframe)
            scWidgetRef.current = widget

            // Unbind to prevent duplicates
            widget.unbind(window.SC.Widget.Events.READY)
            widget.unbind(window.SC.Widget.Events.FINISH)
            widget.unbind(window.SC.Widget.Events.PLAY_PROGRESS)

            widget.bind(window.SC.Widget.Events.READY, () => {
                setPlayReady(true)
                setIsBuffering(false)
                widget.setVolume(isMutedRef.current ? 0 : volumeRef.current * 100)
                if (isPlayingRef.current) {
                    widget.play()
                }
                widget.getDuration((ms: number) => {
                    if (ms) setDuration(ms / 1000)
                })
            })

            widget.bind(window.SC.Widget.Events.FINISH, () => nextRef.current(true))

            widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (data: any) => {
                if (data.relativePosition !== undefined) {
                    setProgress(data.relativePosition)
                    if (data.currentPosition && data.relativePosition > 0) {
                        setDuration(data.currentPosition / data.relativePosition / 1000)
                    }
                }
            })

            widget.bind(window.SC.Widget.Events.ERROR, () => {
                setPlayerError('SoundCloud playback failed. This track might be restricted.')
            })
        }

        if (!window.SC) {
            const scScriptId = 'soundcloud-widget-api'
            if (!document.getElementById(scScriptId)) {
                const script = document.createElement('script')
                script.id = scScriptId
                script.src = 'https://w.soundcloud.com/player/api.js'
                script.onload = setup
                document.body.appendChild(script)
            }
        } else {
            const timer = setTimeout(setup, 300)
            return () => clearTimeout(timer)
        }
    }, [isSoundCloud, hasMounted, currentTrack?.url])

    // SoundCloud Polling Fallback
    useEffect(() => {
        if (!isSoundCloud || !isPlaying || !scWidgetRef.current) return
        const interval = setInterval(() => {
            const w = scWidgetRef.current
            if (w && typeof w.getPosition === 'function') {
                w.getPosition((ms: number) => {
                    w.getDuration((total: number) => {
                        if (ms && total) {
                            setProgress(ms / total)
                            setDuration(total / 1000)
                        }
                    })
                })
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [isSoundCloud, isPlaying, currentTrack?.url])

    // Sync Play/Pause with SoundCloud
    useEffect(() => {
        if (!scWidgetRef.current || !isSoundCloud) return
        try {
            if (isPlaying) {
                if (typeof scWidgetRef.current.play === 'function') scWidgetRef.current.play()
            } else {
                if (typeof scWidgetRef.current.pause === 'function') scWidgetRef.current.pause()
            }
        } catch (e) {
            console.warn('[SoundCloud] Play/Pause sync failed:', e)
        }
    }, [isPlaying, isSoundCloud])

    // Sync Volume with SoundCloud
    useEffect(() => {
        if (!scWidgetRef.current || !isSoundCloud) return
        try {
            if (typeof scWidgetRef.current.setVolume === 'function') {
                scWidgetRef.current.setVolume(isMuted ? 0 : volume * 100)
            }
        } catch (e) {
            console.warn('[SoundCloud] Volume sync failed:', e)
        }
    }, [volume, isMuted, isSoundCloud])

    // ─── Local Music Logic ───
    useEffect(() => {
        if (!localAudioRef.current || !isLocal) return

        const audio = localAudioRef.current
        audio.volume = isMuted ? 0 : volume

        if (isPlaying) {
            audio.play().catch(() => { })
        } else {
            audio.pause()
        }
    }, [isPlaying, isLocal, playReady, currentTrack?.url, volume, isMuted])


    // Overall render guard
    if (!user || !currentTrack) return null

    return (
        <>
            {/* Visual content container (YouTube / SoundCloud / Apple) */}
            <div className={clsx(
                "fixed bottom-[96px] left-6 z-40 transition-all duration-500 ease-out transform flex flex-col items-start gap-3",
                (showVideo && isEmbedPlatform) || (isSpotify && playerError) ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'
            )}>
                {/* External Sync Button */}
                {isYoutube && (showVideo || playerError) && (
                    <button
                        disabled={isCapturing}
                        onClick={() => handleCaptureToLocal('audio')}
                        className="group/sync flex items-center gap-2.5 px-4 py-2 rounded-full bg-surface/80 border border-accent/20 backdrop-blur-md hover:bg-accent/10 hover:border-accent/40 transition-all shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                    >
                        {isCapturing ? (
                            <Loader2 size={12} className="animate-spin text-accent" />
                        ) : (
                            <CloudDownload size={12} className="text-accent group-hover/sync:scale-110 transition-transform" />
                        )}
                        <span className="font-mono-custom text-[9px] uppercase tracking-[2px] font-bold text-accent">
                            {isCapturing ? 'Capturing...' : 'Sync to Audio Library'}
                        </span>
                        {!isCapturing && (
                            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(200,255,0,0.8)]" />
                        )}
                    </button>
                )}

                <div className="relative group">
                    <div className="w-[320px] h-[180px] bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">
                        <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => setShowVideo(false)}
                                className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white/70 hover:text-white transition-colors backdrop-blur-md"
                            >
                                <VolumeX size={10} className="rotate-45" />
                            </button>
                        </div>

                        <div className="flex-1 w-full h-full relative bg-black overflow-hidden">
                            {/* YouTube: Persistent Div (Stable container) */}
                            <div className={clsx("w-full h-full absolute inset-0", !isYoutube && "opacity-0 pointer-events-none")}>
                                <div id="yt-player" className="w-full h-full" />
                            </div>

                            {/* SoundCloud: Conditionally Rendered (Safe for Iframe-only) */}
                            {isSoundCloud && (
                                <iframe
                                    id="sc-iframe"
                                    src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(currentTrack.url)}&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=true`}
                                    className="w-full h-full border-0"
                                    allow="autoplay"
                                />
                            )}

                            {/* Apple: Conditionally Rendered */}
                            {isApple && (
                                <iframe
                                    src={currentTrack.url.replace('music.apple.com', 'embed.music.apple.com')}
                                    className="w-full h-full border-0"
                                    allow="autoplay; encrypted-media; fullscreen"
                                />
                            )}

                            {playerError && (isSpotify || !playerError.includes('Spotify')) && (
                                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 gap-4 p-4 text-center animate-fadeIn">
                                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center mb-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                    </div>
                                    <div className="text-[10px] text-red-500 font-mono-custom uppercase tracking-[2px] leading-relaxed max-w-[240px]">
                                        {playerError}
                                    </div>
                                    <div className="text-[8px] text-white/30 font-mono-custom uppercase tracking-widest mt-1">
                                        Use sync tool above to rescue
                                    </div>
                                </div>
                            )}
                            {captureStatus && (
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] text-accent font-mono-custom text-[10px] uppercase tracking-[4px] drop-shadow-[0_0_10px_rgba(200,255,0,0.6)] animate-pulse">
                                    {captureStatus}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Local audio element */}
            {isLocal && (
                <audio
                    ref={localAudioRef}
                    src={currentTrack.url}
                    preload="auto"
                    onEnded={() => nextRef.current(true)}
                    onTimeUpdate={(e) => {
                        const a = e.currentTarget
                        if (a.duration) { setProgress(a.currentTime / a.duration); setDuration(a.duration) }
                    }}
                    onCanPlay={(e) => {
                        setIsBuffering(false)
                        setPlayReady(true)
                        if (isPlayingRef.current) {
                            e.currentTarget.play().catch(() => { })
                        }
                    }}
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => setIsBuffering(false)}
                    onError={() => setPlayerError('Failed to load local audio file.')}
                />
            )}

            {/* Player bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-xl border-t border-border p-4 z-50 animate-slideUp">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
                    {/* Track Info */}
                    <div className="flex items-center gap-4 w-1/4 min-w-0">
                        <div className="w-14 h-14 rounded-lg bg-surface2 border border-border overflow-hidden relative flex-shrink-0 group">
                            {currentTrack.thumbnail ? (
                                <Image src={currentTrack.thumbnail} alt={currentTrack.title} fill className="object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted"><Music2 size={24} /></div>
                            )}
                            {isEmbedPlatform && (
                                <button
                                    onClick={() => setShowVideo(!showVideo)}
                                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]"
                                    title={showVideo ? "Minimize Mini-Player" : "Restore Mini-Player"}
                                >
                                    <Maximize2 size={18} className="text-white" />
                                </button>
                            )}
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-bold text-sm truncate text-text">{currentTrack.title}</h4>
                            <p className="text-xs text-muted truncate mt-0.5">{currentTrack.artist}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="px-1.5 py-0.5 rounded-md bg-surface2 text-[9px] font-black uppercase tracking-wider text-muted border border-border">
                                    {platformDisplayName(currentTrack.platform)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col items-center gap-2 flex-1 max-w-2xl">
                        <div className="flex items-center gap-6">
                            <button onClick={toggleShuffle} className={`transition-colors ${isShuffle ? 'text-accent' : 'text-muted hover:text-text'}`} title="Shuffle">
                                <Shuffle size={18} />
                            </button>
                            <button onClick={prev} className="text-muted hover:text-text transition-colors"><SkipBack size={22} fill="currentColor" /></button>
                            <button
                                onClick={isPlaying ? pause : resume}
                                disabled={!playReady}
                                className="w-10 h-10 rounded-full bg-text text-bg flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-text/10"
                            >
                                {isBuffering ? <Loader2 size={22} className="animate-spin" /> : isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-1" />}
                            </button>
                            <button onClick={() => next()} className="text-muted hover:text-text transition-colors"><SkipForward size={22} fill="currentColor" /></button>
                            <button onClick={toggleRepeat} className={`transition-colors ${repeatMode !== 'off' ? 'text-accent' : 'text-muted hover:text-text'}`} title="Repeat">
                                {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                            </button>
                        </div>

                        <div className="w-full flex items-center gap-3">
                            <span className="text-[10px] tabular-nums text-muted w-10 text-right">{formatTime(progress * duration)}</span>
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer group"
                                value={[progress]} max={1} step={0.001}
                                onValueChange={(val) => {
                                    const newProgress = val[0]
                                    setProgress(newProgress)
                                    if (isYoutube && ytPlayerRef.current) ytPlayerRef.current.seekTo(newProgress * duration, true)
                                    if (isSoundCloud && scWidgetRef.current) scWidgetRef.current.seekTo(newProgress * duration * 1000)
                                    if (isSpotify && spotifyPlayerRef.current) spotifyPlayerRef.current.seek(newProgress * duration * 1000)
                                    if (isLocal && localAudioRef.current) localAudioRef.current.currentTime = newProgress * duration
                                }}
                            >
                                <Slider.Track className="bg-surface2 relative grow rounded-full h-1 group-hover:h-1.5 transition-all">
                                    <Slider.Range className="absolute bg-text rounded-full h-full" />
                                </Slider.Track>
                                <Slider.Thumb className="block w-3 h-3 bg-white rounded-full hover:scale-110 focus:outline-none shadow-md opacity-0 group-hover:opacity-100 transition-all" />
                            </Slider.Root>
                            <span className="text-[10px] tabular-nums text-muted w-10">{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Volume */}
                    <div className="w-1/4 flex justify-end items-center gap-3">
                        <button onClick={toggleMute} className="text-muted hover:text-text transition-colors">
                            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>
                        <Slider.Root
                            className="relative flex items-center select-none touch-none w-24 h-4 cursor-pointer group"
                            value={[isMuted ? 0 : volume]} max={1} step={0.01}
                            onValueChange={(val) => setVolume(val[0])}
                        >
                            <Slider.Track className="bg-surface2 relative grow rounded-full h-1">
                                <Slider.Range className="absolute bg-text rounded-full h-full" />
                            </Slider.Track>
                            <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full hover:scale-110 focus:outline-none shadow-sm opacity-0 group-hover:opacity-100 transition-all" />
                        </Slider.Root>
                    </div>
                </div>
            </div>
        </>
    )
}
