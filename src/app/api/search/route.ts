
import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import * as cheerio from 'cheerio'

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q')
    if (!q) {
        return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const results: any[] = []
    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY

    // 1. YouTube Search (API or Scraping)
    try {
        let ytTracks: any[] = []

        if (apiKey) {
            try {
                const apiRes = await axios.get(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&q=${encodeURIComponent(q)}&key=${apiKey}&maxResults=10`
                )
                ytTracks = apiRes.data.items.map((item: any) => ({
                    id: item.id.videoId,
                    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    title: item.snippet.title,
                    artist: item.snippet.channelTitle,
                    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
                    platform: 'youtube'
                }))
                results.push(...ytTracks)
            } catch (e) {
                console.error('YouTube API search failed, falling back to scraping...', e)
            }
        }

        if (results.filter(r => r.platform === 'youtube').length === 0) {
            const { data: ytData } = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            })

            const dataMatch = ytData.match(/ytInitialData\s*=\s*({.+?});\s*(?:<\/script>|window)/) ||
                ytData.match(/ytInitialData\s*=\s*({.+?});/) ||
                ytData.match(/(?:var|window\[['"])ytInitialData['"]\]?\s*=\s*({[\s\S]*?});/);

            if (dataMatch) {
                try {
                    const json = JSON.parse(dataMatch[1]);
                    const items = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents
                        ?.find((c: any) => c.itemSectionRenderer)?.itemSectionRenderer?.contents;

                    if (items) {
                        let count = 0;
                        for (const item of items) {
                            const v = item.videoRenderer;
                            if (v && v.videoId && count < 5) {
                                results.push({
                                    id: v.videoId,
                                    url: `https://www.youtube.com/watch?v=${v.videoId}`,
                                    title: v.title?.runs?.[0]?.text || v.title?.simpleText || 'Unknown Title',
                                    artist: v.longBylineText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || 'YouTube',
                                    thumbnail: v.thumbnail?.thumbnails?.[0]?.url,
                                    duration: v.lengthText?.simpleText || v.lengthText?.accessibility?.accessibilityData?.label,
                                    platform: 'youtube'
                                })
                                count++;
                            }
                        }
                    }
                } catch (e) { }
            }
        }
    } catch (e) {
        console.error('YouTube search error:', e)
    }

    // 1b. YouTube Music Search
    try {
        const { data: ytmData } = await axios.get(`https://music.youtube.com/search?q=${encodeURIComponent(q)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        const ytmMatch = ytmData.match(/(?:var|window\[['"])ytInitialData['"]\]?\s*=\s*({[\s\S]*?});/);
        if (ytmMatch) {
            const json = JSON.parse(ytmMatch[1]);
            const shelf = json.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
            if (shelf) {
                let count = 0;
                for (const section of shelf) {
                    const musicItems = section.musicShelfRenderer?.contents || section.musicCardShelfRenderer?.contents;
                    if (musicItems) {
                        for (const item of musicItems) {
                            const m = item.musicResponsiveListItemRenderer;
                            if (m && count < 5) {
                                const videoId = m.playlistItemData?.videoId || m.doubleTapCommand?.watchEndpoint?.videoId;
                                if (!videoId) continue;
                                results.push({
                                    id: videoId,
                                    url: `https://music.youtube.com/watch?v=${videoId}`,
                                    title: m.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Unknown',
                                    artist: m.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'YouTube Music',
                                    thumbnail: m.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url,
                                    platform: 'ytmusic'
                                });
                                count++;
                            }
                        }
                    }
                }
            }
        }
    } catch (e) { }

    // 2. SoundCloud Search
    try {
        const { data: mainPage } = await axios.get('https://soundcloud.com', { headers: { 'User-Agent': 'Mozilla/5.0' } })
        const scriptMatch = mainPage.match(/src="([^"]+\/assets\/[^"]+\.js)"/g)
        let clientId = ''
        if (scriptMatch) {
            for (const sm of scriptMatch.slice(-5)) {
                const sUrl = sm.match(/src="([^"]+)"/)?.[1]
                if (sUrl) {
                    try {
                        const { data: scriptContent } = await axios.get(sUrl, { timeout: 2000 })
                        const idMatch = scriptContent.match(/client_id[:=]"([a-zA-Z0-9]{32})"/)
                        if (idMatch) { clientId = idMatch[1]; break }
                    } catch (e) { }
                }
            }
        }

        if (clientId) {
            const { data: scData } = await axios.get(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=10`)
            if (scData.collection) {
                scData.collection.slice(0, 5).forEach((item: any) => {
                    results.push({
                        url: item.permalink_url,
                        title: item.title,
                        artist: item.user?.username || 'SoundCloud',
                        thumbnail: item.artwork_url || item.user?.avatar_url,
                        duration: item.duration ? `${Math.floor(item.duration / 60000)}:${Math.floor((item.duration % 60000) / 1000).toString().padStart(2, '0')}` : undefined,
                        platform: 'soundcloud'
                    })
                })
            }
        }
    } catch (e) { }

    // 3. Apple Music Search
    try {
        const { data: appleData } = await axios.get(`https://music.apple.com/us/search?term=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
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
    } catch (e) { }

    return NextResponse.json({ results })
}
