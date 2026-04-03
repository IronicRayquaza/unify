'use client'

import { useState } from 'react'

const faqs = [
  {
    question: "What streaming services are supported?",
    answer: "Unify seamlessly integrates with Spotify, YouTube Music, YouTube, SoundCloud, and Apple Music. You can search across all platforms and create unified playlists that combine tracks from different sources."
  },
  {
    question: "How does the Playlist Migration tool work?",
    answer: "Our smart migration engine scans your source playlist, identifies each track using advanced metadata matching, and finds the corresponding versions on your destination platform—automating the entire transfer process in seconds."
  },
  {
    question: "Do I need a premium Spotify account?",
    answer: "No, Unify works with both Spotify Free and Spotify Premium. However, certain limits imposed by the streaming providers themselves (like audio quality or skipping) may still apply according to your subscription level."
  },
  {
    question: "Is Unify available for mobile devices?",
    answer: "Currently, Unify is focused on providing the ultimate desktop experience for power users. We support Windows and macOS with an 'Always on Top' widget mode that stays in your workflow."
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. We use industry-standard OAuth2 to connect to your streaming accounts directly. Your login credentials never touch our servers, and we only request the minimum permissions needed to manage your playback and playlists."
  },
  {
    question: "Why does my PC show a security warning during setup?",
    answer: "This is a common warning for new open-source software that isn't yet in the Microsoft or Apple store databases. We guarantee that Unify is 100% secure, malware-free, and respects your privacy. You can safely proceed by clicking 'More Info' and then 'Run Anyway' on Windows, or following standard third-party app procedures on macOS."
  },
  {
    question: "Is Unify fully stable?",
    answer: "Unify is currently in active development (Alpha/Beta). While we strive for performance, users may experience occasional bugs or lags as we continue to optimize the core engine. Your bug reports and feedback are invaluable to us as we work toward a stable 1.0 release."
  }
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="w-full max-w-4xl mx-auto px-6 py-24 relative z-20">
      <div className="text-center mb-16 animate-fadeIn">
        <span className="px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent font-bold text-xs uppercase tracking-[0.2em] font-mono-custom mb-6 inline-block">
          Common Questions
        </span>
        <h2 className="font-display font-black text-4xl md:text-6xl tracking-tighter text-white mb-6">
          Frequently Asked <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent2">Questions</span>
        </h2>
        <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
          Everything you need to know about Unify and how it transforms your music library.
        </p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div 
            key={index}
            className={`rounded-2xl border transition-all duration-500 overflow-hidden backdrop-blur-xl
              ${openIndex === index 
                ? 'bg-surface/60 border-accent/30 shadow-2xl shadow-accent/5' 
                : 'bg-surface/20 border-border/30 hover:border-border/50 hover:bg-surface/30'}`}
          >
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full px-8 py-6 flex items-center justify-between text-left group"
            >
              <span className={`font-display font-bold text-lg md:text-xl transition-colors duration-300
                ${openIndex === index ? 'text-accent' : 'text-text/90 group-hover:text-white'}`}>
                {faq.question}
              </span>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500
                ${openIndex === index ? 'bg-accent text-bg rotate-180' : 'bg-surface2 text-muted'}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            
            <div 
              className={`transition-all duration-500 ease-in-out px-8
                ${openIndex === index ? 'max-h-96 pb-8 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}
            >
              <p className="text-muted text-lg leading-relaxed border-l-2 border-accent/20 pl-6 py-2">
                {faq.answer}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Subtle Background Glow for FAQ */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full -z-10 blur-[150px] opacity-[0.05] pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }} />
    </section>
  )
}
