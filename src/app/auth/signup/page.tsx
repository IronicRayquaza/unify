'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SignUpPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName,
                }
            }
        })

        if (error) {
            setError(error.message)
            setLoading(false)
        } else {
            // Check if email confirmation is required, usually Supabase sends one. 
            // For now, we'll assume auto-confirm or just redirect to dashboard/check email page.
            // But typically signUp returns a session if auto-confirm is on, or null if not.

            // Let's create a playlist for the user immediately if we can, 
            // but creating data usually requires being logged in.

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

                    <h2 className="font-display font-bold text-xl mb-1 text-center">Create account</h2>
                    <p className="font-mono-custom text-xs text-muted text-center mb-8 tracking-wide">
                        Get started with Unify for free
                    </p>

                    <form onSubmit={handleSignUp} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs font-mono-custom text-muted mb-2 uppercase tracking-wider">Display Name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full bg-surface2 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors"
                                placeholder="Your Name"
                                required
                            />
                        </div>
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
                                minLength={6}
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
                            {loading ? 'Creating account…' : 'Sign Up'}
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-border flex flex-col gap-4">
                        <Link
                            href="/auth/signin"
                            className="block w-full text-center font-display text-sm text-text hover:text-accent transition-colors"
                        >
                            Already have an account? <span className="font-bold underline decoration-accent/50 underline-offset-4">Sign in</span>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
