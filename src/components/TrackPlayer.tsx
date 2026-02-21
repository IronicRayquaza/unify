
'use client'

import { Track } from '@/types'
import { extractSpotifyId, extractVideoId } from '@/lib/platform'
import { useEffect, useState } from 'react'
import { Loader2, Zap, ExternalLink, Music2 } from 'lucide-react'
import Link from 'next/link'
import { usePlayer } from '@/lib/player-context'
import clsx from 'clsx'

interface Props {
    track: Track
    autoPlay?: boolean
}

export function TrackPlayer({ track, autoPlay = false }: Props) {
    const { play, currentTrack, isPlaying: globalIsPlaying } = usePlayer()
    const isCurrent = currentTrack?.id === track.id
    // If it's current, we consider it "Active Globally" regardless of play/pause
    const isGlobalActive = isCurrent
    const [isReady, setIsReady] = useState(false)
    const [resolving, setResolving] = useState(false)

    // Hydration fix
    useEffect(() => setIsReady(true), [])
    if (!isReady) return <div className="h-20 bg-surface2/50 rounded-xl animate-pulse" />

    const handleSwitchToFull = async () => {
        setResolving(true)
        try {
            const q = `${track.artist} - ${track.title} audio`
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
            if (res.ok) {
                const data = await res.json()
                const ytUrl = data.url
                if (ytUrl) {
                    // Update global player with the new YouTube URL
                    play({
                        ...track,
                        url: ytUrl,
                        platform: 'youtube'
                    })
                }
            } else {
                alert('Could not find a full audio source for this track.')
            }
        } catch (err) {
            console.error('Failed to resolve full audio:', err)
            alert('Failed to resolve full audio.')
        } finally {
            setResolving(false)
        }
    }

    // 1. YouTube & SoundCloud (Use Native Iframes if NOT active in global player)
    if (track.platform === 'youtube' || track.platform === 'ytmusic') {
        if (isGlobalActive) {
            return (
                <div className="flex flex-col items-center justify-center gap-4 py-8 bg-surface2/50 rounded-xl border border-accent/20">
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                        <Loader2 className={clsx(globalIsPlaying && "animate-spin", "text-accent")} size={24} />
                    </div>
                    <div className="text-center">
                        <div className="font-display font-bold text-sm text-accent">
                            {globalIsPlaying ? 'Playing via Global Engine' : 'Active on Global Player'}
                        </div>
                        <div className="font-mono-custom text-[9px] text-muted uppercase tracking-widest mt-1">Controls active in bottom bar</div>
                    </div>
                </div>
            )
        }

        const id = extractVideoId(track.url)
        return (
            <div className="flex flex-col gap-2">
                <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-black group">
                    <iframe
                        src={`https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`}
                        className="w-full h-full border-0"
                        allow="autoplay; encrypted-media; fullscreen"
                        allowFullScreen
                    />
                    <Link
                        href={`/watch/${id}`}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md"
                        title="Direct Watch Mode"
                    >
                        <ExternalLink size={14} />
                    </Link>
                </div>
            </div>
        )
    }

    if (track.platform === 'soundcloud') {
        if (isGlobalActive) {
            return (
                <div className="flex flex-col items-center justify-center gap-4 py-8 bg-surface2/50 rounded-xl border border-accent/20">
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                        <Loader2 className={clsx(globalIsPlaying && "animate-spin", "text-accent")} size={24} />
                    </div>
                    <div className="text-center">
                        <div className="font-display font-bold text-sm text-accent">
                            {globalIsPlaying ? 'Playing via Global Engine' : 'Active on Global Player'}
                        </div>
                        <div className="font-mono-custom text-[9px] text-muted uppercase tracking-widest mt-1">Controls active in bottom bar</div>
                    </div>
                </div>
            )
        }
        return (
            <iframe
                width="100%"
                height="166"
                scrolling="no"
                frameBorder="no"
                allow="autoplay"
                src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(track.url)}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`}
                className="rounded-xl border border-border"
            />
        )
    }

    // 2. Removed Forced Full Audio Mode - Handled by Global Player Trigger

    // 3. Spotify Embed with "Full Song" Option
    if (track.platform === 'spotify') {
        const id = extractSpotifyId(track.url)

        if (isGlobalActive) {
            return (
                <div className="flex flex-col items-center justify-center gap-4 py-8 bg-surface2/50 rounded-xl border border-accent/20">
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                        <Loader2 className={clsx(globalIsPlaying && "animate-spin", "text-accent")} size={24} />
                    </div>
                    <div className="text-center">
                        <div className="font-display font-bold text-sm text-accent">
                            {globalIsPlaying ? 'Connected to Global Engine' : 'Active on Global Player'}
                        </div>
                        <div className="font-mono-custom text-[9px] text-muted uppercase tracking-widest mt-1">Controls active in bottom bar</div>
                    </div>
                </div>
            )
        }

        return (
            <div className="flex flex-col gap-2">
                {id ? (
                    <iframe
                        src={`https://open.spotify.com/embed/track/${id}?utm_source=generator`}
                        width="100%"
                        height="152"
                        frameBorder="0"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        loading="lazy"
                        className="rounded-xl bg-surface2"
                    />
                ) : (
                    <div className="p-4 text-xs text-red-400">Invalid Spotify URL</div>
                )}

                <button
                    onClick={handleSwitchToFull}
                    disabled={resolving}
                    className="group/btn relative flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 hover:border-accent/40 transition-all duration-300 w-full disabled:opacity-40"
                >
                    <div className="absolute inset-0 bg-accent/10 blur-lg opacity-0 group-hover/btn:opacity-30 transition-opacity rounded-xl" />
                    {resolving ? (
                        <Loader2 size={12} className="animate-spin text-accent" />
                    ) : (
                        <Zap size={12} className="text-accent group-hover/btn:scale-110 transition-transform" />
                    )}
                    <span className="relative font-mono-custom text-[9px] uppercase tracking-[2px] font-bold text-accent">
                        {resolving ? 'Resolving...' : 'Sync Full Version'}
                    </span>
                </button>
            </div>
        )
    }

    // 4. Apple Music Embed with "Full Song" Option
    if (track.platform === 'apple') {
        const embedUrl = track.url.replace('music.apple.com', 'embed.music.apple.com')
        return (
            <div className="flex flex-col gap-2">
                <iframe
                    allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                    frameBorder="0"
                    height="175"
                    style={{ width: '100%', maxWidth: '660px', overflow: 'hidden', background: 'transparent' }}
                    sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
                    src={embedUrl}
                    className="rounded-xl bg-surface2"
                />
                <button
                    onClick={handleSwitchToFull}
                    disabled={resolving}
                    className="group/btn relative flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 hover:border-accent/40 transition-all duration-300 w-full disabled:opacity-40"
                >
                    <div className="absolute inset-0 bg-accent/10 blur-lg opacity-0 group-hover/btn:opacity-30 transition-opacity rounded-xl" />
                    {resolving ? (
                        <Loader2 size={12} className="animate-spin text-accent" />
                    ) : (
                        <Zap size={12} className="text-accent group-hover/btn:scale-110 transition-transform" />
                    )}
                    <span className="relative font-mono-custom text-[9px] uppercase tracking-[2px] font-bold text-accent">
                        {resolving ? 'Resolving...' : 'Sync Full Version'}
                    </span>
                </button>
            </div>
        )
    }

    // 5. Local Files (Captured Tracks)
    if (track.platform === 'local') {
        return (
            <div className="flex flex-col gap-2">
                <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-surface2 flex items-center justify-center group">
                    <audio
                        src={track.url}
                        controls
                        className="w-[80%] h-10 opacity-70 hover:opacity-100 transition-opacity"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Music2 className="text-muted/20 w-12 h-12" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 text-center text-xs text-muted bg-surface2 rounded-xl">
            Preview not available.
        </div>
    )
}
