
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Need to import these to access env vars or define them inside if easier
const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
// REDIRECT_URI must match exactly what was sent in the login step
const REDIRECT_URI = typeof window !== 'undefined'
    ? `${window.location.origin}/callback`
    : 'http://localhost:3000/callback'

export default function CallbackPage() {
    const router = useRouter()
    const [status, setStatus] = useState('Processing...')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const processCallback = async () => {
            // 1. Check for errors from URL params
            const queryParams = new URLSearchParams(window.location.search)
            const errorParam = queryParams.get('error')
            if (errorParam) {
                setError('Spotify connection failed: ' + errorParam)
                setStatus('Error')
                return
            }

            // 2. Check for Authorization Code (PKCE Flow)
            const code = queryParams.get('code')
            if (code) {
                setStatus('Exchanging code for token...')
                const verifier = localStorage.getItem('spotify_code_verifier')

                if (!verifier || !CLIENT_ID) {
                    setError('Refused: Missing code_verifier or Spotify Client ID. Please ensure NEXT_PUBLIC_SPOTIFY_CLIENT_ID is set in Vercel.')
                    return
                }

                try {
                    const response = await fetch('https://accounts.spotify.com/api/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: new URLSearchParams({
                            client_id: CLIENT_ID,
                            grant_type: 'authorization_code',
                            code: code,
                            redirect_uri: REDIRECT_URI,
                            code_verifier: verifier,
                        }),
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error_description || 'Token exchange failed');
                    }

                    if (data.access_token) {
                        console.log('PKCE Exchange Successful')
                        localStorage.setItem('spotify_access_token', data.access_token)
                        if (data.refresh_token) {
                            localStorage.setItem('spotify_refresh_token', data.refresh_token)
                        }

                        setStatus('Success! Redirecting...')
                        setTimeout(() => window.location.href = '/dashboard', 500)
                    } else {
                        throw new Error('No access token in response')
                    }
                } catch (err: any) {
                    console.error(err)
                    setError('Token Exchange Error: ' + err.message)
                    setStatus('Failed')
                }
                return
            }

            // 3. Fallback: Check for Hash (Legacy Implicit Flow - just in case)
            const hash = window.location.hash
            if (hash) {
                const params = new URLSearchParams(hash.substring(1))
                const token = params.get('access_token')
                if (token) {
                    localStorage.setItem('spotify_access_token', token)
                    window.location.href = '/dashboard'
                    return
                }
            }

            if (!code && !hash) {
                setError('No valid authentication code found in URL.')
                setStatus('Waiting...')
            }
        }

        processCallback()
    }, [router])

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4 text-center">
            {error ? (
                <>
                    <div className="text-red-500 text-4xl mb-4">⚠️</div>
                    <h1 className="text-xl font-bold text-red-400 mb-2">Connection Failed</h1>
                    <p className="text-gray-400 mb-6">{error}</p>

                    <div className="bg-gray-900 p-4 rounded text-left text-xs text-gray-400 font-mono mb-6 w-full max-w-lg break-all border border-gray-800">
                        <p className="font-bold text-gray-300 mb-1">Debug Info:</p>
                        <p>URL: {typeof window !== 'undefined' ? window.location.href : ''}</p>
                    </div>

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
                    <button
                        onClick={() => router.push('/')}
                        className="text-xs text-gray-600 hover:text-white underline"
                    >
                        Stuck? Click here to skip
                    </button>
                </>
            )}
        </div>
    )
}
