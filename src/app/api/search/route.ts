
import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import * as cheerio from 'cheerio'

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q')
    if (!q) {
        return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const results: any[] = []

    try {
        // 1. YouTube Search Scraping
        try {
            const { data: ytData } = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })

            // Extract ytInitialData JSON
            const dataMatch = ytData.match(/var ytInitialData = ({.*?});<\/script>/);
            if (dataMatch) {
                const json = JSON.parse(dataMatch[1]);
                const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                const items = contents?.find((c: any) => c.itemSectionRenderer)?.itemSectionRenderer?.contents;

                if (items) {
                    let count = 0;
                    for (const item of items) {
                        if (item.videoRenderer && count < 5) {
                            const v = item.videoRenderer;
                            results.push({
                                id: v.videoId,
                                url: `https://www.youtube.com/watch?v=${v.videoId}`,
                                title: v.title?.runs?.[0]?.text || 'Unknown Title',
                                artist: v.longBylineText?.runs?.[0]?.text || 'YouTube',
                                thumbnail: v.thumbnail?.thumbnails?.[0]?.url,
                                duration: v.lengthText?.simpleText,
                                platform: 'youtube'
                            })
                            count++;
                        }
                    }
                }
            }
        } catch (ytError) {
            console.error('YouTube search error:', ytError)
        }

        // 2. SoundCloud Search (Advanced: Discover Client ID and use v2 API)
        try {
            // First, get a client_id from the main page scripts
            const { data: mainPage } = await axios.get('https://soundcloud.com', {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })
            const scriptMatch = mainPage.match(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)
            let clientId = ''

            if (scriptMatch) {
                // Check the last few scripts as they usually contain the client_id
                for (const sm of scriptMatch.slice(-3)) {
                    const sUrl = sm.match(/src="([^"]+)"/)?.[1]
                    if (sUrl) {
                        const { data: scriptContent } = await axios.get(sUrl)
                        const idMatch = scriptContent.match(/client_id:"([a-zA-Z0-9]{32})"/)
                        if (idMatch) {
                            clientId = idMatch[1]
                            break
                        }
                    }
                }
            }

            if (clientId) {
                const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=5`
                const { data: scData } = await axios.get(searchUrl)
                if (scData.collection) {
                    scData.collection.forEach((item: any) => {
                        results.push({
                            url: item.permalink_url,
                            title: item.title,
                            artist: item.user?.username || 'SoundCloud',
                            thumbnail: item.artwork_url || item.user?.avatar_url,
                            platform: 'soundcloud'
                        })
                    })
                }
            }
        } catch (scError) {
            console.error('SoundCloud v2 search error:', scError)
        }

        // 3. Apple Music Search Scraping
        try {
            const appleUrl = `https://music.apple.com/us/search?term=${encodeURIComponent(q)}`
            const { data: appleData } = await axios.get(appleUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })

            // Look for songs in the hydration data
            const songRegex = /\{"id":"([^"]+)","type":"songs".+?"name":"([^"]+)".+?"artistName":"([^"]+)".+?"url":"([^"]+)".+?"artwork":\{"url":"([^"]+)"/g
            let match;
            let count = 0;
            while ((match = songRegex.exec(appleData)) !== null && count < 5) {
                results.push({
                    url: match[4],
                    title: match[2],
                    artist: match[3],
                    thumbnail: match[5].replace('{w}', '200').replace('{h}', '200').replace('{f}', 'jpg'),
                    platform: 'apple'
                })
                count++;
            }
        } catch (appleError) {
            console.error('Apple Music search error:', appleError)
        }

        console.log(`[Search] Query: "${q}" | Results: ${results.length}`)

        if (results.length === 0) {
            return NextResponse.json({ error: 'No results found' }, { status: 404 })
        }

        return NextResponse.json({ results })

    } catch (error) {
        console.error('Search overall error:', error)
        return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
}
