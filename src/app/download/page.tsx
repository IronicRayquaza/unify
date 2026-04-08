'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FAQ from '@/components/FAQ'

export default function DownloadPage() {
  const router = useRouter()

  const releases = [
    {
      platform: 'Windows',
      version: 'v1.0.4',
      file: 'Unify-Setup.exe',
      link: 'https://drive.google.com/file/d/1QxtM0-AzEVqITp6bpaRX-K5AfiqN9Oer/view?usp=sharing',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.801" />
        </svg>
      )
    },
    {
      platform: 'macOS',
      version: 'v1.0.4',
      file: 'Unify-Setup.dmg',
      link: 'https://drive.google.com/file/d/1cV6r7UJ1ktDbkVXTzJnPIcIyCHMK7IAd/view?usp=sharing',
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 20.28c-.96.95-2.22 1.48-3.72 1.48-1.5 0-2.65-.45-3.41-.45-.75 0-2.02.48-3.32.48-2.62 0-5.12-1.63-6.42-4.13-1.63-3.13-.15-7.75 2.45-10.45 1.3-1.35 2.85-2.05 4.35-2.05s2.75.63 3.65 1.13c.9-.5 2.35-1.25 4-1.25s3.45.85 4.6 2.3c-3.15 1.75-2.65 6.05.5 7.45-.7 1.5-1.55 3.05-2.7 4.13v.35l.02-.01zm-4.72-15.58c0-2.12 1.72-3.83 3.83-3.83.15 2.12-1.72 4-3.83 3.83z" />
        </svg>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-bg flex flex-col relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg opacity-[0.15]" />
        <div className="absolute top-0 right-1/4 w-[800px] h-[800px] rounded-full animate-bgPulse"
          style={{ background: 'radial-gradient(circle, rgba(200,255,0,0.03) 0%, transparent 70%)' }} />
      </div>

      <nav className="relative z-[100] w-full max-w-7xl mx-auto px-6 py-6 transition-all">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent2 flex items-center justify-center shadow-lg shadow-accent/10">
            <svg className="w-4 h-4 text-bg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
            </svg>
          </div>
          <span className="font-display font-bold text-xl tracking-tight">UNIFY</span>
        </div>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center -mt-20">
        <div className="w-full max-w-4xl pt-20">
          <h1 className="font-display font-black text-6xl md:text-8xl tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 animate-slideDown">
            Download <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-[#ccff00] to-accent2">Setup</span>
          </h1>
          <p className="font-body text-muted text-lg md:text-xl max-w-xl mx-auto mb-16 leading-relaxed animate-fadeIn" style={{ animationDelay: '0.2s' }}>
            Select your platform below to get the latest stable release.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left py-12">
            {releases.map((rel) => (
              <div key={rel.platform} className="p-8 rounded-2xl bg-surface/40 border border-border/50 hover:bg-surface/60 transition-all group backdrop-blur-xl">
                <div className="flex items-start justify-between mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-surface2 flex items-center justify-center text-text/80 group-hover:text-accent transition-colors border border-border/50">
                    {rel.icon}
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent font-mono-custom text-[10px] font-bold tracking-widest uppercase">
                      Latest Stable
                    </span>
                    <div className="text-muted font-mono-custom text-xs mt-2">{rel.version}</div>
                  </div>
                </div>

                <h3 className="font-display font-bold text-2xl mb-2 text-white">{rel.platform}</h3>
                <p className="text-muted text-sm mb-8 font-mono-custom opacity-60">{rel.file}</p>

                <button 
                  onClick={() => rel.link && window.open(rel.link, '_blank')}
                  className="w-full py-4 rounded-full bg-white text-bg font-bold text-lg tracking-tight hover:scale-[1.02] active:scale-[0.98] transition-all relative overflow-hidden group/btn shadow-xl shadow-white/5"
                >
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-accent to-accent2 transform scale-x-0 group-hover/btn:scale-x-100 transition-transform origin-left duration-500" />
                  Download for {rel.platform}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-16 p-8 rounded-2xl bg-surface/20 border border-border/30 backdrop-blur-sm max-w-3xl mx-auto text-left">
            <h4 className="font-display font-bold text-lg mb-4 text-text/80 uppercase tracking-widest text-xs">System Requirements</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
              {[
                { label: 'OS', val: 'Windows / macOS' },
                { label: 'RAM', val: '4GB (minimum) / 8GB (recommended)' },
                { label: 'Storage', val: '200MB free' },
                { label: 'Audio', val: 'Active output device required' }
              ].map(req => (
                <div key={req.label} className="flex items-center justify-between border-b border-border/20 py-2">
                  <span className="text-muted font-mono-custom text-xs">{req.label}</span>
                  <span className="text-text/90 font-mono-custom text-xs font-bold">{req.val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 text-center text-muted font-mono-custom text-xs">
            Problems? Check our <a href="mailto:satyam4698@gmail.com" className="text-accent/80 hover:text-accent underline underline-offset-4">Support</a> or join <a href="https://discord.gg/c44vQq5HD7" target="_blank" rel="noopener noreferrer" className="text-accent/80 hover:text-accent underline underline-offset-4">Discord</a>.
          </div>
        </div>
        <FAQ />
      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-8 mt-20 border-t border-border/20 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-muted text-sm font-mono-custom">
          © {new Date().getFullYear()} UNIFY — Universal Engine
        </div>
        <div className="flex items-center gap-6">
          <a
            href="https://x.com/Satyam4698"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-text transition-colors text-sm font-mono-custom"
          >
            Twitter
          </a>
          <a
            href="https://discord.gg/c44vQq5HD7"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-text transition-colors text-sm font-mono-custom"
          >
            Discord
          </a>
          <a
            href="mailto:satyam4698@gmail.com"
            className="text-muted hover:text-text transition-colors text-sm font-mono-custom"
          >
            Support
          </a>
        </div>
      </footer>
    </div>
  )
}
