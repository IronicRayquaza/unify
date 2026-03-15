import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { code, code_verifier, redirect_uri, client_id, grant_type, refresh_token } = body

        const resolvedClientId = client_id || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
        if (!resolvedClientId) {
            return NextResponse.json({ error: 'Missing Spotify Client ID' }, { status: 500 })
        }

        let params: Record<string, string>

        if (grant_type === 'refresh_token') {
            if (!refresh_token) {
                return NextResponse.json({ error: 'Missing refresh_token' }, { status: 400 })
            }
            params = {
                grant_type: 'refresh_token',
                refresh_token,
                client_id: resolvedClientId,
            }
        } else {
            if (!code || !code_verifier || !redirect_uri) {
                return NextResponse.json({ error: 'Missing code, code_verifier, or redirect_uri' }, { status: 400 })
            }
            params = {
                grant_type: 'authorization_code',
                code,
                redirect_uri,
                client_id: resolvedClientId,
                code_verifier,
            }
        }

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params),
        })

        const data = await response.json()
        if (!response.ok) {
            console.error('[SpotifyExchange] Spotify error:', data)
            return NextResponse.json(data, { status: response.status })
        }

        return NextResponse.json(data)
    } catch (error: any) {
        console.error('[SpotifyExchange] Server error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
