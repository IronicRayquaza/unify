import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    try {
        const backendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
        const response = await axios.get(`${backendUrl}/reset-cold-start`)
        return NextResponse.json(response.data)
    } catch (error: any) {
        console.warn('[Session Reset Proxy]: Backend unavailable.', error.message)
        return NextResponse.json({ success: false, error: 'Backend unreachable' })
    }
}
