'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  // If loading or already logged in, show a minimal version or nothing to prevent flicker
  if (loading || user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="font-display font-black text-4xl tracking-tighter animate-pulse"
          style={{ background: 'linear-gradient(135deg, #c8ff00, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          UNIFY
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg opacity-[0.15]" />
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] rounded-full animate-bgPulse"
          style={{ background: 'radial-gradient(circle, rgba(200,255,0,0.03) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,107,53,0.04) 0%, transparent 70%)', animationDelay: '4s' }} />
      </div>

      {/* Navbar */}
      <nav className="relative z-[100] w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent2 flex items-center justify-center">
            <svg className="w-4 h-4 text-bg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
            </svg>
          </div>
          <span className="font-display font-bold text-xl tracking-tight">UNIFY</span>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={() => router.push('/auth/signin')}
            className="font-mono-custom text-sm text-muted hover:text-accent transition-all hover:translate-y-[-1px] cursor-pointer"
          >
            Login
          </button>
          <button
            onClick={() => router.push('/auth/signup')}
            className="font-mono-custom text-sm px-6 py-2.5 rounded-full border border-accent/20 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10 transition-all font-bold cursor-pointer"
          >
            Sign Up
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center -mt-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface2/50 border border-border/50 backdrop-blur-sm mb-8 animate-fadeIn">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="font-mono-custom text-xs text-muted tracking-wide">V1.0 NOW AVAILABLE</span>
        </div>

        <h1 className="font-display font-black text-6xl md:text-8xl tracking-tighter mb-6 max-w-4xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 animate-slideDown">
          All your music.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-[#ccff00] to-accent2">
            One platform.
          </span>
        </h1>

        <p className="font-body text-muted text-lg md:text-xl max-w-xl mb-10 leading-relaxed animate-fadeIn" style={{ animationDelay: '0.2s' }}>
          Import playlists from anywhere. Manage, sort, and export with the ultimate playlist engine for power users.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 animate-fadeIn" style={{ animationDelay: '0.4s' }}>
          <Link href="/auth/signup" className="group relative px-8 py-4 bg-white text-bg font-display font-bold text-lg rounded-full hover:scale-105 transition-transform">
            <span className="relative z-10">Start for free</span>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-accent to-accent2 blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 max-w-5xl w-full text-left">
          {[
            {
              title: "Universal Import",
              desc: "Drag & drop JSON files or connect your accounts directly.",
              icon: (
                <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )
            },
            {
              title: "Smart Sorting",
              desc: "Reorder tracks with drag-and-drop or use AI-powered sort options.",
              icon: (
                <svg className="w-6 h-6 text-accent2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
              )
            },
            {
              title: "Cloud Sync",
              desc: "Your playlists are saved automatically to your account.",
              icon: (
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              )
            }
          ].map((feature, i) => (
            <div key={i} className="p-6 rounded-2xl bg-surface/50 border border-border/50 hover:border-accent/30 transition-colors backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-surface2 flex items-center justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="font-display font-bold text-lg mb-2">{feature.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-8 border-t border-border mt-20 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-muted text-sm font-mono-custom">
          © {new Date().getFullYear()} UNIFY Inc.
        </div>
        <div className="flex items-center gap-6">
          <a href="#" className="text-muted hover:text-text transition-colors text-sm">Privacy</a>
          <a href="#" className="text-muted hover:text-text transition-colors text-sm">Terms</a>
          <a href="#" className="text-muted hover:text-text transition-colors text-sm">Twitter</a>
        </div>
      </footer>
    </div>
  )
}
