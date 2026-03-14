import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const device_id = req.nextUrl.searchParams.get('device_id')
    const token = req.nextUrl.searchParams.get('token')
    const track_uri = req.nextUrl.searchParams.get('track_uri')

    if (!device_id || !token) {
        return NextResponse.json({ error: 'Device ID and Token are required' }, { status: 400 })
    }

    try {
        const is_hidden = req.nextUrl.searchParams.get('is_hidden') === 'true'
        const backendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
        const response = await axios.get(`${backendUrl}/spotify-kick`, {
            params: { device_id, token, track_uri, is_hidden }
        })

        return NextResponse.json(response.data)
    } catch (error: any) {
        console.warn('[Spotify Kick Proxy]: Backend unavailable.', error.message)
        return NextResponse.json({ success: false, error: 'Backend unreachable' })
    }
}
