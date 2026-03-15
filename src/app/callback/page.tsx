
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
const REDIRECT_URI = typeof window !== 'undefined'
    ? `${window.location.origin}/callback`
    : 'https://unify-phi.vercel.app/callback'

export default function CallbackPage() {
    const router = useRouter()
    const [status, setStatus] = useState('Processing...')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const processCallback = async () => {
            const queryParams = new URLSearchParams(window.location.search)
            const errorParam = queryParams.get('error')
            const code = queryParams.get('code')
            const stateRaw = queryParams.get('state')

            if (errorParam) {
                setError('Spotify connection failed: ' + errorParam)
                setStatus('Error')
                return
            }

            if (!code || !stateRaw) {
                setError('Missing code or state parameters.')
                setStatus('Failed')
                return
            }

            let verifier: string | null = null
            let sessionKey: string | null = null
            try {
                const parsed = JSON.parse(atob(stateRaw))
                verifier = parsed.verifier
                sessionKey = parsed.key
            } catch (err) {
                console.error('State parsing error:', err)
                setError('Invalid state parameter.')
                setStatus('Failed')
                return
            }

            if (!verifier || !sessionKey) {
                setError('Missing verifier or session key in state.')
                setStatus('Failed')
                return
            }

            setStatus('Exchanging code for token...')

            try {
                const response = await fetch('/api/spotify/exchange', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code,
                        code_verifier: verifier,
                        redirect_uri: REDIRECT_URI,
                    })
                })

                const tokens = await response.json()

                if (!response.ok || tokens.error) {
                    throw new Error(tokens.error_description || tokens.error || 'Token exchange failed')
                }

                console.log('Token exchange successful')
                
                // Store in localStorage as well (legacy/local backup)
                localStorage.setItem('spotify_access_token', tokens.access_token)
                if (tokens.refresh_token) {
                    localStorage.setItem('spotify_refresh_token', tokens.refresh_token)
                }
                const expiryTime = Date.now() + (tokens.expires_in * 1000)
                localStorage.setItem('spotify_token_expiry', expiryTime.toString())

                if (window.opener) {
                    window.opener.postMessage({
                        type: 'spotify-auth',
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token,
                        expiresIn: tokens.expires_in,
                    }, '*')
                    setStatus('Connected! Closing window...')
                    setTimeout(() => window.close(), 1000)
                } else {
                    // No opener (Electron external browser) — store in Supabase temporarily
                    setStatus('Syncing with UNIFY...')
                    const { error: upsertError } = await supabase.from('spotify_auth_sessions').upsert({
                        session_key: sessionKey,
                        access_token: tokens.access_token,
                        refresh_token: tokens.refresh_token,
                        expires_in: tokens.expires_in,
                        created_at: new Date().toISOString()
                    })

                    if (upsertError) {
                        console.error('Supabase upsert error:', upsertError)
                        throw new Error('Failed to save session to relay: ' + upsertError.message)
                    }

                    setStatus('Success! You can close this tab.')
                    setTimeout(() => {
                        window.location.href = '/dashboard'
                    }, 2000)
                }
            } catch (err: any) {
                console.error(err)
                setError('Authentication Error: ' + err.message)
                setStatus('Failed')
            }
        }

        processCallback()
    }, [])

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4 text-center">
            {error ? (
                <>
                    <div className="text-red-500 text-4xl mb-4">⚠️</div>
                    <h1 className="text-xl font-bold text-red-400 mb-2">Connection Failed</h1>
                    <p className="text-gray-400 mb-6">{error}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-2 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform"
                    >
                        Return Home
                    </button>
                </>
            ) : (
                <>
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-green-500 mb-4"></div>
                    <h1 className="text-xl font-bold mb-2">Connecting to Spotify...</h1>
                    <p className="text-gray-500 text-sm mb-8">{status}</p>
                    {status.includes('Success') && (
                        <p className="text-green-500 text-sm">✅ Spotify connected! You can return to the app.</p>
                    )}
                </>
            )}
        </div>
    )
}

