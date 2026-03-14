import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    try {
        const backendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
        const response = await axios.get(`${backendUrl}/silence`, {
            responseType: 'arraybuffer'
        })

        return new NextResponse(response.data, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache'
            }
        })
    } catch (error: any) {
        console.warn('[Silence Proxy]: Backend unavailable.', error.message)
        return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 503 })
    }
}
