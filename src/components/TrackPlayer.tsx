
'use client'

import { Track } from '@/types'
import { extractSpotifyId, extractVideoId } from '@/lib/platform'
import { useEffect, useState } from 'react'
import { Loader2, Zap, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Props {
    track: Track
    autoPlay?: boolean
}

export function TrackPlayer({ track, autoPlay = false }: Props) {
    const [isReady, setIsReady] = useState(false)
    const [forceFullAudio, setForceFullAudio] = useState(false)
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
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
                setResolvedUrl(data.url)
                setForceFullAudio(true)
            } else {
                alert('Could not find a full audio source for this track.')
            }
        } catch {
            alert('Failed to resolve full audio.')
        } finally {
            setResolving(false)
        }
    }

    // 1. YouTube & SoundCloud (Use Native Iframes)
    if (track.platform === 'youtube') {
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

    // 2. Forced Full Audio Mode (Resolved from YouTube)
    if (forceFullAudio && resolvedUrl) {
        const id = extractVideoId(resolvedUrl)
        return (
            <div className="flex flex-col gap-2">
                <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-black">
                    <iframe
                        src={`https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`}
                        className="w-full h-full border-0"
                        allow="autoplay; encrypted-media; fullscreen"
                        allowFullScreen
                    />
                </div>
                <div className="text-center font-mono-custom text-[10px] text-accent">
                    Playing full audio via YouTube
                </div>
            </div>
        )
    }

    // 3. Spotify Embed with "Full Song" Option
    if (track.platform === 'spotify') {
        const id = extractSpotifyId(track.url)

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
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-surface2 hover:bg-surface border border-border hover:border-accent/30 transition-all group w-full"
                >
                    {resolving ? <Loader2 size={12} className="animate-spin text-muted" /> : <Zap size={12} className="text-accent group-hover:fill-accent" />}
                    <span className="font-mono-custom text-[10px] text-muted group-hover:text-text uppercase tracking-wider">
                        {resolving ? 'Searching...' : 'Play Full Song (Audio Only)'}
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
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-surface2 hover:bg-surface border border-border hover:border-accent/30 transition-all group w-full"
                >
                    {resolving ? <Loader2 size={12} className="animate-spin text-muted" /> : <Zap size={12} className="text-accent group-hover:fill-accent" />}
                    <span className="font-mono-custom text-[10px] text-muted group-hover:text-text uppercase tracking-wider">
                        {resolving ? 'Searching...' : 'Play Full Song (Audio Only)'}
                    </span>
                </button>
            </div>
        )
    }

    return (
        <div className="p-4 text-center text-xs text-muted bg-surface2 rounded-xl">
            Preview not available.
        </div>
    )
}
