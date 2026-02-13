import { NextRequest, NextResponse } from 'next/server'

// Resolves redirect URLs like https://on.soundcloud.com/XYZ
// to their full canonical URL https://soundcloud.com/artist/track

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url')
    if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

    try {
        // Follow redirects using fetch with redirect: 'follow'
        const res = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            headers: {
                // Mimic a browser to avoid bot detection
                'User-Agent': 'Mozilla/5.0 (compatible; UNIFY/1.0)'
            }
        })
        // The final URL after redirects is the resolved URL
        const resolved = res.url
        return NextResponse.json({ resolved })
    } catch {
        // Return the original URL as fallback
        return NextResponse.json({ resolved: url })
    }
}
