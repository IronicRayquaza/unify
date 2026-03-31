import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'UNIFY — Your Music, Everywhere.',
  description: 'The ultimate desktop music widget for Power Listeners.',
  icons: {
    icon: '/favicon.svg',
  },
}

import { Toaster } from 'sonner'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster position="bottom-right" richColors expand theme="dark" />
      </body>
    </html>
  )
}
