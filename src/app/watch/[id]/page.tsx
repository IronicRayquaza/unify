
'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Youtube, ExternalLink, Loader2 } from 'lucide-react'

export default function WatchPage() {
    const { id } = useParams()
    const router = useRouter()
    const [hasMounted, setHasMounted] = useState(false)
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        setHasMounted(true)
    }, [])

    if (!id) return null

    const videoUrl = `https://www.youtube.com/watch?v=${id}`

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-[#f0f0ff] p-8 flex flex-col gap-6">
            {/* Header */}
            <div className="max-w-4xl mx-auto w-full flex items-center justify-between animate-fadeIn">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface2 border border-border hover:border-accent/50 transition-all text-muted hover:text-text group"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="font-display font-medium text-sm">Back</span>
                </button>

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                        <Youtube size={20} />
                    </div>
                    <div>
                        <h1 className="font-display font-black text-xl tracking-tight uppercase">YT Direct Node</h1>
                        <p className="font-mono text-[9px] tracking-[2px] text-muted uppercase">Isolated Playback Environment</p>
                    </div>
                </div>
            </div>

            {/* Video Player Area */}
            <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col gap-6 animate-slideUp">
                <div className="relative aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-black">
                    {!isReady && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface2">
                            <Loader2 size={32} className="text-accent animate-spin" />
                            <p className="font-mono text-xs text-muted">SYNCHRONIZING WITH YOUTUBE API...</p>
                        </div>
                    )}

                    {hasMounted && (
                        <iframe
                            src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
                            className="w-full h-full"
                            allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                            allowFullScreen
                            onLoad={() => setIsReady(true)}
                        />
                    )}
                </div>

                {/* Metadata & Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                    <div className="p-6 rounded-2xl bg-surface border border-border">
                        <h2 className="font-display font-bold text-lg mb-2">Technical Information</h2>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-border/50">
                                <span className="font-mono text-[10px] text-muted uppercase">Resource ID</span>
                                <span className="font-mono text-xs text-accent">{id}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-border/50">
                                <span className="font-mono text-[10px] text-muted uppercase">Engine</span>
                                <span className="font-mono text-xs">ReactPlayer / IFrameAPI</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-surface2 border border-border flex flex-col justify-center gap-4">
                        <p className="text-xs text-muted leading-relaxed">
                            This route bypasses the Global Player context and state management to provide a clean environment for YouTube playback testing.
                        </p>
                        <a
                            href={videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-bg font-display font-bold text-sm hover:shadow-lg hover:shadow-accent/20 transition-all"
                        >
                            <ExternalLink size={16} />
                            Open on YouTube
                        </a>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn { animation: fadeIn 0.6s ease-out forwards; }
                .animate-slideUp { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .bg-surface { background-color: #111118; }
                .bg-surface2 { background-color: #1a1a24; }
                .border-border { border-color: #2a2a3a; }
                .text-accent { color: #c8ff00; }
                .bg-accent { background-color: #c8ff00; }
                .text-bg { color: #0a0a0f; }
                .text-muted { color: #6b6b88; }
            `}</style>
        </div>
    )
}
