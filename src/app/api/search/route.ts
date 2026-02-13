
import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import * as cheerio from 'cheerio'

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q')
    if (!q) {
        return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    try {
        // Basic YouTube search scraping (fallback for no API key)
        const { data } = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        })

        // Extract the first video ID found in standard JSON structure in HTML
        // This is brittle but works for MVP without API key
        const match = data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match && match[1]) {
            return NextResponse.json({
                url: `https://www.youtube.com/watch?v=${match[1]}`,
                videoId: match[1]
            })
        }

        return NextResponse.json({ error: 'No results found' }, { status: 404 })

    } catch (error) {
        console.error('Search error:', error)
        return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
}
