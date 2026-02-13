'use client'

import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '@/lib/player-context'
import Image from 'next/image'
import {
    Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
    Loader2, Music2, Shuffle, Repeat, Repeat1, Maximize2
} from 'lucide-react'
import * as Slider from '@radix-ui/react-slider'
import { extractSpotifyId, extractVideoId } from '@/lib/platform'
import { useSpotifyAuth } from '@/lib/spotify-auth'
import { useAuth } from '@/lib/auth-context'

const SPOTIFY_TOKEN_KEY = 'spotify_access_token'

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
    }
}

export function GlobalPlayer() {
    const { user } = useAuth()
    const {
        currentTrack, isPlaying, pause, resume, next, prev,
        volume, isMuted, isShuffle, repeatMode,
        setVolume, toggleMute, toggleShuffle, toggleRepeat
    } = usePlayer()

    // Platform Helpers
    const isYoutube = currentTrack?.platform === 'youtube'
    const isSoundCloud = currentTrack?.platform === 'soundcloud'
    const isSpotify = currentTrack?.platform === 'spotify'
    const isApple = currentTrack?.platform === 'apple'
    const isEmbedPlatform = isYoutube || isSoundCloud || isApple

    const [progress, setProgress] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isBuffering, setIsBuffering] = useState(false)
    const [hasUserInteracted, setHasUserInteracted] = useState(false)
    const [playerError, setPlayerError] = useState<string | null>(null)
    const [playReady, setPlayReady] = useState(false)
    const [showVideo, setShowVideo] = useState(true)
    const [hasMounted, setHasMounted] = useState(false)

    useEffect(() => {
        setHasMounted(true)
    }, [])

    // Hidden container styles (default) vs Popup styles
    const videoContainerStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: '100px',
        left: '24px',
        width: '400px', // Slightly larger
        height: '225px', // 16:9 ratio
        zIndex: 100,
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        backgroundColor: '#000',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        display: isEmbedPlatform ? 'block' : 'none',
        opacity: showVideo && isEmbedPlatform ? 1 : 0,
        pointerEvents: showVideo && isEmbedPlatform ? 'auto' : 'none',
        transform: showVideo && isEmbedPlatform ? 'translateY(0)' : 'translateY(20px)',
    }

    // YouTube specific: Force playReady to true after 2s if it's still false 
    // This solves cases where onReady never fires but the player is actually loaded.
    useEffect(() => {
        if (isYoutube && isPlaying && !playReady) {
            const timer = setTimeout(() => {
                console.log('[GlobalPlayer] YouTube playReady fallback triggered')
                setPlayReady(true)
            }, 2000)
            return () => clearTimeout(timer)
        }
    }, [isYoutube, isPlaying, playReady])

    // Custom Audio Player State
    const playerRef = useRef<any>(null)

    // Spotify SDK State
    const [spotifyPlayer, setSpotifyPlayer] = useState<any>(null)
    const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null)
    const [isSpotifyReady, setIsSpotifyReady] = useState(false)
    const [spotifyError, setSpotifyError] = useState<string | null>(null)

    // ─── Mark user interaction (needed to unlock autoplay) ───
    useEffect(() => {
        if (isPlaying) setHasUserInteracted(true)
    }, [isPlaying])

    useEffect(() => {
        const handler = () => setHasUserInteracted(true)
        window.addEventListener('click', handler)
        return () => window.removeEventListener('click', handler)
    }, [])

    // ─── Handle Track Ending & Progress (YouTube) ───
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin === 'https://www.youtube.com' || event.origin === 'https://www.youtube-nocookie.com') {
                try {
                    const data = JSON.parse(event.data)

                    // Detect Ended (Multiple API variations)
                    const isEnded = (data.event === 'onStateChange' && (data.info === 0 || data.data === 0)) ||
                        (data.event === 'infoDelivery' && data.info?.playerState === 0);

                    if (isEnded) {
                        console.log('[GlobalPlayer] YouTube Track Ended')
                        next(true)
                    }

                    // Capture Duration & Progress from info delivery
                    if (data.event === 'infoDelivery' && data.info) {
                        if (data.info.duration) setDuration(data.info.duration)
                        if (data.info.currentTime && (data.info.duration || duration)) {
                            setProgress(data.info.currentTime / (data.info.duration || duration))
                        }
                    }
                } catch (e) { }
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [next, duration])

    // ─── Progress Watchdog (Fallback skip) ───
    useEffect(() => {
        // If progress hits 99.5%, trigger next after a short delay to be safe
        if (progress > 0.995 && isPlaying) {
            const timer = setTimeout(() => {
                console.log('[GlobalPlayer] Watchdog: Track ended (Progress 100%)')
                next(true)
            }, 1500)
            return () => clearTimeout(timer)
        }
    }, [progress, isPlaying, next])

    // ─── SoundCloud Widget API Listener & Control ───
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

        const setupSCControl = () => {
            const iframe = document.querySelector('iframe[src*="soundcloud.com"]') as HTMLIFrameElement
            if (iframe && window.SC) {
                try {
                    const widget = window.SC.Widget(iframe)
                    if (widget) {
                        // Volume Sync (SC uses 0-100)
                        widget.setVolume(isMuted ? 0 : volume * 100)

                        // Play/Pause Sync
                        if (isPlaying) widget.play()
                        else widget.pause()

                        // Bind events only once by unbinding first or checking
                        widget.unbind(window.SC.Widget.Events.FINISH)
                        widget.bind(window.SC.Widget.Events.FINISH, () => {
                            console.log('[GlobalPlayer] SoundCloud Track Ended')
                            next(true)
                        })

                        widget.unbind(window.SC.Widget.Events.PLAY_PROGRESS)
                        widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (data: any) => {
                            const p = data.relativePosition
                            if (p > 0) {
                                setProgress(p)
                                // Only update duration if it changes significantly
                                const newDur = data.currentPosition / p / 1000
                                if (Math.abs(newDur - duration) > 1) setDuration(newDur)
                            }
                        })
                    }
                } catch (e) {
                    console.warn('[GlobalPlayer] SoundCloud widget not ready')
                }
            }
        }

        const timer = setTimeout(setupSCControl, 500)
        return () => clearTimeout(timer)
    }, [isSoundCloud, currentTrack?.id, hasMounted, next, isPlaying, volume, isMuted])

    // ─── YouTube Remote Control Sync ───
    useEffect(() => {
        if (!isYoutube || !hasMounted || !playReady) return

        const iframe = document.querySelector('iframe[src*="youtube.com"]') as HTMLIFrameElement
        if (!iframe || !iframe.contentWindow) return

        const command = isPlaying ? 'playVideo' : 'pauseVideo'
        iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: command,
            args: []
        }), '*')

        // Volume Sync (YouTube uses 0-100)
        iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [isMuted ? 0 : volume * 100]
        }), '*')

    }, [isYoutube, isPlaying, volume, isMuted, hasMounted, currentTrack?.id, playReady])

    // ─── Reset state when track changes ───
    useEffect(() => {
        setProgress(0)
        setDuration(0)
        setPlayReady(false)
        setIsBuffering(false)
        setPlayerError(null)
    }, [currentTrack?.url])

    // ─── Resolve SoundCloud short links ───
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)

    useEffect(() => {
        if (!currentTrack?.url) {
            setResolvedUrl(null)
            return
        }
        if (isSoundCloud && (currentTrack.url.includes('on.soundcloud.com') || currentTrack.url.includes('soundcloud.app.goo.gl'))) {
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
            if (id) return `https://www.youtube.com/watch?v=${id}`
        }
        return resolvedUrl ?? currentTrack?.url
    })()

    // For YouTube, we bypass playReady to avoid getting stuck if onReady is delayed
    const shouldPlay = isPlaying && hasUserInteracted && playReady

    // Debugging state
    useEffect(() => {
        if (isYoutube && activeUrl) {
            console.log('[GlobalPlayer] YouTube State:', { activeUrl, shouldPlay, isPlaying, hasUserInteracted, playReady })
        }
    }, [activeUrl, shouldPlay, isPlaying, hasUserInteracted, playReady, isYoutube])

    // Initialize Spotify SDK
    useEffect(() => {
        if (!user) return
        if (document.getElementById('spotify-player-sdk')) return

        const script = document.createElement('script')
        script.id = 'spotify-player-sdk'
        script.src = 'https://sdk.scdn.co/spotify-player.js'
        script.async = true
        document.body.appendChild(script)

        window.onSpotifyWebPlaybackSDKReady = () => {
            const token = localStorage.getItem(SPOTIFY_TOKEN_KEY)
            if (!token) {
                setSpotifyError('Connect Spotify to enable playback.')
                return
            }

            const player = new window.Spotify.Player({
                name: 'UNIFY Web Player',
                getOAuthToken: (cb: any) => { cb(token); },
                volume: volume
            })

            player.addListener('ready', ({ device_id }: any) => {
                setSpotifyDeviceId(device_id)
                setIsSpotifyReady(true)
                setSpotifyError(null)
            })

            player.addListener('not_ready', ({ device_id }: any) => {
                setIsSpotifyReady(false)
            })

            player.addListener('authentication_error', () => {
                setSpotifyError('Authentication failed. Token might be expired.')
            })
            player.addListener('account_error', () => {
                setSpotifyError('Premium account required for Spotify.')
            })

            player.addListener('player_state_changed', (state: any) => {
                if (!state) return
                if (state.duration) setDuration(state.duration / 1000)

                // Improved End-of-Track Detection
                const isNearEnd = state.duration > 0 && (state.duration - state.position) < 1000 && state.paused
                const isAtStart = state.position === 0 && state.paused && !state.loading

                const now = Date.now()
                const lastEnd = (window as any)._lastSpotifyEnd || 0

                if ((isAtStart || isNearEnd) && lastEnd < now - 3000) {
                    if (isNearEnd || (isAtStart && state.track_window?.previous_tracks?.length > 0)) {
                        (window as any)._lastSpotifyEnd = now
                        console.log('[GlobalPlayer] Spotify Auto-Advance Triggered', { isNearEnd, isAtStart })
                        next(true)
                    }
                }
            })

            player.connect()
            setSpotifyPlayer(player)
        }
    }, [user])

    // Update Spotify Volume
    useEffect(() => {
        if (spotifyPlayer) {
            spotifyPlayer.setVolume(isMuted ? 0 : volume)
        }
    }, [volume, isMuted, spotifyPlayer])

    // Sync Play/Pause with Spotify SDK
    useEffect(() => {
        if (!spotifyPlayer || !isSpotifyReady) return

        if (isSpotify && isPlaying) {
            spotifyPlayer.resume().catch((e: any) => console.error('Spotify Resume Error:', e))
        } else {
            // Pause if not playing OR if we've switched to a different platform
            spotifyPlayer.pause().catch((e: any) => console.error('Spotify Pause Error:', e))
        }
    }, [isPlaying, isSpotify, spotifyPlayer, isSpotifyReady])

    // Poll Spotify Progress
    useEffect(() => {
        let interval: any
        if (isSpotify && isPlaying && spotifyPlayer) {
            interval = setInterval(async () => {
                const state = await spotifyPlayer.getCurrentState()
                if (state) {
                    setProgress(state.position / state.duration)
                    if (state.duration / 1000 !== duration) setDuration(state.duration / 1000)
                }
            }, 1000)
        }
        return () => clearInterval(interval)
    }, [isSpotify, isPlaying, spotifyPlayer, duration])

    // Handle Spotify Playback start
    useEffect(() => {
        if (!currentTrack || !isSpotify || !isSpotifyReady || !spotifyDeviceId) return

        const token = localStorage.getItem(SPOTIFY_TOKEN_KEY)
        const spotifyId = extractSpotifyId(currentTrack.url)
        if (spotifyId) {
            fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
                method: 'PUT',
                body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
            })
        }
    }, [currentTrack?.url, isSpotify, isSpotifyReady, spotifyDeviceId])

    const { login: spotifyLogin } = useSpotifyAuth()

    if (!user || !currentTrack) return null

    return (
        <>
            {hasMounted && isEmbedPlatform && activeUrl && (
                <div style={videoContainerStyle} aria-hidden={!showVideo}>
                    <div className="flex flex-col h-full">
                        <div className="bg-black/80 px-3 py-1.5 flex items-center justify-between border-b border-white/10">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                {isYoutube ? 'YouTube' : isSoundCloud ? 'SoundCloud' : 'Apple Music'} Player
                            </span>
                            <button
                                onClick={() => setShowVideo(false)}
                                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                            >
                                <VolumeX size={10} className="rotate-45" />
                            </button>
                        </div>
                        <div className="flex-1 relative bg-black">
                            {isYoutube ? (
                                <iframe
                                    key={currentTrack.id}
                                    src={`https://www.youtube.com/embed/${extractVideoId(currentTrack.url)}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                                    className="w-full h-full border-0"
                                    allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                                    allowFullScreen
                                    onLoad={() => {
                                        console.log('[GlobalPlayer] YouTube Iframe Loaded')
                                        setPlayReady(true)
                                        setIsBuffering(false)
                                    }}
                                />
                            ) : isSoundCloud ? (
                                <iframe
                                    key={currentTrack.id}
                                    src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(activeUrl)}&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=true&color=%23ff5500`}
                                    className="w-full h-full border-0"
                                    allow="autoplay"
                                    onLoad={() => {
                                        console.log('[GlobalPlayer] SoundCloud Iframe Loaded')
                                        setPlayReady(true)
                                        setIsBuffering(false)
                                    }}
                                />
                            ) : isApple ? (
                                <iframe
                                    key={currentTrack.id}
                                    src={activeUrl.replace('music.apple.com', 'embed.music.apple.com')}
                                    className="w-full h-full border-0"
                                    allow="autoplay; encrypted-media; fullscreen"
                                    style={{ borderRadius: '0' }}
                                    onLoad={() => {
                                        setPlayReady(true)
                                        setIsBuffering(false)
                                    }}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-xl border-t border-border p-4 z-50 animate-slideUp">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">

                    {/* Track Info */}
                    <div className="flex items-center gap-4 w-1/4 min-w-0">
                        <div className="w-14 h-14 rounded-lg bg-surface2 border border-border overflow-hidden relative flex-shrink-0 group">
                            {currentTrack.thumbnail ? (
                                <>
                                    <Image src={currentTrack.thumbnail} alt={currentTrack.title} fill className="object-cover group-hover:scale-110 transition-transform duration-500" />
                                    {isYoutube && (
                                        <button
                                            onClick={() => setShowVideo(!showVideo)}
                                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            title="Show Video"
                                        >
                                            <Maximize2 size={18} className="text-white" />
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center justify-center w-full h-full text-muted"><Music2 size={20} /></div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="font-display font-bold text-sm truncate hover:text-primary transition-colors cursor-default">{currentTrack.title}</div>
                            <div className="font-mono-custom text-xs text-muted truncate hover:text-white transition-colors cursor-default">{currentTrack.artist}</div>

                            {isSpotify && (
                                <div className="mt-1">
                                    {!isSpotifyReady ? (
                                        <div className="flex flex-col gap-1">
                                            {spotifyError ? (
                                                <>
                                                    <div className="text-[9px] text-red-400 font-mono tracking-tight leading-tight uppercase">
                                                        {spotifyError}
                                                    </div>
                                                    <button onClick={() => spotifyLogin()} className="text-[10px] text-primary hover:underline font-bold text-left uppercase">
                                                        Connect Spotify
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="text-[10px] text-muted animate-pulse font-mono flex items-center gap-1.5 uppercase">
                                                    <Loader2 size={10} className="animate-spin" />
                                                    Initializing...
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-[9px] text-accent font-mono uppercase tracking-[1px]">Connected to SDK</div>
                                    )}
                                </div>
                            )}

                            {(isEmbedPlatform) && (
                                <div className="mt-1">
                                    {playerError ? (
                                        <div className="text-[10px] text-red-400 font-mono truncate" title={playerError}>⚠ {playerError}</div>
                                    ) : isBuffering ? (
                                        <div className="flex items-center gap-1 text-[10px] text-muted font-mono"><Loader2 size={9} className="animate-spin" /> Loading…</div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col items-center gap-2 flex-1 max-w-2xl">
                        <div className="flex items-center gap-6">
                            <button onClick={toggleShuffle} className={`transition-colors hover:scale-110 active:scale-95 ${isShuffle ? 'text-primary' : 'text-muted hover:text-text'}`}>
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
                                {isBuffering && !playerError ? <Loader2 size={18} className="animate-spin" /> : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                            </button>

                            <button onClick={() => next()} className="text-muted hover:text-text transition-colors hover:scale-110 active:scale-95">
                                <SkipForward size={20} />
                            </button>

                            <button onClick={toggleRepeat} className={`transition-colors hover:scale-110 active:scale-95 relative ${repeatMode !== 'off' ? 'text-primary' : 'text-muted hover:text-text'}`}>
                                {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                                {repeatMode !== 'off' && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
                            </button>
                        </div>

                        <div className="w-full flex items-center gap-3">
                            <span className="text-[10px] font-mono-custom text-muted/50 tabular-nums w-10 text-right">
                                {formatTime(progress * duration)}
                            </span>
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer group"
                                value={[progress]}
                                max={1}
                                step={0.001}
                                onValueChange={(val) => {
                                    setProgress(val[0])
                                    if (isSpotify && spotifyPlayer && typeof spotifyPlayer.seek === 'function') {
                                        spotifyPlayer.seek(val[0] * duration * 1000)
                                    } else if (isYoutube) {
                                        const iframe = document.querySelector('iframe[src*="youtube.com"]') as HTMLIFrameElement
                                        if (iframe?.contentWindow) {
                                            iframe.contentWindow.postMessage(JSON.stringify({
                                                event: 'command',
                                                func: 'seekTo',
                                                args: [val[0] * duration, true]
                                            }), '*')
                                        }
                                    } else if (isSoundCloud && window.SC) {
                                        const iframe = document.querySelector('iframe[src*="soundcloud.com"]') as HTMLIFrameElement
                                        if (iframe) {
                                            const widget = window.SC.Widget(iframe)
                                            widget?.seekTo(val[0] * duration * 1000)
                                        }
                                    }
                                }}
                            >
                                <Slider.Track className="bg-surface2 relative grow rounded-full h-1 group-hover:h-1.5 transition-all">
                                    <Slider.Range className="absolute bg-primary rounded-full h-full group-hover:bg-primary/80 transition-colors" />
                                </Slider.Track>
                                <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full hover:scale-125 focus:outline-none shadow-lg opacity-0 group-hover:opacity-100 transition-all" />
                            </Slider.Root>
                            <span className="text-[10px] font-mono-custom text-muted/50 tabular-nums w-10">
                                {formatTime(duration)}
                            </span>
                        </div>
                    </div>

                    {/* Volume Control */}
                    <div className="w-1/4 flex justify-end items-center gap-3">
                        <button onClick={toggleMute} className="text-muted hover:text-text transition-colors">
                            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        <Slider.Root
                            className="relative flex items-center select-none touch-none w-24 h-4 cursor-pointer group"
                            value={[isMuted ? 0 : volume]}
                            max={1}
                            step={0.01}
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

