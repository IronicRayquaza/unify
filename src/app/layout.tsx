import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { GlobalPlayer } from '@/components/GlobalPlayer'

import Script from 'next/script'

export const metadata: Metadata = {
  title: 'UNIFY — Universal Playlist',
  description: 'One playlist to rule Spotify, YouTube, SoundCloud, and Apple Music',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script src="https://www.youtube.com/iframe_api" strategy="beforeInteractive" />
        <Providers>
          {children}
          <GlobalPlayer />
        </Providers>
      </body>
    </html>
  )
}
