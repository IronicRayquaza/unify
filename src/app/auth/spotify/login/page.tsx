
'use client'

import { useEffect } from 'react'

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
]

function generateRandomString(length: number) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...Array.from(new Uint8Array(digest))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export default function SpotifyLoginPage() {
    useEffect(() => {
        const startLogin = async () => {
            if (!CLIENT_ID) {
                console.error('Spotify Client ID is missing in Vercel settings.')
                return
            }

            const verifier = generateRandomString(128);
            const challenge = await generateCodeChallenge(verifier);
            const redirectUri = `${window.location.origin}/callback`;

            localStorage.setItem('spotify_code_verifier', verifier);

            const params = new URLSearchParams({
                client_id: CLIENT_ID,
                response_type: 'code',
                redirect_uri: redirectUri,
                scope: SCOPES.join(' '),
                code_challenge_method: 'S256',
                code_challenge: challenge,
            });

            window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
        }

        startLogin()
    }, [])

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-green-500 mb-4"></div>
            <p className="text-gray-400">Initializing Spotify Login...</p>
        </div>
    )
}
