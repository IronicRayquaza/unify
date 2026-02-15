
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
            const { data: ytData } = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            })

            // Flexible regex to find ytInitialData in various script formats
            const dataMatch = ytData.match(/ytInitialData\s*=\s*({.+?});\s*(?:<\/script>|window)/) ||
                ytData.match(/ytInitialData\s*=\s*({.+?});/) ||
                ytData.match(/(?:var|window\[['"])ytInitialData['"]\]?\s*=\s*({[\s\S]*?});/);

            if (dataMatch) {
                try {
                    const json = JSON.parse(dataMatch[1]);
                    const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                    const itemSection = contents?.find((c: any) => c.itemSectionRenderer);
                    const items = itemSection?.itemSectionRenderer?.contents;

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
                } catch (parseError) {
                    console.error('YouTube JSON parse error:', parseError);
                }
            }

            // Fallback: If results still empty, try DOM scraping with Cheerio
            if (results.filter(r => r.platform === 'youtube').length === 0) {
                const $ = cheerio.load(ytData);
                $('.yt-lockup-video, ytd-video-renderer').slice(0, 5).each((_, el) => {
                    const $el = $(el);
                    const videoId = $el.attr('data-context-item-id') || $el.find('a#video-title').attr('href')?.match(/v=([^&]+)/)?.[1];
                    const title = $el.find('.yt-lockup-title a, #video-title').text().trim();
                    const artist = $el.find('.yt-lockup-byline, #byline-container').text().trim();
                    if (videoId && title) {
                        results.push({
                            id: videoId,
                            url: `https://www.youtube.com/watch?v=${videoId}`,
                            title,
                            artist: artist || 'YouTube',
                            platform: 'youtube'
                        });
                    }
                });
            }
        } catch (ytError) {
            console.error('YouTube search error:', ytError)
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
                // Simplified traversal for YouTube Music's complex structure
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
        } catch (ytmError) {
            console.error('YouTube Music search error:', ytmError);
        }

        // 2. SoundCloud Search (Advanced: Discover Client ID and use v2 API)
        try {
            // First, get a client_id from the main page scripts
            const { data: mainPage } = await axios.get('https://soundcloud.com', {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })
            const scriptMatch = mainPage.match(/src="([^"]+\/assets\/[^"]+\.js)"/g)
            let clientId = ''

            if (scriptMatch) {
                // Check all assets as they frequently rotate
                for (const sm of scriptMatch.slice(-10)) {
                    const sUrl = sm.match(/src="([^"]+)"/)?.[1]
                    if (sUrl) {
                        try {
                            const { data: scriptContent } = await axios.get(sUrl, { timeout: 3000 })
                            const idMatch = scriptContent.match(/client_id[:=]"([a-zA-Z0-9]{32})"/)
                            if (idMatch) {
                                clientId = idMatch[1]
                                break
                            }
                        } catch (e) {
                            // Continue to next script if one fails
                        }
                    }
                }
            }

            if (clientId) {
                const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=10`
                const { data: scData } = await axios.get(searchUrl)
                if (scData.collection) {
                    scData.collection.forEach((item: any) => {
                        // Mark "Go+" tracks / snippets (usually 30s)
                        const isSnippet = item.is_snippet === true ||
                            item.policy === 'SNIP' ||
                            (item.duration && item.duration <= 31000);

                        if (results.filter(r => r.platform === 'soundcloud').length >= 5) return;

                        results.push({
                            url: item.permalink_url,
                            title: item.title,
                            artist: item.user?.username || 'SoundCloud',
                            thumbnail: item.artwork_url || item.user?.avatar_url,
                            duration: item.duration ? `${Math.floor(item.duration / 60000)}:${Math.floor((item.duration % 60000) / 1000).toString().padStart(2, '0')}` : undefined,
                            platform: 'soundcloud',
                            isSnippet: isSnippet
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
