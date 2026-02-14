
'use client'

import { useState, useEffect } from 'react'

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
const REDIRECT_URI = typeof window !== 'undefined'
    ? `${window.location.origin}/callback`
    : 'http://localhost:3000/callback'
const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
]

// Authorization Code Flow with PKCE
// This is the modern standard for SPAs and avoids 'unsupported_response_type' errors.

/**
 * Generates a random string for the code verifier
 */
function generateRandomString(length: number) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Hash the verifier to create the challenge
 */
async function generateCodeChallenge(codeVerifier: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...Array.from(new Uint8Array(digest))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function useSpotifyAuth() {
    const [token, setToken] = useState<string | null>(null)

    useEffect(() => {
        // Check local storage for existing token
        const stored = localStorage.getItem('spotify_access_token')
        // Optional: Check expiration here if you stored it
        if (stored) setToken(stored)
    }, [])

    const login = async () => {
        if (!CLIENT_ID) {
            alert('Spotify Client ID is missing.')
            return
        }

        // 1. Generate PKCE Verifier and Challenge
        const verifier = generateRandomString(128);
        const challenge = await generateCodeChallenge(verifier);

        // 2. Store Verifier for the callback step
        localStorage.setItem('spotify_code_verifier', verifier);

        console.log('Redirecting via PKCE flow with URI:', REDIRECT_URI)

        // 3. Redirect to Spotify
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: 'code', // key change: code instead of token
            redirect_uri: REDIRECT_URI,
            scope: SCOPES.join(' '),
            code_challenge_method: 'S256',
            code_challenge: challenge,
        });

        window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
    }

    const logout = () => {
        localStorage.removeItem('spotify_access_token')
        localStorage.removeItem('spotify_code_verifier')
        localStorage.removeItem('spotify_refresh_token')
        setToken(null)
    }

    return { token, login, logout }
}
