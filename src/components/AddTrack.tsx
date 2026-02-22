'use client'

import { useState, useRef, ChangeEvent } from 'react'
import { Track, Platform, ResolveResponse } from '@/types'
import { detectPlatform, isValidUrl, platformDisplayName } from '@/lib/platform'
import { v4 as uuidv4 } from 'uuid'
import { Plus, Loader2, X, Search, Upload } from 'lucide-react'
import clsx from 'clsx'
import { useSpotifyAuth } from '@/lib/spotify-auth'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

interface Props {
  playlistId: string
  existingUrls: string[]
  onAdd: (track: Track) => void
}

const PLATFORM_HINTS: { platform: Platform; color: string }[] = [
  { platform: 'youtube', color: '#FF0000' },
  { platform: 'ytmusic', color: '#FF0000' },
  { platform: 'spotify', color: '#1DB954' },
  { platform: 'soundcloud', color: '#ff5500' },
  { platform: 'apple', color: '#fc3c44' },
  { platform: 'local', color: '#818cf8' },
]

export function AddTrack({ playlistId, existingUrls, onAdd }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<ResolveResponse[]>([])
  const [feedback, setFeedback] = useState<{ msg: string; type: 'error' | 'success' } | null>(null)
  const [detectedPlatform, setDetectedPlatform] = useState<Platform | null>(null)
  const [filter, setFilter] = useState<Platform | 'all'>('all')
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { token: spotifyToken, login } = useSpotifyAuth()

  const handleClear = () => {
    setUrl('')
    setDetectedPlatform(null)
    setSearchResults([])
    setFilter('all')
  }

  const showFeedback = (msg: string, type: 'error' | 'success') => {
    setFeedback({ msg, type })
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500)
  }

  const handleChange = (val: string) => {
    setUrl(val)
    if (val.trim()) {
      const p = detectPlatform(val)
      setDetectedPlatform(p !== 'unknown' ? p : null)
      if (searchResults.length > 0) setSearchResults([])
    } else {
      setDetectedPlatform(null)
      setSearchResults([])
    }
  }

  const handleAction = async () => {
    const trimmed = url.trim()
    if (!trimmed) return showFeedback('Please enter keywords or a URL', 'error')

    if (isValidUrl(trimmed)) {
      await handleAdd(trimmed)
    } else {
      await handleSearch(trimmed)
    }
  }

  const handleSearch = async (query: string) => {
    setLoading(true)
    setSearchResults([])
    setFilter('all') // Reset filter on new search
    try {
      // 1. YouTube & SoundCloud (from our server API)
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      let apiResults: ResolveResponse[] = []
      if (res.ok) {
        const data = await res.json()
        apiResults = data.results || []
      }

      // 2. Spotify (directly from Spotify API using user token)
      let spotifyRes: ResolveResponse[] = []
      if (spotifyToken) {
        try {
          const sResp = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`, {
            headers: { 'Authorization': `Bearer ${spotifyToken}` }
          })
          if (sResp.ok) {
            const sData = await sResp.json()
            spotifyRes = sData.tracks.items.map((item: any) => ({
              url: item.external_urls.spotify,
              title: item.name,
              artist: item.artists.map((a: any) => a.name).join(', '),
              thumbnail: item.album.images[0]?.url,
              platform: 'spotify'
            }))
          }
        } catch (err) {
          console.error('Spotify Search Failed:', err)
        }
      }

      const combined = [...spotifyRes, ...apiResults]
      setSearchResults(combined)

      if (combined.length === 0) {
        showFeedback('No results found across platforms', 'error')
      }
    } catch (e: any) {
      showFeedback(e.message || 'Search failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('audio/')) {
      return showFeedback('Please select an audio file (MP3, WAV, etc.)', 'error')
    }

    setLoading(true)
    try {
      // 1. Generate unique file name
      const fileExt = file.name.split('.').pop()
      const fileName = `${uuidv4()}.${fileExt}`
      const filePath = `user-uploads/${fileName}`

      // 2. Upload to Supabase Storage
      // We assume a bucket named 'songs' exists and is public
      const { data, error } = await supabase.storage
        .from('songs')
        .upload(filePath, file)

      if (error) {
        if (error.message.includes('bucket not found')) {
          throw new Error('Supabase Storage bucket "songs" not found. Please create it in your Supabase dashboard.')
        }
        throw error
      }

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('songs')
        .getPublicUrl(filePath)

      // 4. Create Track object
      // Try to parse title/artist from filename
      const baseName = file.name.replace(`.${fileExt}`, '')
      const parts = baseName.includes(' - ') ? baseName.split(' - ') : [baseName]

      const track: Track = {
        id: uuidv4(),
        url: publicUrl,
        platform: 'local',
        title: parts[1] || parts[0],
        artist: parts[1] ? parts[0] : 'Local Upload',
        addedAt: new Date().toISOString(),
      }

      onAdd(track)
      showFeedback(`Uploaded "${track.title}" ✓`, 'success')
    } catch (err: any) {
      console.error('File Upload Error:', err)
      showFeedback(err.message || 'File upload failed', 'error')
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAdd = async (resultOrUrl: string | ResolveResponse) => {
    let trackUrl = typeof resultOrUrl === 'string' ? resultOrUrl : resultOrUrl.url!
    const isSnippet = typeof resultOrUrl === 'object' && resultOrUrl.isSnippet

    if (existingUrls.includes(trackUrl)) return showFeedback('Track already in playlist!', 'error')

    setLoading(true)
    try {
      let finalTrackData: any = null

      // IF SNIPPET -> FIND FULL VERSION ON YOUTUBE
      if (isSnippet) {
        showFeedback('Getting full version from YouTube...', 'success')
        const query = `${(resultOrUrl as ResolveResponse).artist} - ${(resultOrUrl as ResolveResponse).title}`
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          const fullTrack = data.results?.find((r: any) => r.platform === 'youtube')
          if (fullTrack) {
            trackUrl = fullTrack.url
            finalTrackData = {
              ...fullTrack,
              // Keep SC metadata if preferred, or use YT
              title: (resultOrUrl as ResolveResponse).title,
              artist: (resultOrUrl as ResolveResponse).artist,
            }
          }
        }
      }

      // If not snippet or fallback failed, resolve normally
      if (!finalTrackData) {
        if (typeof resultOrUrl === 'object' && !isSnippet) {
          // Use the search result data directly
          finalTrackData = resultOrUrl
        } else {
          const res = await fetch(`/api/resolve?url=${encodeURIComponent(trackUrl)}`)
          if (!res.ok) {
            throw new Error(`Server responded with ${res.status}`)
          }
          finalTrackData = await res.json()
        }
      }

      const track: Track = {
        id: uuidv4(),
        url: finalTrackData.url || trackUrl,
        platform: finalTrackData.platform,
        title: finalTrackData.title,
        artist: finalTrackData.artist,
        thumbnail: finalTrackData.thumbnail,
        duration: finalTrackData.duration,
        addedAt: new Date().toISOString(),
      }

      onAdd(track)
      setUrl('')
      setDetectedPlatform(null)
      setSearchResults([])
      showFeedback(`Added "${track.title}" ✓`, 'success')
    } catch (e: any) {
      console.error('Add Track Error:', e)
      showFeedback(e.message || 'Failed to resolve track. Check the URL.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const isUrl = isValidUrl(url.trim())

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-8 relative overflow-hidden transition-all">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: 'linear-gradient(90deg, #c8ff00, #ff6b35)' }} />

      <div className="font-mono-custom text-[11px] tracking-[3px] uppercase text-muted mb-4">
        {isUrl ? 'Add Track — Paste Any Link' : 'Search Tracks — Keywords'}
      </div>

      <div className="flex gap-3">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="audio/*"
          onChange={handleFileUpload}
        />

        <div className="flex-1 relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors">
            <Search size={16} />
          </div>
          <input
            value={url}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleAction()}
            placeholder="Search songs or paste Spotify/YT/SoundCloud link..."
            className="w-full bg-bg border border-border rounded-xl pl-11 pr-12 py-3.5 font-mono-custom text-sm text-text placeholder-muted outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 caret-accent"
            spellCheck={false}
            autoComplete="off"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {url && !loading && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded-lg hover:bg-surface2 text-muted hover:text-red-400 transition-all"
                title="Clear search"
              >
                <X size={16} />
              </button>
            )}
            {detectedPlatform && (
              <span className="font-mono-custom text-[10px] tracking-wider uppercase px-2 py-1 rounded-full"
                style={{
                  background: `${PLATFORM_HINTS.find(h => h.platform === detectedPlatform)?.color}20`,
                  color: PLATFORM_HINTS.find(h => h.platform === detectedPlatform)?.color,
                }}>
                {platformDisplayName(detectedPlatform)}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleFileSelect}
            disabled={loading}
            className="flex items-center justify-center p-3.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
            title="Upload local song"
          >
            <Upload size={18} />
          </button>

          <button
            onClick={handleAction}
            disabled={loading || !url.trim()}
            className={clsx(
              'flex items-center gap-2 px-6 py-3.5 rounded-xl font-display font-bold text-sm transition-all min-w-[120px] justify-center',
              'bg-accent text-bg hover:shadow-lg hover:shadow-accent/30 hover:-translate-y-0.5',
              'disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0'
            )}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              isUrl ? <Plus size={16} /> : <Search size={16} />
            )}
            {loading ? (isUrl ? 'Resolving…' : 'Searching…') : (isUrl ? 'Add' : 'Search')}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="font-mono-custom text-[10px] text-muted uppercase tracking-widest">Results:</div>

            <div className="flex gap-1.5">
              <button
                onClick={() => setFilter('all')}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-[9px] font-mono-custom uppercase tracking-tighter transition-all border",
                  filter === 'all' ? "bg-accent text-bg border-accent" : "bg-bg text-muted border-border hover:border-muted"
                )}
              >
                All
              </button>
              {PLATFORM_HINTS.map(({ platform, color }) => (
                <button
                  key={platform}
                  onClick={() => setFilter(platform)}
                  className={clsx(
                    "px-2.5 py-1 rounded-md text-[9px] font-mono-custom uppercase tracking-tighter transition-all border",
                    filter === platform
                      ? "text-bg border-transparent"
                      : "bg-bg text-muted border-border hover:border-muted"
                  )}
                  style={filter === platform ? { background: color } : {}}
                >
                  {platformDisplayName(platform)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {searchResults
              .filter(r => filter === 'all' || r.platform === filter)
              .map((result, idx) => (
                <div
                  key={idx}
                  onClick={() => handleAdd(result)}
                  className="group flex items-center gap-3 p-2 rounded-xl bg-bg border border-border hover:border-accent/50 hover:bg-surface2 transition-all cursor-pointer"
                >
                  {result.thumbnail ? (
                    <div className="w-10 h-10 relative flex-shrink-0">
                      <Image
                        src={result.thumbnail}
                        alt={result.title}
                        fill
                        className="rounded-lg object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-surface2 flex items-center justify-center text-muted font-bold text-xs uppercase">
                      {result.platform[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate text-text group-hover:text-accent transition-colors">
                      {result.title}
                      {result.isSnippet && (
                        <span className="ml-2 text-[8px] text-red-400/80 font-mono-custom uppercase tracking-widest border-b border-red-400/30">PREVIEW</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] text-muted truncate max-w-[150px]">{result.artist}</div>
                      {result.duration && (
                        <div className="text-[10px] text-muted/50 font-mono-custom">· {result.duration}</div>
                      )}
                    </div>
                  </div>
                  <div className="px-2 py-1 rounded-md text-[9px] font-mono-custom uppercase tracking-tighter"
                    style={{
                      background: `${PLATFORM_HINTS.find(h => h.platform === result.platform)?.color}20`,
                      color: PLATFORM_HINTS.find(h => h.platform === result.platform)?.color,
                    }}
                  >
                    {platformDisplayName(result.platform)}
                  </div>
                </div>
              ))}

            {searchResults.filter(r => filter === 'all' || r.platform === filter).length === 0 && (
              <div className="py-8 text-center border border-dashed border-border rounded-xl font-mono-custom text-xs text-muted">
                No {filter} results found for this search.

                {((filter === 'all' && !searchResults.some(r => r.platform === 'spotify')) || filter === 'spotify') && !spotifyToken && (
                  <div className="mt-4 p-4 bg-spotify/5 border border-spotify/20 rounded-xl">
                    <p className="text-spotify font-bold mb-2">Want Spotify results?</p>
                    <button
                      onClick={login}
                      className="px-4 py-2 bg-spotify text-bg rounded-lg font-display font-bold hover:scale-105 transition-all"
                    >
                      Login with Spotify
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Platform hints (show only if no search results) */}
      {searchResults.length === 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {PLATFORM_HINTS.map(({ platform, color }) => (
            <span key={platform} className="flex items-center gap-1.5 font-mono-custom text-[11px] text-muted bg-surface2 border border-border rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {platformDisplayName(platform)}
            </span>
          ))}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={clsx(
          'mt-3 font-mono-custom text-[10px] uppercase tracking-[3px] font-bold text-center animate-pulse',
          feedback.type === 'error' ? 'text-red-400' : 'text-accent drop-shadow-[0_0_8px_rgba(200,255,0,0.5)]'
        )}>
          {feedback.msg}
        </div>
      )}
    </div>
  )
}
