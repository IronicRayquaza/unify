
import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * 🚀 PYTHON PROXY ENGINE
 * redirecting extraction to the specialized Python backend
 */
export async function POST(req: NextRequest) {
    console.log('[Capture API] Proxying to Python Backend...')
    try {
        const body = await req.json()
        if (!body.url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

        // Call our specialized Python extraction service
        const response = await axios.post('http://localhost:8000/capture', {
            ...body,
            mode: 'audio'
        });

        console.log('[Capture API] Python Extraction successful.');
        return NextResponse.json(response.data);

    } catch (error: any) {
        console.error('[Capture API Error]:', error.response?.data || error.message);
        const detail = error.response?.data?.detail || error.message;
        return NextResponse.json({ error: `Extraction Failed: ${detail}` }, { status: 500 });
    }
}
