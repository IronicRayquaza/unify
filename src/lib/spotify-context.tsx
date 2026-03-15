'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
const REDIRECT_URI = typeof window !== 'undefined'
    ? `${window.location.origin}/callback`
    : 'https://unify-phi.vercel.app/callback'

const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
]

interface SpotifyContextType {
    token: string | null
    isConnected: boolean
    isLoading: boolean
    login: () => Promise<void>
    logout: () => void
    refreshAccessToken: () => Promise<string | null>
}

const SpotifyContext = createContext<SpotifyContextType | undefined>(undefined)

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

export function SpotifyProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isConnected, setIsConnected] = useState(false)
    const refreshTimer = useRef<NodeJS.Timeout | null>(null)

    const logout = useCallback(() => {
        localStorage.removeItem('spotify_access_token')
        localStorage.removeItem('spotify_refresh_token')
        localStorage.removeItem('spotify_code_verifier')
        localStorage.removeItem('spotify_token_expiry')
        setToken(null)
        setIsConnected(false)
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }, [])

    const refreshAccessToken = useCallback(async () => {
        const refreshToken = localStorage.getItem('spotify_refresh_token')
        if (!refreshToken || !CLIENT_ID) {
            logout()
            return null
        }

        try {
            console.log('[SpotifyAuth] Refreshing token...')
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: CLIENT_ID,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                if (data.error === 'invalid_grant') {
                    console.error('[SpotifyAuth] Refresh token invalid or revoked.')
                    logout()
                }
                throw new Error(data.error_description || 'Failed to refresh token')
            }

            const newToken = data.access_token
            const newRefreshToken = data.refresh_token // Might be same or new
            const expiresIn = data.expires_in // usually 3600

            localStorage.setItem('spotify_access_token', newToken)
            if (newRefreshToken) {
                localStorage.setItem('spotify_refresh_token', newRefreshToken)
            }

            const expiryTime = Date.now() + (expiresIn * 1000)
            localStorage.setItem('spotify_token_expiry', expiryTime.toString())

            setToken(newToken)
            setIsConnected(true)

            // Schedule next refresh 5 minutes before expiry
            const nextRefresh = (expiresIn - 300) * 1000
            if (refreshTimer.current) clearTimeout(refreshTimer.current)
            refreshTimer.current = setTimeout(refreshAccessToken, Math.max(0, nextRefresh))

            return newToken
        } catch (err) {
            console.error('[SpotifyAuth] Refresh error:', err)
            // If it's a network error, maybe don't log out immediately
            // But if it's an auth error, logout
            return null
        }
    }, [logout])

    const validateConnection = useCallback(async (accessToken: string) => {
        try {
            const res = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            })

            if (res.status === 401) {
                // Token expired, try refresh
                const refreshed = await refreshAccessToken()
                return !!refreshed
            }

            if (res.ok) {
                setIsConnected(true)
                return true
            }

            setIsConnected(false)
            return false
        } catch (err) {
            console.error('[SpotifyAuth] Validation error:', err)
            setIsConnected(false)
            return false
        }
    }, [refreshAccessToken])

    useEffect(() => {
        const initialize = async () => {
            setIsLoading(true)
            const storedToken = localStorage.getItem('spotify_access_token')
            const expiry = localStorage.getItem('spotify_token_expiry')

            if (storedToken) {
                // Check if expired
                const isExpired = expiry ? (Date.now() > parseInt(expiry)) : true

                if (isExpired) {
                    await refreshAccessToken()
                } else {
                    setToken(storedToken)
                    // Validate it actually works
                    const valid = await validateConnection(storedToken)
                    if (valid) {
                        // Schedule refresh
                        const timeUntilExpiry = parseInt(expiry!) - Date.now()
                        const nextRefresh = timeUntilExpiry - (300 * 1000) // 5 mins before
                        if (refreshTimer.current) clearTimeout(refreshTimer.current)
                        refreshTimer.current = setTimeout(refreshAccessToken, Math.max(0, nextRefresh))
                    }
                }
            }
            setIsLoading(false)
        }

        initialize()

        return () => {
            if (refreshTimer.current) clearTimeout(refreshTimer.current)
        }
    }, [refreshAccessToken, validateConnection])

    const saveTokens = useCallback((data: { accessToken: string, refreshToken?: string, expiresIn?: number }) => {
        localStorage.setItem('spotify_access_token', data.accessToken)
        if (data.refreshToken) localStorage.setItem('spotify_refresh_token', data.refreshToken)
        if (data.expiresIn) localStorage.setItem('spotify_token_expiry', String(Date.now() + (data.expiresIn * 1000)))
        setToken(data.accessToken)
        setIsConnected(true)
        window.location.reload()
    }, [])

    const login = async () => {
        if (!CLIENT_ID) {
            alert('Spotify Client ID is missing. Please set NEXT_PUBLIC_SPOTIFY_CLIENT_ID.')
            return
        }

        const verifier = generateRandomString(128);
        const challenge = await generateCodeChallenge(verifier);
        
        // Unique key for this auth session — used to retrieve tokens from Supabase
        const sessionKey = generateRandomString(32)

        localStorage.setItem('spotify_code_verifier', verifier);
        localStorage.setItem('spotify_auth_session_key', sessionKey)

        // Embed BOTH verifier and sessionKey in state
        const state = btoa(JSON.stringify({ verifier, key: sessionKey }))

        const authUrl = new URL('https://accounts.spotify.com/authorize')
        authUrl.searchParams.set('client_id', CLIENT_ID)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
        authUrl.searchParams.set('code_challenge_method', 'S256')
        authUrl.searchParams.set('code_challenge', challenge)
        authUrl.searchParams.set('scope', SCOPES.join(' '))
        authUrl.searchParams.set('state', state)

        const width = 450, height = 730
        const left = (window.screen.width / 2) - (width / 2)
        const top = (window.screen.height / 2) - (height / 2)
        window.open(authUrl.toString(), 'Spotify Login', `width=${width},height=${height},top=${top},left=${left}`)

        // Listen via postMessage (works when popup has opener)
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type !== 'spotify-auth') return
            if (!event.data.accessToken) return
            saveTokens(event.data)
            window.removeEventListener('message', handleMessage)
        }
        window.addEventListener('message', handleMessage)

        // Poll Supabase for tokens (fallback when popup has no opener — e.g. Electron external browser)
        const pollInterval = setInterval(async () => {
            try {
                const { data, error } = await supabase
                    .from('spotify_auth_sessions')
                    .select('*')
                    .eq('session_key', sessionKey)
                    .single()

                if (data?.access_token) {
                    saveTokens({
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                        expiresIn: data.expires_in,
                    })
                    // Clean up the session record
                    await supabase
                        .from('spotify_auth_sessions')
                        .delete()
                        .eq('session_key', sessionKey)
                    
                    clearInterval(pollInterval)
                    window.removeEventListener('message', handleMessage)
                }
            } catch (err) {
                console.error('Polling error:', err)
            }
        }, 1500)

        // Stop polling after 5 minutes
        setTimeout(() => {
            clearInterval(pollInterval)
            window.removeEventListener('message', handleMessage)
        }, 300000)
    }

    return (
        <SpotifyContext.Provider value={{
            token,
            isConnected,
            isLoading,
            login,
            logout,
            refreshAccessToken
        }}>
            {children}
        </SpotifyContext.Provider>
    )
}

export function useSpotify() {
    const context = useContext(SpotifyContext)
    if (context === undefined) {
        throw new Error('useSpotify must be used within a SpotifyProvider')
    }
    return context
}
