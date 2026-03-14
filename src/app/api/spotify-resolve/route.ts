import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const title = req.nextUrl.searchParams.get('title')
    const artist = req.nextUrl.searchParams.get('artist')
    const duration = req.nextUrl.searchParams.get('duration') || '0'

    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    try {
        const backendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
        const response = await axios.get(`${backendUrl}/spotify-resolve`, {
            params: { title, artist, duration }
        })

        if (response.data.success && response.data.stream_url) {
            // Use the unified proxy-stream endpoint to bypass browser blocks and support seeking
            response.data.stream_url = `${backendUrl}/proxy-stream?url=${encodeURIComponent(response.data.stream_url)}`
        }

        return NextResponse.json(response.data)
    } catch (error: any) {
        const is404 = error.response?.status === 404
        console.warn(`[Spotify Resolve Proxy]: ${is404 ? 'Track not found in backend' : 'Backend unreachable'}.`, error.message)
        return NextResponse.json({ 
            success: false, 
            error: is404 ? 'Track not found' : 'Backend unreachable. Please ensure the Python server is running.' 
        })
    }
}
