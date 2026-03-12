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

    const isEmbedPlatform = isYoutube // Only YouTube needs the mini-player container now

    const [progress, setProgress] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isBuffering, setIsBuffering] = useState(false)
    const [playerError, setPlayerError] = useState<string | null>(null)
    const [playReady, setPlayReady] = useState(false)
    const [showVideo, setShowVideo] = useState(true)
    const [hasMounted, setHasMounted] = useState(false)
    const [isSeeking, setIsSeeking] = useState(false)
    const [scStreamUrl, setScStreamUrl] = useState<string | null>(null)

    const localAudioRef = useRef<HTMLAudioElement>(null)
    const scResumePositionRef = useRef<number>(0)   // saved position before URL re-fetch
    const scIsRefetchingRef = useRef(false)          // prevents infinite re-fetch loop
    const ytPlayerRef = useRef<any>(null)
    const ytIntervalRef = useRef<any>(null)
    const spotifyPlayerRef = useRef<any>(null)
    const ytContainerRef = useRef<HTMLDivElement>(null)
    const spotifyIntervalRef = useRef<any>(null)

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
    const isSeekingRef = useRef(false)
    const trackChangeTimeRef = useRef<number>(0)
    const lastSpotifyIdRef = useRef<string | null>(null)
    const lastNextActionTimeRef = useRef<number>(0)
    const spotifyTokenRef = useRef(spotifyToken)

    useEffect(() => { setHasMounted(true) }, [])
    useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
    useEffect(() => { volumeRef.current = volume }, [volume])
    useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
    useEffect(() => { nextRef.current = next }, [next])
    useEffect(() => { resumeRef.current = resume }, [resume])
    useEffect(() => { pauseRef.current = pause }, [pause])
    useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])
    useEffect(() => { isSeekingRef.current = isSeeking }, [isSeeking])

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

                if (isPlayingRef.current) {
                    const p = ytPlayerRef.current
                    if (p.playVideo) p.playVideo()

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

                ytPlayerRef.current.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                trackChangeTimeRef.current = Date.now()
                return
            } catch (e) {
                console.warn('[YouTube] Reuse failed, recreating player:', e)
                ytPlayerRef.current = null
            }
        }

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
                origin: window.location.origin
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
                    trackChangeTimeRef.current = Date.now()
                },
                onStateChange: (e: any) => {
                    const state = e.data
                    if (state === 0) {
                        console.log('[YouTube] Video Finished, calling next')
                        nextRef.current(true)
                    } else if (state === 1) {
                        setIsBuffering(false)
                        setPlayerError(null)
                        if (!isPlayingRef.current) resumeRef.current()
                    } else if (state === 2) {
                        if (!isPlayingRef.current) pauseRef.current()
                    } else if (state === 3) {
                        setIsBuffering(true)
                    } else if (state === 5 || state === -1) {
                        if (isPlayingRef.current && typeof e.target.playVideo === 'function') {
                            e.target.playVideo()
                        }
                    }
                },
                onError: (e: any) => {
                    const msg = getYouTubeErrorMessage(e.data)
                    setPlayerError(msg)
                    setIsBuffering(false)
                    if (e.data === 150 || e.data === 101 || e.data === 100) {
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

    // ─── Background Audio Heartbeat (AudioContext) ───
    // Maintains "Audible" status for the tab to prevent aggressive CPU/Timer throttling
    const heartbeatRef = useRef<{ ctx: AudioContext, osc: OscillatorNode } | null>(null)

    useEffect(() => {
        if (!hasMounted) return

        const startHeartbeat = async () => {
            if (heartbeatRef.current) return
            try {
                const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
                const ctx = new AudioContextClass()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()

                osc.type = 'sine'
                osc.frequency.setValueAtTime(1, ctx.currentTime)
                gain.gain.setValueAtTime(0.0001, ctx.currentTime) 
                osc.connect(gain)
                gain.connect(ctx.destination)
                if (ctx.state === 'suspended') await ctx.resume()
                osc.start()
                heartbeatRef.current = { ctx, osc }
                console.log('[Heartbeat] Persistent Background Protection Active')
            } catch (e) { }
        }

        startHeartbeat()

        return () => {
            if (heartbeatRef.current) {
                const { ctx, osc } = heartbeatRef.current
                try { osc.stop() } catch (e) { }
                try { ctx.close() } catch (e) { }
                heartbeatRef.current = null
            }
        }
    }, [hasMounted])

    // Poke heartbeat on track change
    useEffect(() => {
        if (heartbeatRef.current?.ctx.state === 'suspended') {
            heartbeatRef.current.ctx.resume().catch(() => { })
        }
    }, [currentTrack?.id])

    // ─── Page Visibility Recovery ───
    // When the tab comes back into view after being minimized/hidden, immediately
    // run a catch-up check. This handles cases where onended fired while the tab
    // was throttled and the event was silently dropped by the browser.
    useEffect(() => {
        if (!hasMounted) return

        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return
            if (!isPlayingRef.current || !currentTrackRef.current) return

            const platform = currentTrackRef.current.platform
            const isYT = platform === 'youtube' || platform === 'ytmusic'
            const isLC = platform === 'local'
            const isSC = platform === 'soundcloud'
            const isSP = platform === 'spotify'

            console.log('[Visibility] Tab became visible. Running recovery check...')

            // YouTube: check if video ended but state event was missed
            if (isYT && ytPlayerRef.current) {
                try {
                    const state = ytPlayerRef.current.getPlayerState?.()
                    if (state === 0) {
                        // YT.PlayerState.ENDED
                        console.log('[Visibility] YouTube ended while hidden. Advancing...')
                        nextRef.current(true)
                    } else if (state !== 1 && state !== 3) {
                        // Not playing or buffering - try to recover
                        ytPlayerRef.current.playVideo?.()
                    }
                } catch (e) { }
            }

            // Local / SoundCloud: check if audio ended while hidden
            if ((isLC || isSC) && localAudioRef.current) {
                const audio = localAudioRef.current
                const isAtEnd = audio.duration > 0 && (audio.duration - audio.currentTime) < 1.5
                if (isAtEnd && audio.paused) {
                    console.log('[Visibility] Native audio ended while hidden. Advancing...')
                    nextRef.current(true)
                } else if (audio.paused && !isAtEnd) {
                    audio.play().catch(() => { })
                }
            }

            // Spotify: check if track ended while hidden
            if (isSP && spotifyPlayerRef.current) {
                spotifyPlayerRef.current.getCurrentState().then((s: any) => {
                    if (s && s.paused && s.position === 0 && s.repeat_mode === 0) {
                        console.log('[Visibility] Spotify ended while hidden. Advancing...')
                        nextRef.current(true)
                    }
                }).catch(() => { })
            }

            // Poke AudioContext heartbeat back awake
            if (heartbeatRef.current?.ctx.state === 'suspended') {
                heartbeatRef.current.ctx.resume().catch(() => { })
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [hasMounted])

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
            if (!isPlayingRef.current || !currentTrackRef.current) return

            const platform = currentTrackRef.current.platform
            const isYT = platform === 'youtube' || platform === 'ytmusic'
            const isSC = platform === 'soundcloud'
            const isLC = platform === 'local'
            const isSP = platform === 'spotify'

            // 1. YouTube Watchdog
            if (isYT) {
                if (ytPlayerRef.current && typeof ytPlayerRef.current.getPlayerState === 'function') {
                    const state = ytPlayerRef.current.getPlayerState()
                    if (state !== 1 && state !== 3) { // Not Playing or Buffering
                        const timeSinceChange = Date.now() - trackChangeTimeRef.current
                        if (timeSinceChange > 1500 && timeSinceChange < 15000) {
                            console.log('[YouTube] Worker-triggered Background Recovery...')
                            ytPlayerRef.current.playVideo?.()
                        }
                    }
                } else if (!ytPlayerRef.current) {
                    const timeSinceChange = Date.now() - trackChangeTimeRef.current
                    if (timeSinceChange > 3000 && timeSinceChange < 15000) {
                        const videoId = extractVideoId(currentTrackRef.current.url)
                        if (videoId) {
                            console.log('[YouTube] Worker-triggered Background Initialization...')
                            initYTPlayer(videoId)
                        }
                    }
                }
            }

            // 2. Native Audio Watchdog
            if ((isLC || isSC) && localAudioRef.current) {
                const audio = localAudioRef.current
                if (audio.paused && isPlayingRef.current) {
                    const timeSinceChange = Date.now() - trackChangeTimeRef.current
                    const isAtEnd = audio.duration > 0 && (audio.duration - audio.currentTime) < 1.5

                    if (isAtEnd && timeSinceChange > 2000) {
                        // Track finished but onended was swallowed — force advance
                        console.log('[NativeAudio] Watchdog: Track ended without onended event. Advancing...')
                        nextRef.current(true)
                    } else if (!isAtEnd && timeSinceChange > 2000) {
                        // Stalled mid-track — try to resume playback
                        console.log('[NativeAudio] Watchdog: Attempting background recovery...')
                        audio.play().catch(() => { })
                    }
                }
            }

            // 3. Spotify Watchdog
            if (isSP && spotifyPlayerRef.current) {
                spotifyPlayerRef.current.getCurrentState().then((s: any) => {
                    if (s) {
                        const isFinished = s.paused && s.position === 0 && s.repeat_mode === 0
                        const isStalled = s.paused && !isFinished && Date.now() - trackChangeTimeRef.current > 3000

                        if (isFinished) {
                            console.log('[Spotify] Worker-detected track finish. Advancing...')
                            nextRef.current(true)
                        } else if (isStalled) {
                            console.log('[Spotify] Worker-detected stall. Resuming...')
                            spotifyPlayerRef.current?.resume()
                        }
                    }
                })
            }
        }

        workerRef.current = worker
        return () => {
            worker.terminate()
            workerRef.current = null
        }
    }, [hasMounted])

    useEffect(() => {
        if (isPlaying && (isYoutube || isSoundCloud || isSpotify || isLocal)) {
            workerRef.current?.postMessage('start')
        } else {
            workerRef.current?.postMessage('stop')
        }
    }, [isPlaying, isYoutube, isSoundCloud, isSpotify, isLocal])

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

        // 2. SoundCloud (Unified with Native Audio)

        // 3. Spotify
        if (exclude !== 'spotify') {
            try {
                if (spotifyPlayerRef.current?.pause) spotifyPlayerRef.current.pause()
            } catch (e) { }
        }

        // 4. Local & SoundCloud (Native Engine)
        if (exclude !== 'local' && exclude !== 'soundcloud') {
            if (localAudioRef.current) {
                localAudioRef.current.pause()
                localAudioRef.current.currentTime = 0
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

        // ALWAYS stop existing players when a new track starts.
        // This prevents audio "leaks" or overlapping sessions during transitions.
        if (isPlatformChanging) {
            console.log('[GlobalPlayer] Platform Handoff: Cleaning up previous engine...')
            // Give the new engine a head start, then kill the old ones
            setTimeout(() => {
                if (currentTrackRef.current?.id === currentTrack.id) {
                    stopAllPlayers(currentPlatform)
                }
            }, 1000)
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

        // CRITICAL: Update track change time on every change
        trackChangeTimeRef.current = Date.now()
    }, [currentTrack, isEmbedPlatform, isLocal, isSpotify, isSoundCloud, stopAllPlayers])

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
                        if (state === 1 && !isSeekingRef.current) {
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

    useEffect(() => { spotifyTokenRef.current = spotifyToken }, [spotifyToken])


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
            const timeSinceLastNextAction = now - lastNextActionTimeRef.current
            // Determine if we are transiting based on UI track changes OR recent auto-next actions
            const isTransiting = timeSinceChange < 3500 || timeSinceLastNextAction < 3500

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
            
            // Detect natural end of track
            const trackIdFromSDK = state.track_window?.current_track?.id
            const isEndOfTrack = state.position === 0 && state.paused && state.repeat_mode === 0

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
                // If Spotify is paused but our UI thinks it's playing, sync it back
                // unless we are transiting OR the track naturally finished.
                if (isPlayingRef.current && !isTransiting && !isEndOfTrack) {
                    console.log('[Spotify] External Pause detected, syncing UI...')
                    pauseRef.current()
                } else if (!isPlayingRef.current && !isTransiting) {
                    // Already paused, ignore
                }
            } else {
                if (!isPlayingRef.current) {
                    console.log('[Spotify] External Play detected, syncing UI...')
                    resumeRef.current()
                }
            }

            // 2. Sync Duration & Progress
            setDuration(state.duration / 1000)

            // 4. Handle auto-next for end of track
            if (isEndOfTrack && isPlayingRef.current && !isTransiting) {
                if (trackIdFromSDK === expectedTrackId) {
                    if (timeSinceLastNextAction > 2000) {
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
                        if (s && !isSeekingRef.current) {
                            setProgress(s.position / s.duration)
                        }
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
        const maxRetries = 3
        trackChangeTimeRef.current = Date.now()
        // CRITICAL: Stamp the next-action time NOW so the Spotify listener's
        // isTransiting guard correctly suppresses false end-of-track events
        // that fire right at track load (position=0, paused=true flash).
        lastNextActionTimeRef.current = Date.now()

        const playSpotifyTrack = async () => {
            if (!isSpotify) return
            const trackId = currentTrack?.url.split('track/')[1]?.split('?')[0]
            // Always use the live ref, never the stale closure value
            const token = spotifyTokenRef.current
            if (!trackId || !token) {
                console.warn('[Spotify] Cannot play: missing trackId or token')
                return
            }

            // Wait for SDK to connect and get a deviceId (up to 8 seconds)
            // This is the #1 cause of first-song failure: the SDK is still
            // connecting when the YT auto-next fires.
            let deviceId = spotifyPlayerRef.current?._deviceId
            if (!deviceId) {
                console.log('[Spotify] Waiting for SDK device connection...')
                const maxWait = 8000
                const step = 200
                let waited = 0
                while (!deviceId && waited < maxWait) {
                    await new Promise(r => setTimeout(r, step))
                    waited += step
                    deviceId = spotifyPlayerRef.current?._deviceId
                }
                if (!deviceId) {
                    console.error('[Spotify] SDK not connected after 8s. Cannot play.')
                    setPlayerError('Spotify player not ready. Try clicking Play again.')
                    return
                }
                console.log('[Spotify] SDK connected after', waited, 'ms')
            }

            // CRITICAL: Explicitly pause the local SDK instance before starting a new track
            // This prevents "bleeding" or hearing a second of the previous song.
            try { await spotifyPlayerRef.current.pause() } catch (e) { }

            const attemptPlay = async (): Promise<boolean> => {
                try {
                    const freshToken = spotifyTokenRef.current
                    const freshDeviceId = spotifyPlayerRef.current?._deviceId
                    if (!freshToken || !freshDeviceId) return false

                    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${freshDeviceId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${freshToken}`
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

        // GUARD: If we just changed tracks, let the specialized playSpotifyTrack effect 
        // handle the initial state. premature sync here causes previous-track audio bleed.
        const timeSinceChange = Date.now() - trackChangeTimeRef.current
        if (timeSinceChange < 1500) return

        if (isPlaying) spotifyPlayerRef.current.resume()
        else spotifyPlayerRef.current.pause()
    }, [isPlaying, isSpotify])

    // Sync Volume with Spotify
    useEffect(() => {
        if (!spotifyPlayerRef.current || !isSpotify) return
        spotifyPlayerRef.current.setVolume(isMuted ? 0 : volume)
    }, [volume, isMuted, isSpotify])

    // ─── SoundCloud Logic (API/SDK) ───
    // ─── SoundCloud Logic (Backend Proxy Mode) ───
    useEffect(() => {
        if (!isSoundCloud || !hasMounted || !currentTrack?.url) {
            setScStreamUrl(null)
            return
        }

        // Synchronously clear old stream URL to prevent race conditions
        setScStreamUrl(null)
        const trackId = currentTrack.id

        const fetchStream = async (resumeFrom = 0) => {
            setPlayReady(false)
            setIsBuffering(true)
            if (resumeFrom === 0) {
                setProgress(0)
                setDuration(0)
            }

            try {
                const res = await fetch(`/api/soundcloud-resolve?url=${encodeURIComponent(currentTrack.url)}`)
                const data = await res.json()

                // Only update if we are still on the same track
                if (currentTrackRef.current?.id === trackId && data.success && data.stream_url) {
                    console.log('[SoundCloud] Backend resolved stream URL')
                    scResumePositionRef.current = resumeFrom
                    setScStreamUrl(data.stream_url)
                } else if (data.error) {
                    throw new Error(data.error)
                }
            } catch (err) {
                if (currentTrackRef.current?.id === trackId) {
                    console.error('[SoundCloud] Resolve failed:', err)
                    setPlayerError('SoundCloud stream unavailable. Please try another track.')
                }
            } finally {
                scIsRefetchingRef.current = false
            }
        }

        scResumePositionRef.current = 0
        scIsRefetchingRef.current = false
        fetchStream()
    }, [isSoundCloud, hasMounted, currentTrack?.url, currentTrack?.id])




    // ─── Local Music Logic ───
    // 1. URL Change: Force a hard reload of the audio engine
    useEffect(() => {
        if (!localAudioRef.current || (!isLocal && !isSoundCloud) || !currentTrack?.url) return
        if (isSoundCloud && !scStreamUrl) return // Wait for proxy resolution
        const audio = localAudioRef.current

        console.log('[NativeAudio] Loading source:', isLocal ? currentTrack.url : scStreamUrl)
        audio.load()

        // After a SoundCloud URL re-fetch, seek back to where we were
        if (isSoundCloud && scResumePositionRef.current > 0) {
            const resumePos = scResumePositionRef.current
            const onSeekReady = () => {
                if (audio.seekable.length > 0) {
                    audio.currentTime = Math.min(resumePos, audio.duration || resumePos)
                    console.log('[SoundCloud] Resumed from position:', resumePos)
                }
                audio.removeEventListener('canplay', onSeekReady)
            }
            audio.addEventListener('canplay', onSeekReady)
        }

        if (isPlaying) {
            audio.play().catch(err => {
                if (err.name !== 'AbortError') console.warn('[NativeAudio] URL change play failed:', err)
            })
        }
    }, [currentTrack?.url, isLocal, isSoundCloud, scStreamUrl])

    // 2. Play/Pause/Volume Sync
    useEffect(() => {
        if (!localAudioRef.current || (!isLocal && !isSoundCloud)) return
        if (isSoundCloud && !scStreamUrl) return // Wait for proxy resolution
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

            {/* Local & SoundCloud audio element - Persistent source management */}
            {(isLocal || (isSoundCloud && scStreamUrl)) && currentTrack && (
                <audio
                    ref={localAudioRef}
                    src={isLocal ? currentTrack.url : (scStreamUrl as string)}
                    preload="auto"
                    autoPlay={isPlaying} // Native Handoff
                    onEnded={() => nextRef.current(true)}
                    onTimeUpdate={(e) => {
                        const a = e.currentTarget
                        if (a.duration && !isSeekingRef.current) {
                            setProgress(a.currentTime / a.duration)
                            setDuration(a.duration)
                        }
                    }}
                    onCanPlay={(e) => {
                        setIsBuffering(false)
                        setPlayReady(true)
                        if (isPlayingRef.current) {
                            const audio = e.currentTarget
                            audio.play().catch(() => { })
                            
                            // Secondary attempt for background transitions
                            let attempts = 0
                            const forcePlay = () => {
                                if (audio.paused && attempts < 15 && isPlayingRef.current) {
                                    console.log('[NativeAudio] Background Play Attempt:', attempts + 1)
                                    audio.play().catch(() => { })
                                    attempts++
                                    setTimeout(forcePlay, 500)
                                }
                            }
                            setTimeout(forcePlay, 100)
                        }
                    }}
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => setIsBuffering(false)}
                    onError={(e) => {
                        const err = e.currentTarget.error
                        const audio = e.currentTarget
                        console.error('[LocalPlayer] Audio Error Object:', err)
                        if (err) {
                            console.error(`[LocalPlayer] Code: ${err.code}, Message: ${err.message}`)
                        }

                        // SoundCloud stream URLs are time-signed and expire (~30 min).
                        // On error code 4 (MEDIA_ERR_SRC_NOT_SUPPORTED = 403 from expired URL),
                        // automatically re-fetch a fresh stream URL and resume from same position.
                        if (isSoundCloud && err && err.code === 4 && !scIsRefetchingRef.current) {
                            const savedPos = audio.currentTime || 0
                            console.log('[SoundCloud] Stream URL expired. Re-fetching fresh URL, resume from:', savedPos)
                            scIsRefetchingRef.current = true
                            setPlayerError(null)
                            setIsBuffering(true)
                            setScStreamUrl(null) // Unmount the audio element

                            // Re-trigger the resolve effect with saved position
                            if (currentTrackRef.current && currentTrackRef.current.url) {
                                fetch(`/api/soundcloud-resolve?url=${encodeURIComponent(currentTrackRef.current.url)}`)
                                    .then(r => r.json())
                                    .then(data => {
                                        if (data.success && data.stream_url && currentTrackRef.current?.platform === 'soundcloud') {
                                            scResumePositionRef.current = savedPos
                                            setScStreamUrl(data.stream_url)
                                            console.log('[SoundCloud] Fresh URL obtained, will resume from', savedPos)
                                        } else {
                                            setPlayerError('SoundCloud stream expired. Please try again.')
                                            scIsRefetchingRef.current = false
                                        }
                                    })
                                    .catch(() => {
                                        setPlayerError('SoundCloud stream expired and could not be refreshed.')
                                        scIsRefetchingRef.current = false
                                    })
                            }
                            return
                        }

                        setPlayerError('Audio playback failed. Please check the source or your network.')
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
                                <Image
                                    src={currentTrack.thumbnail}
                                    alt={currentTrack.title || 'Track'}
                                    fill
                                    className="object-cover"
                                    sizes="56px"
                                />
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
                                    if (isSpotify && spotifyPlayerRef.current) {
                                        spotifyPlayerRef.current.seek(newProgress * duration * 1000)
                                    }
                                    if (isSoundCloud || (isLocal && localAudioRef.current)) {
                                        if (localAudioRef.current) localAudioRef.current.currentTime = newProgress * duration
                                    }
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
