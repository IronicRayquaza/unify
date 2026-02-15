'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePlayer } from '@/lib/player-context'
import Image from 'next/image'
import {
    Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
    Loader2, Music2, Shuffle, Repeat, Repeat1, ExternalLink,
} from 'lucide-react'
import * as Slider from '@radix-ui/react-slider'
import { extractSpotifyId, extractVideoId, platformDisplayName } from '@/lib/platform'
import { useSpotifyAuth } from '@/lib/spotify-auth'
import { useAuth } from '@/lib/auth-context'

const SPOTIFY_TOKEN_KEY = 'spotify_access_token'

function formatTime(seconds: number) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00'
    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return `${min}:${sec < 10 ? '0' : ''}${sec}`
}

// ─────────────────────────────────────────────
// FIX 1: Build YouTube embed URL correctly
// origin must NOT be URL-encoded or YouTube rejects the embed
// ─────────────────────────────────────────────
function buildYouTubeEmbedUrl(videoId: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const params = new URLSearchParams({
        autoplay: '1',
        rel: '0',
        modestbranding: '1',
        enablejsapi: '1',
        origin,
        widget_referrer: origin,
        playsinline: '1',
        hl: 'en',
    })
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}

// ─────────────────────────────────────────────
// FIX 2: YouTube error code → message
// ─────────────────────────────────────────────
function getYouTubeErrorMessage(code: any): string {
    const c = (code !== undefined && code !== null) ? Number(code) : NaN
    if (isNaN(c)) return 'YouTube playback error. Try refreshing.'
    switch (c) {
        case 2: return 'Invalid link or video ID.'
        case 5: return 'HTML5 Player error.'
        case 100: return 'Track removed or private.'
        case 101:
        case 150: return 'Label restricted embedding. Use the Search tab for the official video.'
        default: return `YouTube error code ${c}.`
    }
}

declare global {
    interface Window {
        Spotify: any
        onSpotifyWebPlaybackSDKReady: () => void
        SC: any
    }
}

