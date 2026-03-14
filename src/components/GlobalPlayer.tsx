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

    const isEmbedPlatform = isYoutube || isApple

    const [progress, setProgress] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isBuffering, setIsBuffering] = useState(false)
    const [playerError, setPlayerError] = useState<string | null>(null)
    const [playReady, setPlayReady] = useState(false)
    const [showVideo, setShowVideo] = useState(false)
    const [hasMounted, setHasMounted] = useState(false)
    const [isSeeking, setIsSeeking] = useState(false)
    const [nativeStreamUrl, setNativeStreamUrl] = useState<string | null>(null)

    const localAudioRef = useRef<HTMLAudioElement>(null)
    const ytPlayerRef = useRef<any>(null)
    const ytIntervalRef = useRef<any>(null)
    const spotifyPlayerRef = useRef<any>(null)
    const spotifyIntervalRef = useRef<any>(null)
    const pendingYtVideoIdRef = useRef<string | null>(null)

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
    const lastPlayPauseActionRef = useRef<number>(0) // Cooldown for sync events
    const spotifyTransitionActiveRef = useRef(false)
    const spotifyTokenRef = useRef(spotifyToken)
    const hasMountedRef = useRef(false)
    const spotifyActivationDoneRef = useRef(false)
    const waitingForFocusRef = useRef(false)

    useEffect(() => {
        // RESET BACKEND SESSION: Ensure "One-Time Ghost Hand" is available on refresh
        fetch('/api/reset-cold-start').catch(() => { })
        setHasMounted(true)
    }, [])
    useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
    useEffect(() => { volumeRef.current = volume }, [volume])
    useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
    useEffect(() => { nextRef.current = next }, [next])
    useEffect(() => { resumeRef.current = resume }, [resume])
    useEffect(() => { pauseRef.current = pause }, [pause])
    useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])
    useEffect(() => { isSeekingRef.current = isSeeking }, [isSeeking])
    useEffect(() => { hasMountedRef.current = hasMounted }, [hasMounted])


    // ─── Wake Lock (Screen stay-awake) ───
    const wakeLockRef = useRef<any>(null)
    useEffect(() => {
        if (!('wakeLock' in navigator) || !hasMounted) return
        const requestWakeLock = async () => {
            try {
                if (isPlaying && !wakeLockRef.current) {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
                    console.log('[WakeLock] Active')
                } else if (!isPlaying && wakeLockRef.current) {
                    await wakeLockRef.current.release()
                    wakeLockRef.current = null
                }
            } catch (err) { console.warn('[WakeLock] Failed:', err) }
        }
        requestWakeLock()
        return () => { if (wakeLockRef.current) wakeLockRef.current.release().catch(() => { }) }
    }, [isPlaying, hasMounted])

    // ─── Browser Policy & Background Heartbeat: Unlock on first interaction ───
    const audioCtxRef = useRef<AudioContext | null>(null)
    const spotifyGhostHandDoneRef = useRef(false)
    const spotifyGhostHandActiveRef = useRef(false)
    const spotifyMuteLockedRef = useRef(false) // Hard mute until new track bitstream confirmed
    const spotifyKickHandledForTrackRef = useRef<string | null>(null)
    useEffect(() => {
        if (!hasMounted) return
        const unlockEvents = ['click', 'keydown', 'pointerdown', 'scroll']
        const onFirstInteraction = async () => {
            if (spotifyActivationDoneRef.current) return
            
            // 1. Initialize Heartbeat on gesture (to satisfy browser)
            try {
                if (!audioCtxRef.current) {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
                    audioCtxRef.current = new AudioContextClass()
                    const osc = audioCtxRef.current.createOscillator()
                    const gain = audioCtxRef.current.createGain()
                    osc.connect(gain)
                    gain.connect(audioCtxRef.current.destination)
                    gain.gain.setValueAtTime(0.0001, audioCtxRef.current.currentTime)
                    osc.start()
                    console.log('[Heartbeat] Persistent Background Bridge Activated via Gesture')
                }
            } catch (e) { }

            // 2. Unlock Spotify SDK
            if (spotifyPlayerRef.current) {
                try {
                    await spotifyPlayerRef.current.activateElement()
                    spotifyActivationDoneRef.current = true
                    console.log('[Spotify] Real SDK Audio Bridge Unlocked')
                } catch (e) { }
            }
            unlockEvents.forEach(e => document.removeEventListener(e, onFirstInteraction))
        }
        unlockEvents.forEach(e => document.addEventListener(e, onFirstInteraction))
        return () => {
            unlockEvents.forEach(e => document.removeEventListener(e, onFirstInteraction))
            audioCtxRef.current?.close()
        }
    }, [hasMounted])



    // ─── Background Audio Heartbeat (AudioContext) ───
    // Maintains "Audible" status for the tab to prevent aggressive CPU/Timer throttling.
    // IMPORTANT: AudioContext must only be created AFTER a user gesture (browser policy).
    // We lazy-start it the first time isPlaying becomes true, which is always post-gesture.
    const heartbeatRef = useRef<{ ctx: AudioContext, osc: OscillatorNode } | null>(null)

    const startHeartbeat = useCallback(async () => {
        if (heartbeatRef.current) {
            // Already running — just unpause if suspended
            if (heartbeatRef.current.ctx.state === 'suspended') {
                heartbeatRef.current.ctx.resume().catch(() => { })
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
            osc.frequency.setValueAtTime(24000, ctx.currentTime) // Supersonic (inaudible), max safe range
            // Transition Boost: Browsers treat "audible" tabs with higher priority.
            // When hidden, we use a slightly higher (but still negligible) gain to ensure hardware stays active.
            const targetGain = document.hidden ? 0.000001 : 0.0000001
            gain.gain.setValueAtTime(targetGain, ctx.currentTime)
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

    // ─── YouTube Logic ───
    const initYTPlayer = useCallback((videoId: string) => {
        if (!window.YT || !window.YT.Player) {
            if (!document.getElementById('youtube-sdk')) {
                const script = document.createElement('script')
                script.id = 'youtube-sdk'
                script.src = 'https://www.youtube.com/iframe_api'
                document.body.appendChild(script)
            }
            window.onYouTubeIframeAPIReady = () => {
                const freshVideoId = pendingYtVideoIdRef.current ||
                    extractVideoId(currentTrackRef.current?.url || '') || videoId
                pendingYtVideoIdRef.current = null
                initYTPlayer(freshVideoId)
            }
            return
        }

        // Detect if player is alive and functional
        const isPlayerHealthy = ytPlayerRef.current &&
            typeof ytPlayerRef.current.loadVideoById === 'function' &&
            typeof ytPlayerRef.current.getPlayerState === 'function' &&
            typeof ytPlayerRef.current.playVideo === 'function'

        pendingYtVideoIdRef.current = videoId

        if (isPlayerHealthy) {
            try {
                const currentTime = Math.floor(localAudioRef.current?.currentTime || 0)
                console.log('[YouTube] Handoff sync. Seeking to:', currentTime)
                ytPlayerRef.current.loadVideoById({ 
                    videoId, 
                    startSeconds: currentTime 
                })
                // Internal seek is often needed as loadVideoById is not always frame-perfect
                ytPlayerRef.current.seekTo(currentTime, true)
                if (isPlayingRef.current) ytPlayerRef.current.playVideo?.()
                return
            } catch (e) {
                ytPlayerRef.current = null
            }
        }

        if (!document.getElementById('yt-player')) return

        ytPlayerRef.current = new window.YT.Player('yt-player', {
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                controls: 1,
                modestbranding: 1,
                rel: 0,
                enablejsapi: 1,
                origin: window.location.origin
            },
            events: {
                onReady: (e: any) => {
                    const currentTime = Math.floor(localAudioRef.current?.currentTime || 0)
                    console.log('[YouTube] Pop-up ready. Precision-seeking to:', currentTime)
                    e.target.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100))
                    e.target.seekTo(currentTime, true)
                    if (isPlayingRef.current) e.target.playVideo()
                },
                onStateChange: (e: any) => {
                    if (e.data === 0) nextRef.current(true)
                }
            }
        })
    }, [])

    // Poke heartbeat alive on every track change to prevent suspension
    useEffect(() => {
        if (!currentTrack?.id) return
        startHeartbeat()
    }, [currentTrack?.id, startHeartbeat])

    // ─── Page Visibility Recovery & Browser Policy ───
    useEffect(() => {
        if (!hasMounted) return

        const handleVisibilityChange = async () => {
            if (document.visibilityState !== 'visible') return
            
            // 1. Guard against cold-start deferral conflicts
            if (waitingForFocusRef.current) {
                console.log('[Visibility] Tab focused. Letting startup deferral handle it.')
                return
            }

            const track = currentTrackRef.current
            if (!isPlayingRef.current || !track) return

            const platform = track.platform
            const isSP = platform === 'spotify'

            console.log('[Visibility] Tab became visible. Running recovery check...')

            // 2. Spotify: check if track ended or stalled while hidden
            // 2. Spotify: check if track ended or stalled while hidden
            if (isSP && spotifyPlayerRef.current) {
                try {
                    const s = await spotifyPlayerRef.current.getCurrentState()
                    if (!s) {
                        // Null state usually means the SDK lost its audio bridge
                        console.log('[Visibility] Spotify state null. Re-activating audio bridge...')
                        await spotifyPlayerRef.current.activateElement()
                        setTimeout(() => resumeRef.current(), 500)
                    } else if (s.paused && isPlayingRef.current) {
                        if (s.position === 0 && s.repeat_mode === 0) {
                            console.log('[Visibility] Spotify ended while hidden. Advancing...')
                            nextRef.current(true)
                        } else {
                            console.log('[Visibility] Spotify stalled mid-track. Forcing resume...')
                            spotifyPlayerRef.current.resume().catch(() => { })
                        }
                    }
                } catch (e) { }
            }

            // 3. YouTube/Native ... (rest of the logic remains)
            const isLC = platform === 'local'
            const isSC = platform === 'soundcloud'
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

            if (isYoutube && ytPlayerRef.current && showVideo) {
                try {
                    const ytState = ytPlayerRef.current.getPlayerState?.()
                    if (ytState === 0) nextRef.current(true)
                    else if (ytState !== 1 && ytState !== 3 && isPlayingRef.current) ytPlayerRef.current.playVideo?.()
                } catch (e) { }
            }

            // 4. Poke AudioContext heartbeat
            if (heartbeatRef.current?.ctx.state === 'suspended') {
                heartbeatRef.current.ctx.resume().catch(() => { })
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [hasMounted, showVideo])

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
            const isLC = platform === 'local'
            const isSC = platform === 'soundcloud'
            const isYT = platform === 'youtube' || platform === 'ytmusic'
            const isSP = platform === 'spotify'

            // 2. Native Audio Watchdog (Local, SoundCloud, and YouTube Proxies)
            if ((isLC || isSC || (isYT && !showVideo)) && localAudioRef.current) {
                const audio = localAudioRef.current
                
                // IGNORE recovery if this is just the silence starter
                if (nativeStreamUrl === '/api/silence') return 

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

            // 3. Spotify SDK Watchdog
            if (isSP && spotifyPlayerRef.current) {
                spotifyPlayerRef.current.getCurrentState().then((s: any) => {
                    if (!s) {
                        // null state means Spotify has no active playback.
                        // If app thinks we're playing and the track has been running for
                        // at least 5s (ruling out startup race), the track ended in the background.
                        const timeSinceChange = Date.now() - trackChangeTimeRef.current
                        if (isPlayingRef.current && timeSinceChange > 5000 && !waitingForFocusRef.current) {
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
        if (!isYoutube || !hasMounted || !showVideo) return
        const videoId = extractVideoId(currentTrack?.url || '')
        if (videoId) initYTPlayer(videoId)
    }, [isYoutube, currentTrack?.url, hasMounted, initYTPlayer, showVideo])

    // Sync Play/Pause with YouTube
    useEffect(() => {
        if (!ytPlayerRef.current || !isYoutube) return
        
        if (!showVideo) {
            try { ytPlayerRef.current.pauseVideo?.() } catch (e) { }
            return
        }

        try {
            const state = ytPlayerRef.current.getPlayerState?.()
            if (isPlaying) {
                if (state !== 1 && state !== 3) ytPlayerRef.current.playVideo?.()
            } else {
                if (state === 1 || state === 3) ytPlayerRef.current.pauseVideo?.()
            }
        } catch (e) { }
    }, [isPlaying, isYoutube, showVideo])

    // Sync Volume with YouTube
    useEffect(() => {
        if (!ytPlayerRef.current || !isYoutube) return
        try {
            if (typeof ytPlayerRef.current.setVolume === 'function') {
                ytPlayerRef.current.setVolume(isMuted ? 0 : Math.round(volume * 100))
            }
        } catch (e) { }
    }, [volume, isMuted, isYoutube])

    // Sync YouTube Iframe Progress to UI
    useEffect(() => {
        if (!isYoutube || !showVideo || !hasMounted) return
        
        const interval = setInterval(() => {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function' && !isSeekingRef.current) {
                try {
                    const currentTime = ytPlayerRef.current.getCurrentTime()
                    const duration = ytPlayerRef.current.getDuration()
                    if (duration > 0) {
                        setProgress(currentTime / duration)
                        setDuration(duration)
                    }
                } catch (e) { }
            }
        }, 500)
        
        return () => clearInterval(interval)
    }, [isYoutube, showVideo, hasMounted])


    // Sync Spotify Progress to UI
    useEffect(() => {
        if (!isSpotify || !playReady || !hasMounted) return
        
        let interval: any = null
        
        if (isPlaying && !isSeeking) {
            interval = setInterval(() => {
                if (spotifyPlayerRef.current && typeof spotifyPlayerRef.current.getCurrentState === 'function') {
                    spotifyPlayerRef.current.getCurrentState().then((s: any) => {
                        if (s && s.duration > 0 && !isSeekingRef.current) {
                            setProgress(s.position / s.duration)
                            setDuration(s.duration / 1000)
                        }
                    }).catch(() => {})
                }
            }, 1000)
        }
        
        return () => {
            if (interval) clearInterval(interval)
        }
    }, [isSpotify, isPlaying, isSeeking, playReady, hasMounted])

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

        if (exclude !== 'youtube' && exclude !== 'ytmusic') {
            try { if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo() } catch (e) { }
        }



        // 3. Spotify
        if (exclude !== 'spotify') {
            try {
                if (spotifyPlayerRef.current?.pause) spotifyPlayerRef.current.pause()
            } catch (e) { }
        }

        // 4. Local & SoundCloud & YouTube Native & Spotify Native (Native Engine)
        if (exclude !== 'local' && exclude !== 'soundcloud' && exclude !== 'youtube' && exclude !== 'ytmusic' && exclude !== 'spotify') {
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

        if (isPlatformChanging || isYoutube || isSpotify || isSoundCloud || isLocal) {
            setPlayReady(false)
            setIsBuffering(true)
        }

        // RESET GUARDS for the new track
        // This is critical for background transitions to prevent stale state from old tracks
        // from triggering an accidental sync-pause.
        lastSyncedPlayState.current = null
        lastPlayPauseActionRef.current = Date.now()

        // CRITICAL: Update track change time on every change
        trackChangeTimeRef.current = Date.now()
    }, [currentTrack, isEmbedPlatform, isLocal, isSpotify, isSoundCloud, stopAllPlayers])





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

            const currentTrackData = state.track_window?.current_track
            const trackId = currentTrackData?.id
            const expectedTrackId = currentTrackRef.current?.url.split('track/')[1]?.split('?')[0]

            // SURGICAL MUTE RECOVERY: If we are hard-muted waiting for a new track,
            // lift the mute ONLY once the bits for the NEW track have arrived at the browser.
            if (spotifyMuteLockedRef.current && trackId === expectedTrackId && !state.paused) {
                console.log('[Spotify] Reactive Bitstream Match: Performing Snap-to-Start & Unmute.')
                player.seek(0)
                setTimeout(() => {
                    const targetVol = isMutedRef.current ? 0 : volumeRef.current
                    player.setVolume(targetVol)
                    spotifyMuteLockedRef.current = false
                    console.log('[Spotify] Surgical Mute lifted.')
                }, 400)
            }

            // CRITICAL: If we are in the middle of starting a new Spotify track
            // block events UNLESS it's the specific track we are trying to play.
            if (spotifyTransitionActiveRef.current) {
                if (trackId === expectedTrackId && !state.paused) {
                    // Lock bypass: Allow event through
                } else {
                    return
                }
            }

            // SDK TAKEOVER: If we just pulsed the window to focus, re-minimize it now that music is playing
            if (state && !state.paused && spotifyGhostHandActiveRef.current) {
                console.log('[Spotify] SDK takeover detected. Entering Stealth Mode (auto-minimize)...')
                const tid = currentTrackRef.current?.id
                setTimeout(() => {
                    // Safety: only minimize if we are still on that same track
                    if (currentTrackRef.current?.id === tid) {
                        fetch('/api/minimize-window').catch(() => { })
                    }
                }, 400)
                spotifyGhostHandActiveRef.current = false
            }

            const now = Date.now()
            const timeSinceChange = now - trackChangeTimeRef.current
            const timeSinceLastNextAction = now - lastNextActionTimeRef.current
            // INCREASED TRANSITION WINDOW: Background tabs need more time to sync state.
            const isTransiting = timeSinceChange < 5000 || timeSinceLastNextAction < 5000

            // CRITICAL: Only process Spotify events if we are actually ON the Spotify platform
            // This prevents "Autoplay" or background Spotify activity from hijacking the UI
            if (currentTrackRef.current?.platform !== 'spotify') {
                if (!state.paused && !isTransiting) {
                    player.pause()
                }
                return
            }

            // Detect natural end of track
            const trackIdFromSDK = trackId
            const isEndOfTrack = state.position === 0 && state.paused && state.repeat_mode === 0

            // SAFEGUARD: If we are in the middle of a track change and the SDK is reporting
            // state for a track ID that doesn't match our expected one, ignore it.
            if (isTransiting && trackId && expectedTrackId && trackId !== expectedTrackId) {
                console.log('[Spotify] Ignoring state for stale track during transition:', trackId)
                return
            }

            // 1. Sync Play/Pause State
            const isPaused = state.paused

            // ANTI-LOOP COOLDOWN: If we just toggled play/pause locally, ignore SDK
            // state for a bit to avoid fighting with throttled/stale background events.
            const timeSinceSync = now - lastPlayPauseActionRef.current
            // In background tabs, Spotify state events are often heavily delayed/stale.
            const guardTime = document.hidden ? 4000 : 1500
            const skipExternalSync = isTransiting || timeSinceSync < guardTime

            if (isPaused) {
                // If Spotify is paused but our UI thinks it's playing, sync it back
                // unless we are transiting OR we just toggled locally.
                if (isPlayingRef.current && !skipExternalSync && !isEndOfTrack) {
                    console.log('[Spotify] External Pause detected, syncing UI...')
                    pauseRef.current()
                }
            } else {
                if (!isPlayingRef.current && !skipExternalSync) {
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

            // 4. Real-time Progress Tracking - Update duration immediately
            setDuration(state.duration / 1000)
        })

        player.addListener('authentication_error', ({ message }: any) => {
            console.error('[Spotify] Authentication Error:', message)
            setPlayerError('Spotify session expired. Please reconnect.')
        })

        player.connect()
    }, [])


    useEffect(() => {
        if (!hasMounted) return
        console.log('[Spotify] Engine v1.0.3 Active')
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

        const trackId = currentTrack?.url.split('track/')[1]?.split('?')[0]
        const playSpotifyTrack = async () => {
            // FIRST-TRACK FIX: Wait for the Spotify SDK to be ready (device connected)
            // before attempting to play. On cold start, the SDK may not have a deviceId yet.
            const waitForDevice = (): Promise<boolean> => new Promise((resolve) => {
                if (spotifyPlayerRef.current?._deviceId) return resolve(true)
                let waited = 0
                const poll = setInterval(() => {
                    waited += 250
                    if (spotifyPlayerRef.current?._deviceId) {
                        clearInterval(poll)
                        resolve(true)
                    } else if (waited >= 12000) {
                        clearInterval(poll)
                        console.warn('[Spotify] Device did not become ready within 12s')
                        resolve(false)
                    }
                }, 250)
            })

            const deviceReady = await waitForDevice()
            if (cancelled || !deviceReady) return

            // Block player_state_changed from reacting to intermediate pause/play events
            spotifyTransitionActiveRef.current = true
            lastNextActionTimeRef.current = Date.now()
            trackChangeTimeRef.current = Date.now()

            try {
                // SURGICAL MUTE: Kill volume during handoff to prevent "Previous Track Echo"
                spotifyMuteLockedRef.current = true
                try { await spotifyPlayerRef.current.setVolume(0) } catch (e) { }

                // Stop any current playback cleanly
                try { await spotifyPlayerRef.current.pause() } catch (e) { }
                await new Promise(r => setTimeout(r, 200))

                // PYTHON-KICK: Delegate pulse & session logic to the backend
                const tid = currentTrackRef.current?.id
                const trackUri = `spotify:track:${trackId}`
                const kickUrl = `/api/spotify-kick?device_id=${spotifyPlayerRef.current._deviceId}&token=${spotifyToken}&track_uri=${trackUri}&is_hidden=${document.hidden}`
                
                // Fire and monitor; we don't want to block the entire UI thread 
                // but we do need the SDK to be warmed up.
                fetch(kickUrl).then(() => {
                    console.log('[Spotify] Backend Kick confirmed.')
                }).catch(() => { })
                
                if (cancelled || currentTrackRef.current?.id !== tid) return

                // Wait briefly for the Pulse to hit the browser process before activation
                await new Promise(r => setTimeout(r, 1000))

                // CORE SYNC: Ensure the local SDK is now in sync with the Cloud Play
                try { await spotifyPlayerRef.current.activateElement() } catch (e) { }

                if (!cancelled && spotifyPlayerRef.current) {
                    setPlayReady(true)
                    setIsBuffering(false)
                    spotifyActivationDoneRef.current = true
                    
                    // Note: Unmute now happens reactively in the player_state_changed listener
                    // once the bitstream for the new track is confirmed by the SDK.
                    console.log('[Spotify] Session Kick Complete (v1.8.6). Waiting for bitstream...')
                }
            } finally {
                const releaseDelay = document.hidden ? 4000 : 800
                setTimeout(() => {
                    if (!cancelled) spotifyTransitionActiveRef.current = false
                }, releaseDelay)
            }
        }

        playSpotifyTrack()

        return () => {
            cancelled = true
            spotifyTransitionActiveRef.current = false
        }
    }, [isSpotify, currentTrack?.url, hasMounted, spotifyToken])

    // Sync Play/Pause with Spotify
    const lastSyncedPlayState = useRef<boolean | null>(null)
    useEffect(() => {
        if (!spotifyPlayerRef.current || !isSpotify || !playReady) return

        // ANTI-LOOP GUARD: Prevent redundant API calls
        if (lastSyncedPlayState.current === isPlaying) return

        // GUARD: If pausing, we always allow it (user intent is clear).
        // If resuming, we wait for transition to end to avoid fighting startup states.
        const timeSinceChange = Date.now() - trackChangeTimeRef.current
        const isTransitioning = spotifyTransitionActiveRef.current || timeSinceChange < 1500
        
        // ALLOW-LIST: If the UI says we are playing, but the SDK is stuck in transition,
        // we allow one manual resume to "break" the deadlock if enough time has passed.
        if (isPlaying && isTransitioning && timeSinceChange < 800) return

        lastSyncedPlayState.current = isPlaying
        lastPlayPauseActionRef.current = Date.now()

        if (isPlaying) {
            spotifyPlayerRef.current.resume().catch(() => { })
        } else {
            spotifyPlayerRef.current.pause().then(() => {
                // Background/Throttled Verification: Ensure it actually paused
                setTimeout(() => {
                    spotifyPlayerRef.current?.getCurrentState().then((s: any) => {
                        if (s && !s.paused && !isPlayingRef.current) {
                            console.log('[Spotify] Pause verification trigger: Re-sending pause...')
                            spotifyPlayerRef.current.pause().catch(() => {})
                        }
                    })
                }, 800)
            }).catch(() => { })
        }
    }, [isPlaying, isSpotify, playReady])

    // Sync Volume with Spotify
    useEffect(() => {
        if (!spotifyPlayerRef.current || !isSpotify) return
        spotifyPlayerRef.current.setVolume(isMuted ? 0 : volume)
    }, [volume, isMuted, isSpotify])

    // ─── Stream Resolution (SoundCloud & YouTube Only) ───
    useEffect(() => {
        const streamablePlatform = isSoundCloud || isYoutube
        if (!streamablePlatform || !hasMounted || !currentTrack?.url) {
            setNativeStreamUrl(null)
            return
        }

        const sid = currentTrack.id
        setNativeStreamUrl(null) // IMMEDIATE CLEAR: Kill the previous track's buffer/source
        
        const fetchStream = async () => {
            setPlayReady(false)
            setIsBuffering(true)
            setProgress(0)
            setDuration(0)

            try {
                let endpoint = ''
                if (isSoundCloud) endpoint = `soundcloud-resolve?url=${encodeURIComponent(currentTrack.url)}`
                else if (isYoutube) endpoint = `yt-resolve?url=${encodeURIComponent(currentTrack.url)}`

                const res = await fetch(`/api/${endpoint}`)
                const data = await res.json()

                if (currentTrackRef.current?.id === sid && data.success && data.stream_url) {
                    setNativeStreamUrl(data.stream_url)
                    if (data.duration) setDuration(data.duration)
                }
            } catch (err) { }
            finally {
                if (currentTrackRef.current?.id === sid) setIsBuffering(false)
            }
        }
        fetchStream()
    }, [isSoundCloud, isYoutube, hasMounted, currentTrack?.url, currentTrack?.id])




    // ─── Native Audio Engine (Local & Resolved Streams) ───
    useEffect(() => {
        if (!localAudioRef.current || !hasMounted) return

        // Handle local files OR resolved streams (SoundCloud/YouTube)
        // If YouTube, only use native audio if we are NOT in video mode
        const isNativeActive = isLocal || 
                              (isSoundCloud && nativeStreamUrl) || 
                              (isYoutube && nativeStreamUrl && !showVideo)

        if (!isNativeActive || !currentTrack?.url) {
            localAudioRef.current.pause()
            return
        }

        const audio = localAudioRef.current
        const sourceUrl = isLocal ? currentTrack.url : nativeStreamUrl

        if (sourceUrl && audio.src !== sourceUrl) {
            console.log('[NativeAudio] Loading source:', isLocal ? 'Local File' : 'Resolved Stream')
            audio.src = sourceUrl
            audio.load()
            setPlayReady(true)

            if (isPlaying) {
                audio.play().catch(err => {
                    if (err.name !== 'AbortError') console.warn('[NativeAudio] Play failed:', err)
                })
            }
        }
    }, [isLocal, isSoundCloud, isYoutube, nativeStreamUrl, hasMounted, currentTrack?.url, showVideo])

    useEffect(() => {
        if (!localAudioRef.current || (!isLocal && !isSoundCloud && !isYoutube)) return
        if (isYoutube && (showVideo || !nativeStreamUrl)) return
        
        const audio = localAudioRef.current
        audio.volume = isMuted ? 0 : volume

        if (isPlaying) {
            if (audio.paused) audio.play().catch(() => { })
        } else {
            if (!audio.paused) audio.pause()
        }
    }, [isPlaying, isLocal, isSoundCloud, isYoutube, nativeStreamUrl, volume, isMuted, showVideo])


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
            {/* Visual content container (YouTube Pop-up) */}
            {hasTrack && isYoutube && showVideo && (
                <div className="fixed bottom-[110px] left-6 z-[60] w-[320px] h-[180px] bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 animate-fadeInUp backdrop-blur-xl">
                    <div className="absolute top-2 right-2 z-30">
                        <button
                            onClick={() => setShowVideo(false)}
                            className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white/70 hover:text-white transition-colors backdrop-blur-md"
                        >
                            <VolumeX size={10} className="rotate-45" />
                        </button>
                    </div>
                    <div id="yt-player" className="w-full h-full" />
                </div>
            )}

            {/* Visual content container (YouTube / SoundCloud / Apple) */}
            <div
                className={clsx(
                    "fixed bottom-[110px] z-[60] transition-all duration-300 ease-out flex flex-col items-start gap-3 px-6",
                    hasTrack && isEmbedPlatform ? 'translate-y-0' : 'pointer-events-none opacity-0 translate-y-full'
                )}>
                {/* YouTube: Audio Recovery UI */}
                {hasTrack && isYoutube && (
                    <div className="flex flex-col gap-2">
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
                        
                        {playerError && (
                            <div className="px-4 py-3 rounded-2xl bg-black/95 border border-red-500/20 backdrop-blur-xl animate-fadeIn max-w-[280px]">
                                <div className="flex items-center gap-2 mb-1.5 text-red-500">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-[10px] font-mono-custom uppercase tracking-[2px]">Stream Error</span>
                                </div>
                                <p className="text-[9px] text-red-400 font-mono-custom leading-relaxed uppercase">
                                    {playerError}
                                </p>
                            </div>
                        )}
                        
                        {captureStatus && (
                            <div className="px-4 py-2 rounded-full bg-accent/10 border border-accent/20 backdrop-blur-md animate-pulse">
                                <span className="text-accent font-mono-custom text-[9px] uppercase tracking-[3px] font-bold">
                                    {captureStatus}
                                </span>
                            </div>
                        )}
                    </div>
                 )}
            </div>

            {/* Native Audio Layer (Local/SoundCloud/YouTube) */}
            {(isLocal || (isSoundCloud && nativeStreamUrl) || (isYoutube && nativeStreamUrl)) && currentTrack && (
                <audio
                    key={currentTrack?.id || 'native-audio'}
                    ref={localAudioRef}
                    src={isLocal ? currentTrack.url : (nativeStreamUrl as string)}
                    preload="auto"
                    autoPlay={isPlaying} // Native Handoff
                    onEnded={() => {
                        // ANTI-SKIP GUARD: Only allow native audio to trigger NEXT if:
                        // 1. We are actually on a native platform (not Spotify/Apple)
                        // 2. We aren't in the middle of a global track transition
                        const isNativePlatform = isLocal || isSoundCloud || isYoutube
                        const now = Date.now()
                        const isTransiting = (now - trackChangeTimeRef.current < 5000) || (now - lastNextActionTimeRef.current < 5000)
                        
                        if (isNativePlatform && !isTransiting) {
                            console.log('[NativeAudio] Track ended naturally. Moving next...')
                            nextRef.current(true)
                        } else {
                            console.log('[NativeAudio] Suppressing stale onEnded signal during transition.')
                        }
                    }}
                    onTimeUpdate={(e) => {
                        const a = e.currentTarget
                        if (a.duration && !isSeekingRef.current && nativeStreamUrl !== '/api/silence') {
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
                        console.error('[NativeAudio] Error:', e.currentTarget.error)
                        setPlayerError('Audio stream failed. The link might be expired.')
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

                        </div>
                        <div className="min-w-0">
                            <h4 className="font-bold text-sm truncate text-text">{currentTrack?.title || 'No track selected'}</h4>
                            <p className="text-xs text-muted truncate mt-0.5">{currentTrack?.artist || 'Unknown Artist'}</p>
                            {hasTrack && (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-1.5 py-0.5 rounded-md bg-surface2 text-[9px] font-black uppercase tracking-wider text-muted border border-border">
                                        {platformDisplayName(currentTrack.platform)}
                                    </span>
                                    {isYoutube && (
                                        <button 
                                            onClick={() => {
                                                const nextShowVideo = !showVideo
                                                // Handoff sync: Iframe -> Native
                                                if (!nextShowVideo && ytPlayerRef.current && localAudioRef.current) {
                                                    try {
                                                        const currentTime = ytPlayerRef.current.getCurrentTime()
                                                        localAudioRef.current.currentTime = currentTime
                                                    } catch (e) {}
                                                }
                                                setShowVideo(nextShowVideo)
                                            }}
                                            className={clsx(
                                                "p-1 rounded-md transition-all",
                                                showVideo ? "bg-accent/20 text-accent shadow-[0_0_10px_rgba(200,255,0,0.2)]" : "bg-surface2 text-muted hover:text-text border border-border"
                                            )}
                                            title="View Video"
                                        >
                                            <Video size={10} />
                                        </button>
                                    )}
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
                                onClick={() => {
                                    // BROWSER POLICY: Unlock audio on gesture
                                    if (isSpotify && spotifyPlayerRef.current) {
                                        spotifyPlayerRef.current.activateElement().catch(() => { })
                                    }
                                    if (isPlaying) pause()
                                    else resume()
                                }}
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

                                    if (isSpotify && spotifyPlayerRef.current) {
                                        spotifyPlayerRef.current.seek(newProgress * duration * 1000)
                                    }
                                    if (isSoundCloud || isLocal || (isYoutube && nativeStreamUrl && !showVideo)) {
                                        if (localAudioRef.current) localAudioRef.current.currentTime = newProgress * duration
                                    }
                                    if (isYoutube && showVideo && ytPlayerRef.current) {
                                        try { ytPlayerRef.current.seekTo(newProgress * duration, true) } catch (e) { }
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
