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
    // Blocks player_state_changed from reacting during Spotify track-start sequence
    const spotifyTransitionActiveRef = useRef(false)
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
            // Read videoId fresh from ref at callback time — avoids stale closure if
            // initYTPlayer was called multiple times before SDK finished loading
            window.onYouTubeIframeAPIReady = () => {
                const freshVideoId = extractVideoId(currentTrackRef.current?.url || '') || videoId
                initYTPlayer(freshVideoId)
            }
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
                // Extra sanity check: verify the player is not in a permanently broken state.
                // A player returning state -1 immediately after platform-handoff cleanup may be
                // stuck with a dead iframe. Check for a valid state (not an exception throw).
                const currentState = ytPlayerRef.current.getPlayerState?.()
                const isStateValid = typeof currentState === 'number'

                if (!isStateValid) {
                    console.warn('[YouTube] Player exists but state is invalid — recreating...')
                    ytPlayerRef.current = null
                } else {
                    console.log('[YouTube] Reusing existing player for:', videoId, '(current state:', currentState, ')')
                    setPlayReady(true)
                    setIsBuffering(true)

                    ytPlayerRef.current.loadVideoById({
                        videoId: videoId,
                        startSeconds: 0
                    })

                    if (isPlayingRef.current) {
                        const p = ytPlayerRef.current

                        // 1. Fire playVideo() IMMEDIATELY — loadVideoById cues the video
                        //    (state 5) and we must kick it into play right away.
                        //    unmuteVideo() is critical: if this player was pre-warmed with
                        //    mute:1, it will still be muted until we explicitly unmute it.
                        p.unmuteVideo?.()
                        p.setVolume?.(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                        p.playVideo?.()
                        console.log('[YouTube] Reuse: immediate playVideo() after loadVideoById')

                        // 2. Recovery loop — only fires for genuinely stuck states.
                        //    CRITICAL: Skip state 3 (buffering) — the video is loading,
                        //    calling playVideo() would restart the download from scratch.
                        let attempts = 0
                        const forcePlay = () => {
                            const state = p.getPlayerState?.()
                            if (state === -1 || state === 5 || state === 2) {
                                if (attempts < 8 && isPlayingRef.current) {
                                    console.log('[YouTube] Reuse Force-Play Attempt:', attempts + 1, '(state:', state, ')')
                                    p.unmuteVideo?.()
                                    p.playVideo?.()
                                    attempts++
                                    setTimeout(forcePlay, 1000)
                                }
                            }
                            // state 1 (playing), 0 (ended), 3 (buffering) → let it proceed
                        }
                        // Start the recovery loop after a short wait —
                        // gives the immediate playVideo() time to take effect first
                        setTimeout(forcePlay, 600)
                    }

                    ytPlayerRef.current.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                    trackChangeTimeRef.current = Date.now()
                    return
                }
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
                    if (typeof e.target.setVolume === 'function') {
                        e.target.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                    }
                    if (typeof e.target.getDuration === 'function') {
                        const d = e.target.getDuration()
                        if (d > 0) setDuration(d)
                    }
                    trackChangeTimeRef.current = Date.now()

                    // New player: always try to autoplay. Use a retry loop ONLY for
                    // states where the player is genuinely stuck (not for buffering).
                    if (typeof e.target.playVideo === 'function') {
                        console.log('[YouTube] onReady: Starting autoplay')
                        e.target.playVideo()
                        const p = e.target
                        let attempts = 0
                        const forcePlay = () => {
                            const state = p.getPlayerState?.()
                            // CRITICAL: Skip buffering (state 3) — the video is loading, don't interrupt it.
                            // Only retry for unstarted (-1), cued (5), or paused (2) — genuine stuck states.
                            if (state === -1 || state === 5 || state === 2) {
                                if (attempts < 12 && isPlayingRef.current !== false) {
                                    console.log('[YouTube] New Player Force-Play Attempt:', attempts + 1, '(state:', state, ')')
                                    p.playVideo?.()
                                    attempts++
                                    setTimeout(forcePlay, 800)
                                }
                            } else if (state !== 1 && state !== 0 && state !== 3) {
                                // Unknown non-playing state — try once more
                                if (attempts < 3 && isPlayingRef.current !== false) {
                                    p.playVideo?.()
                                    attempts++
                                    setTimeout(forcePlay, 1000)
                                }
                            }
                            // state 1 (playing), 0 (ended), 3 (buffering) → let it proceed naturally
                        }
                        setTimeout(forcePlay, 400)
                    }
                },
                onStateChange: (e: any) => {
                    const state = e.data
                    const timeSinceChange = Date.now() - trackChangeTimeRef.current

                    if (state === 0) {
                        // Ended — only advance if this is not a stale event from a
                        // player that was stopped during platform handoff (< 2s guard)
                        if (timeSinceChange > 2000) {
                            console.log('[YouTube] Video Finished, calling next')
                            nextRef.current(true)
                        }
                    } else if (state === 1) {
                        // Playing — only sync UI if track is settled (not mid-transition)
                        if (timeSinceChange > 500) {
                            setIsBuffering(false)
                            setPlayerError(null)
                            if (!isPlayingRef.current) resumeRef.current()
                        } else {
                            setIsBuffering(false)
                        }
                    } else if (state === 2) {
                        // Paused — only reflect this as a user action if we're settled.
                        // During stopAllPlayers() on platform handoff, pauseVideo() fires
                        // this event. We MUST NOT call pauseRef() in that case as it would
                        // corrupt the isPlaying state for the incoming new track.
                        if (timeSinceChange > 2000 && isPlayingRef.current) {
                            console.log('[YouTube] External pause detected, syncing UI')
                            pauseRef.current()
                        }
                    } else if (state === 3) {
                        setIsBuffering(true)
                    } else if (state === 5 || state === -1) {
                        // Cued or unstarted — try to play, with a retry for background tabs
                        if (isPlayingRef.current !== false && typeof e.target.playVideo === 'function') {
                            e.target.playVideo()
                            setTimeout(() => {
                                if (isPlayingRef.current !== false && e.target.getPlayerState?.() !== 1) {
                                    console.log('[YouTube] onStateChange retry for cued/unstarted state')
                                    e.target.playVideo?.()
                                }
                            }, 800)
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
    // Maintains "Audible" status for the tab to prevent aggressive CPU/Timer throttling.
    // IMPORTANT: AudioContext must only be created AFTER a user gesture (browser policy).
    // We lazy-start it the first time isPlaying becomes true, which is always post-gesture.
    const heartbeatRef = useRef<{ ctx: AudioContext, osc: OscillatorNode } | null>(null)

    const startHeartbeat = useCallback(async () => {
        if (heartbeatRef.current) {
            // Already running — just unpause if suspended
            if (heartbeatRef.current.ctx.state === 'suspended') {
                heartbeatRef.current.ctx.resume().catch(() => {})
            }
            return
        }
        try {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
            if (!AudioContextClass) return
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
    }, [])

    // Lazy-init: start heartbeat the first time the user plays something (always post-gesture)
    useEffect(() => {
        if (!hasMounted || !isPlaying) return
        startHeartbeat()
    }, [hasMounted, isPlaying, startHeartbeat])

    // Cleanup heartbeat on unmount
    useEffect(() => {
        return () => {
            if (heartbeatRef.current) {
                const { ctx, osc } = heartbeatRef.current
                try { osc.stop() } catch (e) { }
                try { ctx.close() } catch (e) { }
                heartbeatRef.current = null
            }
        }
    }, [])

    // Poke heartbeat alive on every track change to prevent suspension
    useEffect(() => {
        if (!currentTrack?.id) return
        startHeartbeat()
    }, [currentTrack?.id, startHeartbeat])

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
                    if (!s) {
                        // null state = Spotify has nothing playing.
                        // If our app thinks we're still playing, the track ended while backgrounded.
                        if (isPlayingRef.current) {
                            console.log('[Visibility] Spotify state is null while playing — track ended in background. Advancing...')
                            nextRef.current(true)
                        }
                    } else if (s.paused && s.position === 0 && s.repeat_mode === 0) {
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
                    if (!s) {
                        // null state means Spotify has no active playback.
                        // If app thinks we're playing and the track has been running for
                        // at least 5s (ruling out startup race), the track ended in the background.
                        const timeSinceChange = Date.now() - trackChangeTimeRef.current
                        if (isPlayingRef.current && timeSinceChange > 5000) {
                            console.log('[Spotify] Watchdog: null state while playing — track ended in background. Advancing...')
                            nextRef.current(true)
                        }
                    } else {
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
        console.log('[GlobalPlayer] Stop all players triggered, exclude:', exclude ?? '(none — full stop)')

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

    // ─── YouTube Player Pre-Warm ───
    // Load the YT SDK and silently create a dormant player as early as possible.
    // This ensures the very first YouTube transition uses the fast "reuse" path
    // (loadVideoById) instead of cold-creating a new player, eliminating the
    // 3–6s silence gap when switching from Spotify/SoundCloud → YouTube.
    useEffect(() => {
        if (!hasMounted) return

        const prewarm = () => {
            // If a real player already exists (e.g. YouTube was the first song), skip.
            if (ytPlayerRef.current) return
            // If yt-player div not in DOM yet, skip (will be created on first render).
            if (!document.getElementById('yt-player')) return

            console.log('[YouTube] Pre-warming player...')
            ytPlayerRef.current = new window.YT.Player('yt-player', {
                // Use a short, royalty-free YouTube video as the placeholder.
                // autoplay=0 => silent, no audio output at all.
                videoId: 'dQw4w9WgXcQ', // placeholder — will be replaced by loadVideoById
                playerVars: {
                    autoplay: 0,        // silent — do NOT start playing
                    controls: 0,
                    mute: 1,            // belt-and-suspenders silence
                    playsinline: 1,
                    rel: 0,
                    modestbranding: 1,
                    origin: window.location.origin
                },
                events: {
                    onReady: () => {
                        console.log('[YouTube] Pre-warm complete. Player is ready for instant reuse.')
                        // Immediately pause to ensure nothing plays
                        try { ytPlayerRef.current?.pauseVideo?.() } catch (e) { }
                    },
                    onStateChange: (e: any) => {
                        // During pre-warm, aggressively silence any accidental playback
                        if (e.data === 1 && !isPlayingRef.current) {
                            try { ytPlayerRef.current?.pauseVideo?.() } catch (err) { }
                        }
                    }
                }
            })
        }

        // Load the SDK if not already present, then prewarm
        if (window.YT?.Player) {
            prewarm()
        } else {
            if (!document.getElementById('youtube-sdk')) {
                const script = document.createElement('script')
                script.id = 'youtube-sdk'
                script.src = 'https://www.youtube.com/iframe_api'
                document.body.appendChild(script)
            }
            // Wrap existing callback: chain our prewarm after any pending initYTPlayer callback
            const existingCallback = window.onYouTubeIframeAPIReady
            window.onYouTubeIframeAPIReady = () => {
                existingCallback?.()
                // Only prewarm if initYTPlayer didn't already create a real player
                setTimeout(prewarm, 100)
            }
        }
    }, [hasMounted]) // Run once on mount

    // Trigger initYTPlayer when a real YouTube track is selected
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
            // Guard: if player isn't ready yet, state will be undefined — skip to avoid spurious playVideo() calls
            if (playerState === undefined || playerState === null) return
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

            // CRITICAL: If we are in the middle of starting a new Spotify track
            // (the transition sequence calls pause() before play/), block ALL
            // state events until the sequence completes. This prevents the pause()
            // call from being misread as a user-initiated pause.
            if (spotifyTransitionActiveRef.current) {
                console.log('[Spotify] Ignoring state event during transition (spotifyTransitionActive)')
                return
            }

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
            // state for a track ID that doesn't match our expected one, ignore it.
            if (isTransiting && trackId && expectedTrackId && trackId !== expectedTrackId) {
                console.log('[Spotify] Ignoring state for stale track during transition:', trackId)
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
                }
            } else {
                if (!isPlayingRef.current) {
                    console.log('[Spotify] External Play detected, syncing UI...')
                    resumeRef.current()
                }
            }

            // 2. Sync Duration & Progress
            setDuration(state.duration / 1000)

            // 3. Handle auto-next for end of track
            if (isEndOfTrack && isPlayingRef.current && !isTransiting) {
                if (trackIdFromSDK === expectedTrackId) {
                    if (timeSinceLastNextAction > 2000) {
                        lastNextActionTimeRef.current = now
                        nextRef.current(true)
                    }
                }
            }

            // 4. Real-time Progress Tracking
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
        if (!isSpotify || !hasMounted) return

        let retryCount = 0
        const maxRetries = 3
        let cancelled = false

        const playSpotifyTrack = async () => {
            if (!spotifyPlayerRef.current?._deviceId) return
            const trackId = currentTrack?.url.split('track/')[1]?.split('?')[0]
            if (!trackId || !spotifyToken) return

            // Block player_state_changed from reacting to intermediate pause/play events
            // during the entire start sequence. This prevents the pre-play pause()
            // call from being misread as a user-initiated external pause.
            spotifyTransitionActiveRef.current = true
            lastNextActionTimeRef.current = Date.now() // also set transition window
            trackChangeTimeRef.current = Date.now()

            try {
                // Stop any current playback cleanly
                try { await spotifyPlayerRef.current.pause() } catch (e) { }
                if (cancelled) return

                const attemptPlay = async (): Promise<boolean> => {
                    try {
                        const res = await fetch(
                            `https://api.spotify.com/v1/me/player/play?device_id=${spotifyPlayerRef.current._deviceId}`,
                            {
                                method: 'PUT',
                                body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${spotifyTokenRef.current || spotifyToken}`
                                }
                            }
                        )

                        if (res.status === 404) return false

                        if (!res.ok) {
                            const errData = await res.json().catch(() => ({}))
                            if (errData.error?.message === 'Player command failed: No active device found') return false
                            throw new Error(errData.error?.message || 'Play failed')
                        }

                        return true
                    } catch (err) {
                        console.error('[Spotify] Play Attempt Failed:', err)
                        return false
                    }
                }

                // Small initial delay to let the SDK settle after the pause
                await new Promise(r => setTimeout(r, 200))
                if (cancelled) return

                while (retryCount <= maxRetries) {
                    const success = await attemptPlay()
                    if (cancelled) return
                    if (success) break
                    retryCount++
                    if (retryCount <= maxRetries) {
                        console.log(`[Spotify] Retrying play (${retryCount}/${maxRetries})...`)
                        await new Promise(r => setTimeout(r, 600 * retryCount))
                        if (cancelled) return
                    }
                }

                if (retryCount > maxRetries) {
                    setPlayerError('Spotify failed to start. Try clicking Play again.')
                } else {
                    setPlayReady(true)
                    setIsBuffering(false)
                    console.log('[Spotify] Track start sequence complete:', trackId)
                }
            } finally {
                // Release the transition block shortly after the play command succeeds.
                // 800ms is enough time for any in-flight state events from the pause()/play
                // sequence to arrive and be discarded, without blocking subsequent events.
                setTimeout(() => {
                    if (!cancelled) spotifyTransitionActiveRef.current = false
                }, 800)
            }
        }

        playSpotifyTrack()

        return () => {
            cancelled = true
            spotifyTransitionActiveRef.current = false
        }
    }, [isSpotify, currentTrack?.url, hasMounted, spotifyToken])

    // Sync Play/Pause with Spotify
    // IMPORTANT: Only sync after the track is actually loaded (playReady=true).
    // This prevents premature resume() calls during the track-start sequence,
    // which would fight against the carefully ordered pause→play sequence.
    useEffect(() => {
        if (!spotifyPlayerRef.current || !isSpotify || !playReady) return

        // GUARD: Don't sync if the transition block is active
        if (spotifyTransitionActiveRef.current) return

        // GUARD: Let the specialized playSpotifyTrack effect handle initial state.
        const timeSinceChange = Date.now() - trackChangeTimeRef.current
        if (timeSinceChange < 2000) return

        if (isPlaying) spotifyPlayerRef.current.resume().catch(() => {})
        else spotifyPlayerRef.current.pause().catch(() => {})
    }, [isPlaying, isSpotify, playReady])

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

        const fetchStream = async () => {
            setPlayReady(false)
            setIsBuffering(true)
            setProgress(0)
            setDuration(0)

            try {
                const res = await fetch(`/api/soundcloud-resolve?url=${encodeURIComponent(currentTrack.url)}`)
                const data = await res.json()

                // Only update if we are still on the same track
                if (currentTrackRef.current?.id === trackId && data.success && data.stream_url) {
                    console.log('[SoundCloud] Backend resolved stream URL')
                    setScStreamUrl(data.stream_url)
                } else if (data.error) {
                    throw new Error(data.error)
                }
            } catch (err) {
                if (currentTrackRef.current?.id === trackId) {
                    console.error('[SoundCloud] Resolve failed:', err)
                    setPlayerError('SoundCloud API resolution failed. Please ensure backend is running.')
                }
            }
        }

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
                        console.error('[LocalPlayer] Audio Error Object:', err)
                        if (err) {
                            console.error(`[LocalPlayer] Code: ${err.code}, Message: ${err.message}`)
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