export function GlobalPlayer() {
    const { user } = useAuth()
    const {
        currentTrack, isPlaying, pause, resume, next, prev,
        volume, isMuted, isShuffle, repeatMode,
        setVolume, toggleMute, toggleShuffle, toggleRepeat
    } = usePlayer()

    const isYoutube = currentTrack?.platform === 'youtube' || currentTrack?.platform === 'ytmusic'
    const isYoutubeMusic = currentTrack?.platform === 'ytmusic'
    const isSoundCloud = currentTrack?.platform === 'soundcloud'
    const isSpotify = currentTrack?.platform === 'spotify'
    const isApple = currentTrack?.platform === 'apple'
    const isLocal = currentTrack?.platform === 'local'
    const isEmbedPlatform = isYoutube || isSoundCloud || isApple

    const [progress, setProgress] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isBuffering, setIsBuffering] = useState(false)
    const [hasUserInteracted, setHasUserInteracted] = useState(false)
    const [playerError, setPlayerError] = useState<string | null>(null)
    const [playReady, setPlayReady] = useState(false)
    const [showVideo, setShowVideo] = useState(true)
    const [hasMounted, setHasMounted] = useState(false)

    const localAudioRef = useRef<HTMLAudioElement>(null)

    useEffect(() => { setHasMounted(true) }, [])
    useEffect(() => { if (isPlaying) setHasUserInteracted(true) }, [isPlaying])
    useEffect(() => {
        const h = () => setHasUserInteracted(true)
        window.addEventListener('click', h, { once: true })
        return () => window.removeEventListener('click', h)
    }, [])

    // ─── Reset on track change ───
    useEffect(() => {
        setProgress(0)
        setDuration(0)
        setPlayReady(false)
        setIsBuffering(false)
        setPlayerError(null)
        if (isEmbedPlatform) setShowVideo(true)
    }, [currentTrack?.url])

    // ─────────────────────────────────────────────
    // FIX 3: YouTube postMessage listener
    // Now catches onError events — previously missing entirely
    // ─────────────────────────────────────────────
    const durationRef = useRef(0)
    const progressRef = useRef(0)
    const isPlayingRef = useRef(isPlaying)
    useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
    useEffect(() => { progressRef.current = progress }, [progress])

    useEffect(() => {
        if (!isYoutube) return

        const handler = (event: MessageEvent) => {
            if (
                !event.origin.includes('youtube.com') &&
                !event.origin.includes('youtube-nocookie.com')
            ) return

            let data: any
            try {
                data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
            } catch { return }

            // State change: 0=ended, 1=playing, 2=paused, 3=buffering
            if (data.event === 'onStateChange' || (data.event === 'infoDelivery' && data.info?.playerState !== undefined)) {
                const state = (data.event === 'onStateChange' ? data.data : data.info.playerState) as number
                if (state === 0) {
                    console.log('[GlobalPlayer] YouTube Ended detected')
                    next(true)
                } else if (state === 1) {
                    setIsBuffering(false)
                    setPlayerError(null)
                    if (!isPlayingRef.current) resume()
                } else if (state === 2) {
                    // Only pause if we aren't at the very end (prevents race conditions with 'ended')
                    if (isPlayingRef.current && progressRef.current < 0.99) {
                        pause()
                    } else if (progressRef.current >= 0.99) {
                        console.log('[GlobalPlayer] YT paused at end, forcing next...')
                        next(true)
                    }
                } else if (state === 3) {
                    setIsBuffering(true)
                }
            }

            // ── onError: handles blocked embeddings ──
            if (data.event === 'onError') {
                const code = data.data ?? data.info?.code ?? data.info?.error ?? data.error ?? (Array.isArray(data.args) ? data.args[0] : undefined)
                setPlayerError(getYouTubeErrorMessage(code))
                setIsBuffering(false)
                setPlayReady(false)
                console.error('[GlobalPlayer] YouTube Error:', code, data)
            }

            // onReady fires when the player is fully initialized
            if (data.event === 'onReady') {
                setPlayReady(true)
                setIsBuffering(false)

                // Final sync on ready
                const iframe = document.getElementById('youtube-player') as HTMLIFrameElement
                if (iframe?.contentWindow) {
                    iframe.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: isPlayingRef.current ? 'playVideo' : 'pauseVideo',
                        args: []
                    }), '*')
                }
            }

            // Progress via infoDelivery (the master event stream from YT)
            if (data.event === 'infoDelivery' && data.info) {
                const info = data.info as any
                if (typeof info.duration === 'number' && info.duration > 0) {
                    durationRef.current = info.duration
                    setDuration(info.duration)
                }
                if (typeof info.currentTime === 'number' && durationRef.current > 0) {
                    const p = info.currentTime / durationRef.current
                    progressRef.current = p
                    setProgress(p)

                    // Instant skip if YT reports 100% via infoDelivery
                    if (p >= 1 || info.currentTime >= durationRef.current - 0.2) {
                        console.log('[GlobalPlayer] YT infoDelivery reports end')
                        next(true)
                    }
                }
            }
        }

        window.addEventListener('message', handler)
        return () => window.removeEventListener('message', handler)
    }, [isYoutube, next, resume, pause]) // Functions are stable from useCallback

    // YouTube playReady fallback (if onReady never fires but iframe loaded)
    useEffect(() => {
        if (!isYoutube || !isPlaying || playReady) return
        const t = setTimeout(() => setPlayReady(true), 2500)
        return () => clearTimeout(t)
    }, [isYoutube, isPlaying, playReady])

    // YouTube remote control & heartbeat poll
    useEffect(() => {
        if (!isYoutube || !hasMounted || !playReady) return
        const iframe = document.getElementById('youtube-player') as HTMLIFrameElement
        if (!iframe?.contentWindow) return

        // 1. Sync Play/Pause and Volume immediately on state changes
        iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: isPlaying ? 'playVideo' : 'pauseVideo',
            args: []
        }), '*')
        iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [isMuted ? 0 : Math.round(volume * 100)]
        }), '*')

        // 2. Poll heartbeat (some videos are shy about reporting time)
        const interval = setInterval(() => {
            if (isPlaying) {
                iframe.contentWindow?.postMessage(JSON.stringify({
                    event: 'listening',
                    id: 1,
                    channel: 'widget'
                }), '*')
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [isYoutube, isPlaying, volume, isMuted, hasMounted, currentTrack?.id, playReady])

    // ─── Safety Watchdog for YouTube / Apple Sync ───
    useEffect(() => {
        if (!isPlaying || duration <= 0) return

        // If we're at 99.5% and haven't flipped to next yet for over 2 seconds
        if (progress >= 0.995) {
            const t = setTimeout(() => {
                if (progress >= 0.995 && isPlaying) {
                    console.log('[GlobalPlayer] Safety skipping stuck track...')
                    next(true)
                }
            }, 1500)
            return () => clearTimeout(t)
        }
    }, [isPlaying, progress, duration, next])

    // ─── SoundCloud Widget ───
    useEffect(() => {
        if (!isSoundCloud || !hasMounted) return

        const scScriptId = 'soundcloud-widget-api'
        if (!document.getElementById(scScriptId)) {
            const script = document.createElement('script')
            script.id = scScriptId
            script.src = 'https://w.soundcloud.com/player/api.js'
            script.async = true
            document.body.appendChild(script)
        }

        const setup = () => {
            const iframe = document.querySelector('iframe[src*="soundcloud.com"]') as HTMLIFrameElement
            if (!iframe || !window.SC) return
            try {
                const widget = window.SC.Widget(iframe)
                widget.setVolume(isMuted ? 0 : volume * 100)
                if (isPlaying) widget.play(); else widget.pause()

                widget.unbind(window.SC.Widget.Events.FINISH)
                widget.bind(window.SC.Widget.Events.FINISH, () => next(true))

                widget.unbind(window.SC.Widget.Events.PLAY_PROGRESS)
                widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (data: any) => {
                    const p = data.relativePosition
                    if (p > 0) {
                        setProgress(p)
                        const newDur = data.currentPosition / p / 1000
                        if (Math.abs(newDur - durationRef.current) > 1) setDuration(newDur)
                    }
                })
            } catch (e) {
                console.warn('[GlobalPlayer] SC widget not ready, retrying...')
                setTimeout(setup, 800)
            }
        }

        const t = setTimeout(setup, 600)
        return () => clearTimeout(t)
    }, [isSoundCloud, currentTrack?.id, hasMounted, next, isPlaying, volume, isMuted])

    // ─── Sync duration from track metadata ───
    useEffect(() => {
        if (!currentTrack) return
        if (currentTrack.duration && typeof currentTrack.duration === 'string') {
            const parts = currentTrack.duration.split(':').map(Number)
            let secs = 0
            if (parts.length === 2) secs = parts[0] * 60 + parts[1]
            else if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2]
            if (secs > 0) setDuration(secs)
        }
    }, [currentTrack?.url, currentTrack?.duration])

    // ─── Generic Embed Sync & Auto-Next Heartbeat ───
    useEffect(() => {
        if (!isEmbedPlatform || !hasMounted || isYoutube || isSoundCloud) return
        const iframe = document.querySelector('iframe[key]') as HTMLIFrameElement
        if (!iframe?.contentWindow) return

        // Volume sync for Apple / Other embeds
        iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [isMuted ? 0 : Math.round(volume * 100)]
        }), '*')
    }, [isEmbedPlatform, volume, isMuted, hasMounted, currentTrack?.id, isYoutube, isSoundCloud])

    useEffect(() => {
        const needsSimulatedProgress = isApple && isPlaying && duration > 0
        if (!needsSimulatedProgress) return

        const interval = setInterval(() => {
            setProgress(prev => {
                const step = 1 / duration
                const nextVal = prev + step
                if (nextVal >= 1) {
                    next(true) // Switch to next song
                    return 1
                }
                return nextVal
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [isApple, isPlaying, duration, next])

    // ─── Resolve SoundCloud short links ───
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
    useEffect(() => {
        if (!currentTrack?.url) { setResolvedUrl(null); return }
        if (isSoundCloud && (
            currentTrack.url.includes('on.soundcloud.com') ||
            currentTrack.url.includes('soundcloud.app.goo.gl')
        )) {
            fetch(`/api/resolve-url?url=${encodeURIComponent(currentTrack.url)}`)
                .then(r => r.json())
                .then(d => setResolvedUrl(d.resolved ?? currentTrack.url))
                .catch(() => setResolvedUrl(currentTrack.url))
        } else {
            setResolvedUrl(currentTrack.url)
        }
    }, [currentTrack?.url, isSoundCloud])

    const activeUrl = (() => {
        if (!currentTrack?.url) return null
        if (isYoutube) {
            const id = extractVideoId(currentTrack.url)
            return id ? `https://www.youtube.com/watch?v=${id}` : null
        }
        return resolvedUrl ?? currentTrack.url
    })()

    // ─── Spotify SDK ───
    const [spotifyPlayer, setSpotifyPlayer] = useState<any>(null)
    const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null)
    const [isSpotifyReady, setIsSpotifyReady] = useState(false)
    const [spotifyError, setSpotifyError] = useState<string | null>(null)

    useEffect(() => {
        if (!user || document.getElementById('spotify-player-sdk')) return
        const script = document.createElement('script')
        script.id = 'spotify-player-sdk'
        script.src = 'https://sdk.scdn.co/spotify-player.js'
        script.async = true
        document.body.appendChild(script)

        window.onSpotifyWebPlaybackSDKReady = () => {
            const token = localStorage.getItem(SPOTIFY_TOKEN_KEY)
            if (!token) { setSpotifyError('Connect Spotify to enable playback.'); return }

            const player = new window.Spotify.Player({
                name: 'UNIFY Web Player',
                getOAuthToken: (cb: any) => { cb(token) },
                volume,
            })
            player.addListener('ready', ({ device_id }: any) => {
                setSpotifyDeviceId(device_id); setIsSpotifyReady(true); setSpotifyError(null)
            })
            player.addListener('not_ready', () => setIsSpotifyReady(false))
            player.addListener('authentication_error', () =>
                setSpotifyError('Token expired. Reconnect Spotify.'))
            player.addListener('account_error', () =>
                setSpotifyError('Spotify Premium required.'))
            player.addListener('player_state_changed', (state: any) => {
                if (!state) return
                if (state.duration) setDuration(state.duration / 1000)
                const isNearEnd = state.duration > 0 && (state.duration - state.position) < 1000 && state.paused
                const now = Date.now()
                const lastEnd = (window as any)._lastSpotifyEnd ?? 0
                if (isNearEnd && lastEnd < now - 3000) {
                    ; (window as any)._lastSpotifyEnd = now
                    next(true)
                }
            })
            player.connect()
            setSpotifyPlayer(player)
        }
    }, [user])

    useEffect(() => {
        if (spotifyPlayer) spotifyPlayer.setVolume(isMuted ? 0 : volume)
    }, [volume, isMuted, spotifyPlayer])

    useEffect(() => {
        if (!spotifyPlayer || !isSpotifyReady) return
        if (isSpotify && isPlaying) spotifyPlayer.resume().catch(console.error)
        else spotifyPlayer.pause().catch(console.error)
    }, [isPlaying, isSpotify, spotifyPlayer, isSpotifyReady])

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>
        if (isSpotify && isPlaying && spotifyPlayer) {
            interval = setInterval(async () => {
                const state = await spotifyPlayer.getCurrentState()
                if (state) {
                    setProgress(state.position / state.duration)
                    if (Math.abs(state.duration / 1000 - duration) > 0.5)
                        setDuration(state.duration / 1000)
                }
            }, 1000)
        }
        return () => clearInterval(interval)
    }, [isSpotify, isPlaying, spotifyPlayer, duration])

    useEffect(() => {
        if (!currentTrack || !isSpotify || !isSpotifyReady || !spotifyDeviceId) return
        const token = localStorage.getItem(SPOTIFY_TOKEN_KEY)
        const spotifyId = extractSpotifyId(currentTrack.url)
        if (spotifyId) {
            fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
                method: 'PUT',
                body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }),
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            })
        }
    }, [currentTrack?.url, isSpotify, isSpotifyReady, spotifyDeviceId])

    // ─── Local Audio ───
    useEffect(() => {
        if (!isLocal || !localAudioRef.current) return
        const audio = localAudioRef.current
        audio.volume = isMuted ? 0 : volume
        if (isPlaying) audio.play().catch(e => {
            if (e.name === 'NotAllowedError') setPlayerError('Click play to enable audio')
        })
        else audio.pause()
    }, [isLocal, isPlaying, volume, isMuted, currentTrack?.url])

    const { login: spotifyLogin } = useSpotifyAuth()
    if (!currentTrack) return null

    const videoContainerStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: '92px',
        right: '24px',
        width: '320px',
        aspectRatio: '16/9',
        zIndex: 100,
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 20px 48px -12px rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.15)',
        backgroundColor: '#000',
        transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        display: isEmbedPlatform ? 'block' : 'none',
        opacity: (showVideo && !isYoutubeMusic) ? 1 : 0,
        pointerEvents: (showVideo && !isYoutubeMusic) ? 'auto' : 'none',
        transform: (showVideo && !isYoutubeMusic) ? 'translate(0,0) scale(1)' : 'translate(0,40px) scale(0.95)',
        visibility: isEmbedPlatform ? 'visible' : 'hidden',
    }

    return (
        <>
            {/* ── Video popup ── */}
            {hasMounted && isEmbedPlatform && activeUrl && (
                <div style={videoContainerStyle} aria-hidden={!showVideo}>
                    <div className="flex flex-col h-full">
                        <div className="bg-black/80 px-3 py-1.5 flex items-center justify-between border-b border-white/10">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                {isYoutubeMusic ? 'YouTube Music' : isYoutube ? 'YouTube' : isSoundCloud ? 'SoundCloud' : 'Apple Music'} Player
                            </span>
                            <button
                                onClick={() => setShowVideo(false)}
                                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                                title="Hide"
                            >
                                <VolumeX size={10} className="rotate-45" />
                            </button>
                        </div>

                        <div className="flex-1 relative bg-black">
                            {isYoutube ? (() => {
                                const videoId = extractVideoId(currentTrack.url)
                                if (!videoId) return (
                                    <div className="flex flex-col items-center justify-center h-full text-muted gap-2 p-4 text-center">
                                        <Music2 size={24} />
                                        <div className="text-xs font-mono uppercase">Invalid YouTube ID</div>
                                        <a href={currentTrack.url} target="_blank" rel="noopener noreferrer"
                                            className="text-[10px] text-accent hover:underline">Open Original</a>
                                    </div>
                                )
                                return (
                                    <>
                                        {/* ── Error overlay shown when YouTube sends onError event ── */}
                                        {playerError && (
                                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/90 gap-3 p-4 text-center">
                                                <div className="text-xs text-red-400 font-mono leading-relaxed">{playerError}</div>
                                                <a
                                                    href={currentTrack.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    <ExternalLink size={11} />
                                                    Open on {isYoutubeMusic ? 'YouTube Music' : 'YouTube'}
                                                </a>
                                            </div>
                                        )}
                                        <iframe
                                            id="youtube-player"
                                            key={currentTrack.id}
                                            // FIX: use buildYouTubeEmbedUrl — no encodeURIComponent on origin
                                            src={buildYouTubeEmbedUrl(videoId)}
                                            className="w-full h-full border-0"
                                            allow="autoplay; encrypted-media; fullscreen"
                                            allowFullScreen
                                            onLoad={() => {
                                                // onLoad doesn't mean ready — we wait for onReady postMessage
                                                // But set a fallback in case onReady never fires
                                                setIsBuffering(false)
                                            }}
                                        />
                                    </>
                                )
                            })() : isSoundCloud ? (
                                <iframe
                                    key={currentTrack.id}
                                    src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(activeUrl)}&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=true&color=%23ff5500`}
                                    className="w-full h-full border-0"
                                    allow="autoplay"
                                    onLoad={() => { setPlayReady(true); setIsBuffering(false) }}
                                />
                            ) : isApple ? (
                                <iframe
                                    key={currentTrack.id}
                                    src={activeUrl.replace('music.apple.com', 'embed.music.apple.com')}
                                    className="w-full h-full border-0"
                                    allow="autoplay; encrypted-media; fullscreen"
                                    onLoad={() => { setPlayReady(true); setIsBuffering(false) }}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Player bar ── */}
            <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-xl border-t border-border p-4 z-50 animate-slideUp">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">

                    {/* Track Info */}
                    <div className="flex items-center gap-4 w-1/4 min-w-0">
                        <div className="w-14 h-14 rounded-lg bg-surface2 border border-border overflow-hidden relative flex-shrink-0 group">
                            {currentTrack.thumbnail ? (
                                <>
                                    <Image src={currentTrack.thumbnail} alt={currentTrack.title} fill
                                        className="object-cover group-hover:scale-110 transition-transform duration-500" />
                                    {isEmbedPlatform && !isYoutubeMusic && (
                                        <button onClick={() => setShowVideo(v => !v)}
                                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            title={showVideo ? 'Hide Video' : 'Show Video'}>
                                            <Music2 size={18} className="text-white" />
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center justify-center w-full h-full text-muted"><Music2 size={20} /></div>
                            )}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 group/title">
                                <div className="font-display font-bold text-sm truncate">{currentTrack.title}</div>
                                <a href={currentTrack.url} target="_blank" rel="noopener noreferrer"
                                    className="text-muted/40 hover:text-white transition-colors opacity-0 group-hover/title:opacity-100"
                                    title={`Open on ${platformDisplayName(currentTrack.platform)}`}>
                                    <ExternalLink size={12} />
                                </a>
                            </div>
                            <div className="font-mono-custom text-xs text-muted truncate">{currentTrack.artist}</div>

                            {/* Status line */}
                            {isEmbedPlatform && (
                                <div className="mt-1">
                                    {playerError ? (
                                        <div className="text-[10px] text-red-400 font-mono truncate flex items-center gap-1" title={playerError}>
                                            ⚠ {playerError}
                                        </div>
                                    ) : isBuffering ? (
                                        <div className="flex items-center gap-1 text-[10px] text-muted font-mono">
                                            <Loader2 size={9} className="animate-spin" /> Loading…
                                        </div>
                                    ) : !isYoutubeMusic ? (
                                        <button
                                            onClick={() => setShowVideo(v => !v)}
                                            className={`text-[9px] font-mono-custom uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors
                                                ${showVideo ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/10 text-muted hover:text-white'}`}
                                        >
                                            {showVideo ? 'Hide Video' : 'Show Video'}
                                        </button>
                                    ) : (
                                        <div className="text-[9px] text-accent font-mono uppercase tracking-wider">Audio Mode</div>
                                    )}
                                </div>
                            )}

                            {isSpotify && (
                                <div className="mt-1">
                                    {!isSpotifyReady ? (
                                        spotifyError ? (
                                            <div className="flex flex-col gap-0.5">
                                                <div className="text-[9px] text-red-400 font-mono uppercase leading-tight">{spotifyError}</div>
                                                <button onClick={() => spotifyLogin()}
                                                    className="text-[10px] text-primary hover:underline font-bold text-left uppercase">
                                                    Connect Spotify
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-muted animate-pulse font-mono flex items-center gap-1.5 uppercase">
                                                <Loader2 size={10} className="animate-spin" /> Initializing…
                                            </div>
                                        )
                                    ) : (
                                        <div className="text-[9px] text-accent font-mono uppercase tracking-[1px]">Connected</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col items-center gap-2 flex-1 max-w-2xl">
                        <div className="flex items-center gap-6">
                            <button onClick={toggleShuffle}
                                className={`transition-colors hover:scale-110 active:scale-95 ${isShuffle ? 'text-primary' : 'text-muted hover:text-text'}`}>
                                <Shuffle size={18} />
                            </button>
                            <button onClick={() => prev()} className="text-muted hover:text-text transition-colors hover:scale-110 active:scale-95">
                                <SkipBack size={20} />
                            </button>
                            <button
                                onMouseDown={() => setHasUserInteracted(true)}
                                onClick={isPlaying ? pause : resume}
                                className="w-10 h-10 rounded-full bg-text text-bg flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-white/10 active:scale-95"
                            >
                                {isBuffering && !playerError
                                    ? <Loader2 size={18} className="animate-spin" />
                                    : isPlaying
                                        ? <Pause size={20} fill="currentColor" />
                                        : <Play size={20} fill="currentColor" className="ml-0.5" />
                                }
                            </button>
                            <button onClick={() => next()} className="text-muted hover:text-text transition-colors hover:scale-110 active:scale-95">
                                <SkipForward size={20} />
                            </button>
                            <button onClick={toggleRepeat}
                                className={`transition-colors hover:scale-110 active:scale-95 relative ${repeatMode !== 'off' ? 'text-primary' : 'text-muted hover:text-text'}`}>
                                {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                                {repeatMode !== 'off' && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
                            </button>
                        </div>

                        {/* Seek */}
                        <div className="w-full flex items-center gap-3">
                            <span className="text-[10px] font-mono-custom text-muted/50 tabular-nums w-10 text-right">
                                {formatTime(progress * duration)}
                            </span>
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer group"
                                value={[progress]} max={1} step={0.001}
                                onValueChange={(val) => {
                                    setProgress(val[0])
                                    const seekSecs = val[0] * duration
                                    if (isSpotify && spotifyPlayer) {
                                        spotifyPlayer.seek(seekSecs * 1000)
                                    } else if (isYoutube) {
                                        const iframe = document.querySelector('iframe[src*="youtube.com"]') as HTMLIFrameElement
                                        iframe?.contentWindow?.postMessage(JSON.stringify({
                                            event: 'command', func: 'seekTo', args: [seekSecs, true]
                                        }), '*')
                                    } else if (isSoundCloud && window.SC) {
                                        const iframe = document.querySelector('iframe[src*="soundcloud.com"]') as HTMLIFrameElement
                                        if (iframe) window.SC.Widget(iframe)?.seekTo(seekSecs * 1000)
                                    } else if (isLocal && localAudioRef.current) {
                                        localAudioRef.current.currentTime = seekSecs
                                    }
                                }}
                            >
                                <Slider.Track className="bg-surface2 relative grow rounded-full h-1 group-hover:h-1.5 transition-all">
                                    <Slider.Range className="absolute bg-primary rounded-full h-full" />
                                </Slider.Track>
                                <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full hover:scale-125 focus:outline-none shadow-lg opacity-0 group-hover:opacity-100 transition-all" />
                            </Slider.Root>
                            <span className="text-[10px] font-mono-custom text-muted/50 tabular-nums w-10">
                                {formatTime(duration)}
                            </span>
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

            {/* Local audio element */}
            {isLocal && (
                <audio
                    ref={localAudioRef}
                    src={currentTrack.url}
                    onEnded={() => next(true)}
                    onTimeUpdate={(e) => {
                        const a = e.currentTarget
                        if (a.duration) { setProgress(a.currentTime / a.duration); setDuration(a.duration) }
                    }}
                    onCanPlay={() => { setIsBuffering(false); setPlayReady(true) }}
                    onWaiting={() => setIsBuffering(true)}
                    onError={() => setPlayerError('Failed to load local audio file.')}
                />
            )}
        </>
    )
}
