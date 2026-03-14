import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    try {
        const backendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
        await axios.get(`${backendUrl}/focus-window`)
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.warn('[Focus Proxy]: Backend unavailable.', error.message)
        return NextResponse.json({ success: false, error: 'Backend unreachable' })
    }
}
