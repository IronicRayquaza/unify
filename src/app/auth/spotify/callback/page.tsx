
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SpotifyCallbackPage() {
    const router = useRouter()

    useEffect(() => {
        const hash = window.location.hash
        if (hash) {
            const params = new URLSearchParams(hash.substring(1))
            const token = params.get('access_token')
            if (token) {
                localStorage.setItem('spotify_access_token', token)
                router.push('/') // Redirect back to home
            }
        }
    }, [router])

    return (
        <div className="flex min-h-screen items-center justify-center bg-bg text-text">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">Connecting to Spotify...</h1>
                <p className="text-muted">Please wait while we set up your player.</p>
            </div>
        </div>
    )
}
