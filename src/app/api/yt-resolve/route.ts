import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url')
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

    try {
        const backendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
        const response = await axios.get(`${backendUrl}/youtube-resolve`, {
            params: { url }
        })

        if (response.data.success && response.data.stream_url) {
            // Use the unified proxy-stream endpoint
            response.data.stream_url = `${backendUrl}/proxy-stream?url=${encodeURIComponent(response.data.stream_url)}`
        }

        return NextResponse.json(response.data)
    } catch (error: any) {
        console.warn('[YouTube Resolve Proxy]: Backend unavailable or error. Falling back to Iframe.', error.message)
        // Return 200 with success: false so the frontend skips native audio and uses iframe
        return NextResponse.json({ success: false, error: 'Backend unreachable' })
    }
}
