
import { NextRequest, NextResponse } from 'next/server'
import { detectPlatform, parseFallbackInfo, getYoutubeThumbnail } from '@/lib/platform'
import { ResolveResponse } from '@/types'
import axios from 'axios'
import * as cheerio from 'cheerio'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  let resolvedUrl = url
  // Handle short SoundCloud links (on.soundcloud.com) which are redirects
  if (url.includes('on.soundcloud.com')) {
    try {
      const resp = await axios.get(url, { maxRedirects: 5 })
      resolvedUrl = resp.request.res.responseUrl || url
    } catch (e) {
      console.error('SoundCloud redirect resolution failed:', e)
    }
  }

  const platform = detectPlatform(resolvedUrl)
  const fallback = parseFallbackInfo(resolvedUrl, platform)

  let result: ResolveResponse = {
    platform,
    title: fallback.title,
    artist: fallback.artist,
    url: resolvedUrl // Return the final resolved URL
  }

  try {
    // 1. YouTube & YouTube Music: use oEmbed
    if (platform === 'youtube' || platform === 'ytmusic') {
      try {
        // Normalize for oEmbed compatibility
        const embedUrl = resolvedUrl.replace('music.youtube.com', 'www.youtube.com')
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(embedUrl)}&format=json`,
          { next: { revalidate: 3600 } }
        )
        if (oembed.ok) {
          const data = await oembed.json()
          result.title = data.title ?? result.title
          result.artist = data.author_name ?? result.artist
          result.thumbnail = data.thumbnail_url ?? getYoutubeThumbnail(resolvedUrl)
        } else {
          result.thumbnail = getYoutubeThumbnail(resolvedUrl)
        }
      } catch {
        result.thumbnail = getYoutubeThumbnail(resolvedUrl)
      }
    }

    // 2. SoundCloud: use oEmbed
    else if (platform === 'soundcloud') {
      try {
        const oembed = await fetch(
          `https://soundcloud.com/oembed?url=${encodeURIComponent(resolvedUrl)}&format=json`,
          { next: { revalidate: 3600 } }
        )
        if (oembed.ok) {
          const data = await oembed.json()
          const rawTitle: string = data.title ?? result.title
          const parts = rawTitle.split(' by ')
          if (parts.length >= 2) {
            result.title = parts[0].trim()
            result.artist = parts[1].trim()
          } else {
            result.title = rawTitle
          }
          result.thumbnail = data.thumbnail_url
        }
      } catch { }
    }

    // 3. Spotify: Meta Tags Scraping (No Token Required)
    else if (platform === 'spotify') {
      try {
        const response = await axios.get(resolvedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
        })
        const html = response.data
        const $ = cheerio.load(html)

        const ogTitle = $('meta[property="og:title"]').attr('content')
        const ogDescription = $('meta[property="og:description"]').attr('content')
        const ogImage = $('meta[property="og:image"]').attr('content')

        if (ogTitle) {
          result.title = ogTitle
          // og:description usually format: "Song · Artist · Album" or "Listen to [Song] on Spotify"
          // Let's try to extract artist from description or title
          if (ogDescription) {
            // Typical Spotify description: "Listen to Song name by Artist name on Spotify."
            const artistMatch = ogDescription.match(/by (.+) on Spotify/)
            if (artistMatch) {
              result.artist = artistMatch[1]
            } else {
              // Fallback: description might be just the artist name in some contexts
              result.artist = ogDescription.split('·')[0].trim()
            }
          }
        }
        if (ogImage) {
          result.thumbnail = ogImage
        }
      } catch (error) {
        console.error('Spotify scraping failed:', error)
      }
    }

    // 4. Apple Music: Meta Tags Scraping
    else if (platform === 'apple') {
      try {
        const response = await axios.get(resolvedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
        })
        const html = response.data
        const $ = cheerio.load(html)

        const ogTitle = $('meta[property="og:title"]').attr('content') // Usually "Song Name on Apple Music"
        const ogDescription = $('meta[property="og:description"]').attr('content') // "Song · Artist · Year"
        const ogImage = $('meta[property="og:image"]').attr('content')

        if (ogTitle) {
          result.title = ogTitle.replace(' on Apple Music', '').trim()
        }

        // Apple Music description usually: "Listen to Song by Artist..."
        if (ogDescription) {
          // Try to parse "Song · Artist"
          const parts = ogDescription.split('·')
          if (parts.length >= 2) {
            result.artist = parts[1].trim()
          }
        }

        if (ogImage) {
          result.thumbnail = ogImage
        }
      } catch (error) {
        console.error('Apple Music scraping failed:', error)
      }
    }

  } catch (e) {
    console.error('Resolution error:', e)
  }

  return NextResponse.json(result)
}
