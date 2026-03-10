import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url')
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

    try {
        const backendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
        const response = await axios.get(`${backendUrl}/soundcloud-resolve`, {
            params: { url }
        })

        return NextResponse.json(response.data)
    } catch (error: any) {
        console.error('[SoundCloud Resolve Proxy Error]:', error.response?.data || error.message)
        const detail = error.response?.data?.detail || error.message
        return NextResponse.json({ error: `SoundCloud Resolve Failed: ${detail}` }, { status: 500 })
    }
}
