import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

const YTM_KEY = process.env.YOUTUBE_MUSIC_KEY || 'AIzaSyAO_FJ2nm_S8YvS6O0-t1Xyv59M'
const YTM_URL = `https://music.youtube.com/youtubei/v1/search?key=${YTM_KEY}`

const YTM_CONTEXT = {
    context: {
        client: {
            clientName: "WEB_REMIX",
            clientVersion: "1.20231214.01.00",
            hl: "en",
            gl: "US",
            utcOffsetMinutes: 0
        }
    }
}

export async function GET(req: NextRequest) {
    const query = req.nextUrl.searchParams.get('q')
    if (!query) {
        return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    try {
        const payload = {
            ...YTM_CONTEXT,
            query: query,
            params: "EgWKAQIIAWoKEAMQBBAJEAoQBQ==" // Filter for songs
        }

        const response = await axios.post(YTM_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://music.youtube.com/'
            }
        })

        const results = parseMusicShelfResults(response.data)
        return NextResponse.json({ results })
    } catch (error: any) {
        console.error('YT Music search failed:', error.response?.data || error.message)
        return NextResponse.json({ error: 'Search failed', details: error.message }, { status: 500 })
    }
}

function parseMusicShelfResults(data: any) {
    const results: any[] = []

    // Navigate through the complex JSON structure
    // contents -> sectionListRenderer -> contents -> musicShelfRenderer -> contents
    const shelves = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents

    if (!shelves) return []

    for (const shelf of shelves) {
        const musicShelf = shelf.musicShelfRenderer
        if (!musicShelf || !musicShelf.contents) continue

        for (const item of musicShelf.contents) {
            const track = item.musicResponsiveListItemRenderer
            if (!track) continue

            const videoId = track.playlistItemData?.videoId ||
                track.doubleTapCommand?.watchEndpoint?.videoId ||
                track.navigationEndpoint?.watchEndpoint?.videoId

            if (!videoId) continue

            // Extract titles and artists from flex columns
            const flexColumns = track.flexColumns || []

            // Title is usually in the first column
            const title = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Unknown Title'

            // Artist is usually in the second column
            const artistRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []
            const artist = artistRuns.map((r: any) => r.text).join('') || 'Unknown Artist'

            // Thumbnails
            const thumbnails = track.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || []
            const thumbnail = thumbnails[thumbnails.length - 1]?.url // Get highest resolution

            results.push({
                id: videoId,
                videoId: videoId,
                title,
                artist,
                thumbnail,
                platform: 'ytmusic',
                url: `https://music.youtube.com/watch?v=${videoId}`
            })
        }
    }

    return results
}
