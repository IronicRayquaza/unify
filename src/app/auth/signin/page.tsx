'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft } from 'lucide-react'

import { toast } from 'sonner'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      toast.error(error.message)
      setLoading(false)
    } else {
      toast.success('Signed in successfully!')
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center relative overflow-hidden">
      {/* Grid bg */}
      <div className="absolute inset-0 grid-bg opacity-30" />
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(200,255,0,0.06) 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6 animate-fadeIn">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface/50 border border-border hover:border-accent/40 text-muted hover:text-text transition-all mb-8 group backdrop-blur-sm"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-mono-custom text-[11px] tracking-wider uppercase font-bold">Back to Home</span>
        </Link>

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-5xl font-display font-black tracking-tighter mb-1"
            style={{ background: 'linear-gradient(135deg, #c8ff00, #88ff44, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            UNIFY
          </div>
          <div className="font-mono-custom text-xs tracking-[3px] uppercase text-muted">
            Universal Playlist Engine
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-6 right-6 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #c8ff00, transparent)' }} />

          <h2 className="font-display font-bold text-xl mb-1 text-center">Sign in</h2>
          <p className="font-mono-custom text-xs text-muted text-center mb-8 tracking-wide">
            Access your playlists
          </p>

          <form onSubmit={handleSignIn} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-mono-custom text-muted mb-2 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="yours@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-mono-custom text-muted mb-2 uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="text-red-500 text-xs font-mono-custom text-center bg-red-500/10 p-2 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-accent to-accent2 text-bg font-display font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border flex flex-col gap-4">
            <Link
              href="/auth/signup"
              className="block w-full text-center font-display text-sm text-text hover:text-accent transition-colors"
            >
              New here? <span className="font-bold underline decoration-accent/50 underline-offset-4">Create account</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
