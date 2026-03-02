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

    // Helper to detect if two platforms use the same engine (YT vs YTMusic)
    const isSameEngine = (p1: string | null, p2: string | null) => {
        if (!p1 || !p2) return p1 === p2
        if ((p1 === 'youtube' || p1 === 'ytmusic') && (p2 === 'youtube' || p2 === 'ytmusic')) return true
        return p1 === p2
    }

    const isEmbedPlatform = isYoutube || isSoundCloud || isApple

    const [progress, setProgress] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isBuffering, setIsBuffering] = useState(false)
    const [playerError, setPlayerError] = useState<string | null>(null)
    const [playReady, setPlayReady] = useState(false)
    const [showVideo, setShowVideo] = useState(true)
    const [hasMounted, setHasMounted] = useState(false)
    const [isSeeking, setIsSeeking] = useState(false)

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

    // ─── Background Audio Heartbeat (AudioContext) ───
    // Maintains "Audible" status for the tab to prevent aggressive CPU/Timer throttling
    useEffect(() => {
        if (!hasMounted) return

        let ctx: AudioContext | null = null
        let osc: OscillatorNode | null = null

        const startHeartbeat = async () => {
            // Keep heartbeat running even during brief "pause" transitions
            if (!isPlaying && !currentTrackRef.current) return

            try {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
                ctx = new AudioContextClass()
                osc = ctx.createOscillator()
                const gain = ctx.createGain()

                osc.type = 'sine'
                osc.frequency.setValueAtTime(1, ctx.currentTime)
                gain.gain.setValueAtTime(0.001, ctx.currentTime)

                osc.connect(gain)
                gain.connect(ctx.destination)

                if (ctx.state === 'suspended') await ctx.resume()
                osc.start()
            } catch (e) { }
        }

        startHeartbeat()

        return () => {
            if (osc) { try { osc.stop() } catch (e) { } }
            if (ctx) { try { ctx.close() } catch (e) { } }
        }
    }, [isPlaying, hasMounted, currentTrack?.id])

    // ─── Background Watchdog Worker ───
    // This worker runs independently of main-thread throttling to trigger recovery logic
    const workerRef = useRef<Worker | null>(null)
    useEffect(() => {
        if (!hasMounted) return

        const workerCode = `
            let interval = null;
            self.onmessage = (e) => {
                if (e.data === 'start') {
                    if (interval) clearInterval(interval);
                    interval = setInterval(() => self.postMessage('tick'), 1000);
                } else if (e.data === 'stop') {
                    if (interval) clearInterval(interval);
                    interval = null;
                }
            };
        `
        const blob = new Blob([workerCode], { type: 'application/javascript' })
        const worker = new Worker(URL.createObjectURL(blob))

        worker.onmessage = () => {
            if (!isPlayingRef.current) return

            // 1. YouTube Watchdog
            if (ytPlayerRef.current && isYoutube) {
                const state = ytPlayerRef.current.getPlayerState?.()
                if (state !== 1 && state !== 3) { // Not Playing or Buffering
                    const timeSinceChange = Date.now() - trackChangeTimeRef.current
                    if (timeSinceChange > 1500 && timeSinceChange < 15000) {
                        console.log('[YouTube] Worker-triggered Background Recovery...')
                        ytPlayerRef.current.playVideo?.()
                    }
                }
            }

            // 2. SoundCloud Watchdog
            if (scWidgetRef.current && isSoundCloud) {
                scWidgetRef.current.isPaused((paused: boolean) => {
                    const timeSinceChange = Date.now() - trackChangeTimeRef.current
                    if (paused && timeSinceChange > 2000) {
                        scWidgetRef.current.play()
                    }
                })
            }
        }

        workerRef.current = worker
        return () => {
            worker.terminate()
            workerRef.current = null
        }
    }, [hasMounted, isYoutube, isSoundCloud])

    useEffect(() => {
        if (isPlaying && (isYoutube || isSoundCloud || isSpotify)) {
            workerRef.current?.postMessage('start')
        } else {
            workerRef.current?.postMessage('stop')
        }
    }, [isPlaying, isYoutube, isSoundCloud, isSpotify])

    // Cleanup on logout
    useEffect(() => {
        if (!user && isPlaying) {
            pause()
        }
    }, [user, isPlaying, pause])

    // ─── Global Stops & Resets ───
    const stopAllPlayers = useCallback((exclude?: string) => {
        console.log('[GlobalPlayer] Stop all players triggered, exclude:', exclude)

        // 1. YouTube
        if (exclude !== 'youtube' && exclude !== 'ytmusic') {
            try {
                if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo()
            } catch (e) { }
        }

        // 2. SoundCloud
        if (exclude !== 'soundcloud') {
            try {
                if (scWidgetRef.current?.pause) scWidgetRef.current.pause()
            } catch (e) { }
        }

        // 3. Spotify
        if (exclude !== 'spotify') {
            try {
                if (spotifyPlayerRef.current?.pause) spotifyPlayerRef.current.pause()
            } catch (e) { }
        }

        // 4. Local
        if (exclude !== 'local') {
            if (localAudioRef.current) {
                localAudioRef.current.pause()
                localAudioRef.current.currentTime = 0
                localAudioRef.current.load() // Force immediate drop of old stream
            }
        }
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
        const isPlatformChanging = !isSameEngine(prevPlatformRef.current, currentPlatform)

        // For same-engine local or Spotify skips, we NEED a full stop/pause to avoid audio leaks.
        if (!isPlatformChanging && (currentPlatform === 'local' || currentPlatform === 'spotify')) {
            stopAllPlayers()
        } else if (isPlatformChanging) {
            console.log('[GlobalPlayer] Platform Handoff: Overlapping session...')
            setTimeout(() => {
                if (currentTrackRef.current?.id === currentTrack.id) {
                    stopAllPlayers(currentPlatform)
                }
            }, 1500)
        } else {
            // Same engine (e.g. YT -> YT), only stop other engines
            stopAllPlayers(currentPlatform)
        }

        prevPlatformRef.current = currentPlatform

        setProgress(0)
        setDuration(0)
        setPlayerError(null)

        // Reset ready state so loader shows up
        // Treatment of youtube/ytmusic as same engine prevents flash of "Ready=false"
        const isEngineReuse = isYoutube && !isPlatformChanging && ytPlayerRef.current
        if (!isEngineReuse && (isPlatformChanging || isYoutube || isSpotify || isSoundCloud || isLocal)) {
            setPlayReady(false)
            setIsBuffering(true)
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
            typeof ytPlayerRef.current.getPlayerState === 'function' &&
            typeof ytPlayerRef.current.playVideo === 'function' &&
            typeof ytPlayerRef.current.setVolume === 'function'

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
                if (isPlayingRef.current) {
                    const p = ytPlayerRef.current
                    if (p.playVideo) p.playVideo()

                    // Background safety: Immediate and repeated play attempts
                    let attempts = 0
                    const forcePlay = () => {
                        const state = p.getPlayerState?.()
                        if (state !== 1 && attempts < 10 && isPlayingRef.current) {
                            console.log('[YouTube] Background Reuse Play Attempt:', attempts + 1)
                            p.playVideo?.()
                            attempts++
                            setTimeout(forcePlay, 500)
                        }
                    }
                    setTimeout(forcePlay, 50)
                }

                // Sync volume
                ytPlayerRef.current.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))

                // Track the change time to help interval ignore stale duration/time
                trackChangeTimeRef.current = Date.now()
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
                playsinline: 1, // Mandatory for mobile background/inline play
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
                    // Signal track change time for onReady too
                    trackChangeTimeRef.current = Date.now()
                },
                onStateChange: (e: any) => {
                    const state = e.data
                    console.log('[YouTube] State Change:', state)

                    if (state === 0) { // ENDED
                        console.log('[YouTube] Video Finished, calling next')
                        nextRef.current(true)
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
                        // CRITICAL FOR BACKGROUND PLAY: 
                        // If we hit a paused state but our intent is STILL to play (isPlayingRef.current is true),
                        // we DO NOT call pauseRef.current(). Calling it would sync the 'Paused' state 
                        // globally and break our watchdog recovery. 
                        // Instead, we let the watchdog (in Global Progress Sync) try to resume it.
                        console.log('[YouTube] State 2 (Paused) detected. isPlaying intent:', isPlayingRef.current)

                        // We only sync back to global pause if the user is actually on the page 
                        // and we want to allow external control (like media keys).
                        // However, for mobile/backgrounding, it's safer to trust our internal state.
                        if (!isPlayingRef.current) {
                            pauseRef.current()
                        }
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
                            if (currentTrackRef.current && (currentTrackRef.current.platform === 'youtube' || currentTrackRef.current.platform === 'ytmusic')) {
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
        if (!hasMounted) return
        // If not playing and we already have a duration, we don't need to sync
        if (!isPlaying && duration > 0) return

        let interval: any
        if (isYoutube && ytPlayerRef.current) {
            interval = setInterval(() => {
                const p = ytPlayerRef.current
                if (p && typeof p.getCurrentTime === 'function' && typeof p.getDuration === 'function') {
                    // --- STALE DATA PROTECTION ---
                    const timeSinceChange = Date.now() - trackChangeTimeRef.current
                    const state = p.getPlayerState?.()

                    // Don't sync if we just changed tracks (< 2s) unless actually playing
                    if (timeSinceChange < 2000 && state !== 1) return

                    const current = p.getCurrentTime()
                    const total = p.getDuration()

                    if (total > 0) {
                        setDuration(Math.floor(total))
                        // Only update progress if playing AND NOT currently seeking/dragging
                        if (state === 1 && !isSeeking) {
                            setProgress(current / total)
                        }

                        // --- AUTO-PLAY RECOVERY ---
                        // If we should be playing but we are stuck in unstarted (-1), cued (5), or paused (2)
                        // This handles first-play blocks and transient stalls.
                        if (isPlayingRef.current && (state === -1 || state === 5 || state === 2)) {
                            const timeSinceChange = Date.now() - trackChangeTimeRef.current
                            // Give it at least 1s to load before forcing
                            if (timeSinceChange > 1000) {
                                console.log('[YouTube] Recovery: Forcing play state...')
                                p.playVideo?.()
                            }
                        }

                        // --- BACKGROUND WATCHDOG ---
                        // If we are near the end (99.5% or within 1s) and it seems "stuck" or ended without event
                        const isFinished = (total - current) < 1.0 || (current / total) > 0.998
                        if (isFinished && isPlayingRef.current && state !== 0 && state !== 3) {
                            // Only trigger if we haven't already just changed tracks
                            const timeSinceChange = Date.now() - trackChangeTimeRef.current
                            if (timeSinceChange > 5000) {
                                console.log('[YouTube] Watchdog: Transitioning background track...')
                                nextRef.current(true)
                            }
                        }
                    }

                    // Occasional volume sync check
                    if (state === 1 && typeof p.setVolume === 'function') {
                        p.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                    }
                }
            }, 500)
        }

        return () => clearInterval(interval)
    }, [isYoutube, isPlaying, hasMounted, currentTrack?.url, playReady])

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
            console.log('[YouTube] Sync State:', playerState, 'isPlaying:', isPlaying)

            if (isPlaying) {
                // If the player is cued, unstarted, or paused, force play
                if (playerState !== 1 && playerState !== 3) {
                    if (typeof ytPlayerRef.current.playVideo === 'function') {
                        ytPlayerRef.current.playVideo()
                        // Secondary attempt after a short delay for background tabs
                        setTimeout(() => {
                            if (isPlayingRef.current && ytPlayerRef.current?.getPlayerState?.() !== 1) {
                                ytPlayerRef.current?.playVideo?.()
                            }
                        }, 1000)
                    }
                }
            } else {
                if (playerState === 1 || playerState === 3) {
                    if (typeof ytPlayerRef.current.pauseVideo === 'function') {
                        ytPlayerRef.current.pauseVideo()
                    }
                }
            }
        } catch (e) {
            console.warn('[YouTube] Sync effect failed:', e)
        }
    }, [isPlaying, isYoutube, playReady, currentTrack?.url])

    useEffect(() => {
        if (!ytPlayerRef.current || !isYoutube) return
        if (typeof ytPlayerRef.current.setVolume === 'function') {
            ytPlayerRef.current.setVolume(isMuted ? 0 : Math.round(volume * 100))
        }
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
            const expectedTrackId = currentTrackRef.current?.url.split('track/')[1]?.split('?')[0]

            // SAFEGUARD: If we are in the middle of a track change and the SDK is reporting 
            // state for a track ID that doesn't match our expected one, ignore it and force pause.
            if (isTransiting && trackId && expectedTrackId && trackId !== expectedTrackId) {
                console.log('[Spotify] Ignoring state for stale track:', trackId)
                if (!state.paused) player.pause()
                return
            }

            // 1. Sync Play/Pause State
            const isPaused = state.paused

            if (isPaused) {
                // Background safety: If Spotify pauses but our intent is still to play,
                // DO NOT sync the global state to paused. This prevents race conditions
                // where the end-of-track pause kills the auto-switch logic.
                if (!isPlayingRef.current && !isTransiting) pauseRef.current()
            } else {
                if (!isPlayingRef.current) resumeRef.current()
            }

            // 2. Sync Duration & Progress
            setDuration(state.duration / 1000)

            // 4. Update track ID ref to detect internal changes
            const trackIdFromSDK = state.track_window?.current_track?.id
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
                console.log('[SoundCloud] Player Ready')
                setPlayReady(true)
                setIsBuffering(false)
                widget.setVolume(isMutedRef.current ? 0 : volumeRef.current * 100)
                if (isPlayingRef.current) {
                    widget.play()
                    // Background tab safety: secondary attempt if first was blocked
                    setTimeout(() => {
                        if (isPlayingRef.current) {
                            console.log('[SoundCloud] Secondary background play attempt...')
                            widget.play()
                        }
                    }, 1000)
                }
                widget.getDuration((ms: number) => {
                    if (ms) setDuration(ms / 1000)
                })
            })

            widget.bind(window.SC.Widget.Events.PLAY, () => {
                setIsBuffering(false)
                setPlayerError(null)
            })

            widget.bind(window.SC.Widget.Events.PAUSE, () => {
                // Background check: if we should be playing but hit a pause, it might be a transient block
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

    // SoundCloud Polling & Background Watchdog
    useEffect(() => {
        if (!isSoundCloud || !scWidgetRef.current) return
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

                // --- AUTO-PLAY RECOVERY ---
                // If we should be playing but the widget is paused, force it.
                // This handles background tab throttles or transient autoplay blocks.
                if (isPlayingRef.current && typeof w.isPaused === 'function') {
                    w.isPaused((paused: boolean) => {
                        const timeSinceChange = Date.now() - trackChangeTimeRef.current
                        if (paused && timeSinceChange > 2000) {
                            console.log('[SoundCloud] Recovery: Forcing play state in background...')
                            w.play()
                            setPlayReady(true)
                            setIsBuffering(false)
                        }
                    })
                }
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
    // 1. URL Change: Force a hard reload of the audio engine
    useEffect(() => {
        if (!localAudioRef.current || !isLocal || !currentTrack?.url) return
        const audio = localAudioRef.current

        console.log('[LocalPlayer] Loading new local source:', currentTrack.url)
        audio.load() // Force the browser to drop the old stream

        if (isPlaying) {
            audio.play().catch(err => {
                if (err.name !== 'AbortError') console.warn('[LocalPlayer] URL change play failed:', err)
            })
        }
    }, [currentTrack?.url, isLocal])

    // 2. Play/Pause/Volume Sync
    useEffect(() => {
        if (!localAudioRef.current || !isLocal) return
        const audio = localAudioRef.current
        audio.volume = isMuted ? 0 : volume

        if (isPlaying) {
            if (audio.paused) {
                audio.play().catch(err => {
                    if (err.name !== 'AbortError') console.warn('[LocalPlayer] Sync play failed:', err)
                })
            }
        } else {
            if (!audio.paused) audio.pause()
        }
    }, [isPlaying, isLocal, volume, isMuted])


    // ─── MediaSession API (Background Controls & Metadata) ───
    useEffect(() => {
        if (!hasMounted || !('mediaSession' in navigator)) return

        if (currentTrack) {
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title: currentTrack.title || 'Unknown Title',
                artist: currentTrack.artist || 'Unknown Artist',
                album: 'Unify Library',
                artwork: currentTrack.thumbnail ? [{ src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }] : []
            })
        }

        navigator.mediaSession.setActionHandler('play', () => resume())
        navigator.mediaSession.setActionHandler('pause', () => pause())
        navigator.mediaSession.setActionHandler('previoustrack', () => prev())
        navigator.mediaSession.setActionHandler('nexttrack', () => next())

        return () => {
            navigator.mediaSession.setActionHandler('play', null)
            navigator.mediaSession.setActionHandler('pause', null)
            navigator.mediaSession.setActionHandler('previoustrack', null)
            navigator.mediaSession.setActionHandler('nexttrack', null)
        }
    }, [currentTrack, hasMounted, resume, pause, next, prev])

    useEffect(() => {
        if (!('mediaSession' in navigator)) return
        // Always set playbackState to 'playing' if our intent is playing, even during transitions
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    }, [isPlaying, currentTrack])

    // Overall render guard: Keep mounted as long as user is logged in
    // This prevents destroying the YouTube iframe during 100ms transitions
    if (!user) return null

    const hasTrack = !!currentTrack

    return (
        <>
            {/* Visual content container (YouTube / SoundCloud / Apple) */}
            <div
                style={{
                    opacity: 1,
                    width: hasTrack && showVideo && isEmbedPlatform ? '340px' : '4px',
                    height: hasTrack && showVideo && isEmbedPlatform ? '240px' : '4px',
                    left: hasTrack && showVideo && isEmbedPlatform ? '24px' : '-10px',
                    overflow: 'hidden',
                    visibility: hasTrack ? 'visible' : 'hidden'
                }}
                className={clsx(
                    "fixed bottom-[110px] z-[60] transition-all duration-300 ease-out flex flex-col items-start gap-3",
                    hasTrack && showVideo && isEmbedPlatform ? 'translate-y-0' : 'pointer-events-none'
                )}>
                {/* External Sync Button */}
                {hasTrack && isYoutube && (showVideo || playerError) && (
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

            {/* Local audio element - Persistent source management */}
            {isLocal && currentTrack && (
                <audio
                    ref={localAudioRef}
                    src={currentTrack.url}
                    preload="auto"
                    autoPlay={isPlaying} // Native Handoff
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
                    onError={(e) => {
                        console.error('[LocalPlayer] Audio Error:', e)
                        setPlayerError('Failed to load local audio file.')
                    }}
                />
            )}

            {/* Player bar */}
            <div className={clsx(
                "fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-xl border-t border-border p-4 z-50 transition-transform duration-500",
                hasTrack ? "translate-y-0" : "translate-y-full"
            )}>
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
                    {/* Track Info */}
                    <div className="flex items-center gap-4 w-1/4 min-w-0">
                        <div className="w-14 h-14 rounded-lg bg-surface2 border border-border overflow-hidden relative flex-shrink-0 group">
                            {currentTrack?.thumbnail ? (
                                <Image src={currentTrack.thumbnail} alt={currentTrack.title || 'Track'} fill className="object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted"><Music2 size={24} /></div>
                            )}
                            {hasTrack && isEmbedPlatform && (
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
                            <h4 className="font-bold text-sm truncate text-text">{currentTrack?.title || 'No track selected'}</h4>
                            <p className="text-xs text-muted truncate mt-0.5">{currentTrack?.artist || 'Unknown Artist'}</p>
                            {hasTrack && (
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className="px-1.5 py-0.5 rounded-md bg-surface2 text-[9px] font-black uppercase tracking-wider text-muted border border-border">
                                        {platformDisplayName(currentTrack.platform)}
                                    </span>
                                </div>
                            )}
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
                            <button
                                onClick={() => {
                                    console.log('[GlobalPlayer] Manual Next Clicked')
                                    next()
                                }}
                                className="text-muted hover:text-text transition-colors"
                            >
                                <SkipForward size={22} fill="currentColor" />
                            </button>
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
                                    setIsSeeking(true)
                                    const newProgress = val[0]
                                    setProgress(newProgress)
                                    if (isYoutube && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
                                        ytPlayerRef.current.seekTo(newProgress * duration, true)
                                    }
                                    if (isSoundCloud && scWidgetRef.current) scWidgetRef.current.seekTo(newProgress * duration * 1000)
                                    if (isSpotify && spotifyPlayerRef.current) spotifyPlayerRef.current.seek(newProgress * duration * 1000)
                                    if (isLocal && localAudioRef.current) localAudioRef.current.currentTime = newProgress * duration
                                }}
                                onValueCommit={() => {
                                    // Small delay before resuming sync to allow player to update its internal clock
                                    setTimeout(() => setIsSeeking(false), 200)
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
