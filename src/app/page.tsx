"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex flex-col relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg opacity-[0.15]" />
        <div
          className="absolute top-0 left-1/4 w-[800px] h-[800px] rounded-full animate-bgPulse"
          style={{
            background:
              "radial-gradient(circle, rgba(200,255,0,0.03) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[600px] h-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,107,53,0.04) 0%, transparent 70%)",
            animationDelay: "4s",
          }}
        />
      </div>

      {/* Navbar */}
      <nav className="relative z-[100] w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => router.push("/")}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent2 flex items-center justify-center shadow-lg shadow-accent/10">
            <svg
              className="w-4 h-4 text-bg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
            </svg>
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            UNIFY
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="font-mono-custom text-[10px] px-3 py-1 rounded-full border border-accent/20 bg-accent/5 text-accent tracking-[0.2em] font-bold uppercase backdrop-blur-sm">
            Beta
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center -mt-20">
        <div className="w-full max-w-4xl pt-20 flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface2/50 border border-border/50 backdrop-blur-sm mb-8 animate-fadeIn">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-mono-custom text-xs text-muted tracking-wide uppercase">
              Widget V1.0 NOW AVAILABLE
            </span>
          </div>

        <h1 className="font-display font-black text-6xl md:text-8xl tracking-tighter mb-6 max-w-4xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 animate-slideDown">
          Your music.
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-[#ccff00] to-accent2">
            Always on top.
          </span>
        </h1>

        <p
          className="font-body text-muted text-lg md:text-xl max-w-xl mx-auto mb-24 leading-relaxed animate-fadeIn"
          style={{ animationDelay: "0.2s" }}
        >
          The desktop widget for power listeners. Control Spotify, YouTube, and
          SoundCloud from one sleek, unified interface that never gets in your
          way.
        </p>

        <div
          className="flex flex-col sm:flex-row items-center gap-4 animate-fadeIn mb-20"
          style={{ animationDelay: "0.4s" }}
        >
          <Link
            href="/download"
            className="group relative px-10 py-5 bg-white text-bg font-display font-bold text-lg rounded-full hover:scale-105 transition-all duration-300"
          >
            <span className="relative z-10 flex items-center gap-2">
              Download Desktop Setup
              <svg
                className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </span>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-accent to-accent2 blur-xl opacity-30 group-hover:opacity-60 transition-opacity" />
          </Link>
        </div>
        </div>

        {/* Large Feature Showcase (Adapted from design.html) */}
        <div className="w-full max-w-7xl mx-auto mt-16 z-20 relative pb-20">
          {/* FEATURE 1: Unified Streaming (Green/Accent) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center mb-48 text-left">
            <div className="lg:col-span-7 relative group">
              <div className="absolute -inset-4 bg-accent/20 blur-[100px] opacity-20 group-hover:opacity-40 transition-opacity rounded-full"></div>
              <div className="relative h-[600px] w-full group-hover:scale-[1.02] transition-transform duration-700 z-10">
                {/* Reactive Glassmorphic Playlist Component Illustration */}
                <div className="absolute inset-0 flex items-center justify-center group/container">
                  {/* Background Particles/Glows */}
                  <div
                    className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(200,255,0,0.1)_0%,transparent_60%)] animate-pulse"
                    style={{ animationDuration: "4s" }}
                  />

                  {/* Outer Wrapper for responsive alignment */}
                  <div className="relative w-full max-w-sm md:max-w-3xl lg:max-w-5xl h-full flex items-center justify-center">
                    {/* Left Side Floating Nodes */}
                    <div className="absolute left-[2%] sm:left-[5%] md:left-[8%] lg:left-[10%] flex flex-col gap-10 md:gap-12 z-20">
                      {/* Spotify Node */}
                      <div className="relative group/node cursor-pointer">
                        <div className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 rounded-[1.25rem] bg-black/80 backdrop-blur-xl border border-[#1db954]/30 shadow-[0_0_30px_rgba(29,185,84,0.2)] flex items-center justify-center transform group-hover/node:-translate-y-2 group-hover/node:shadow-[0_0_40px_rgba(29,185,84,0.4)] transition-all duration-300">
                          <svg
                            className="w-6 h-6 md:w-8 md:h-8 lg:w-10 lg:h-10 text-[#1db954] drop-shadow-[0_0_10px_rgba(29,185,84,0.8)]"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.84.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.2-1.32 11.28-1.02 15.721 1.62.539.3.719 1.02.419 1.56-.239.54-.959.72-1.56.3z" />
                          </svg>
                        </div>
                        {/* Strong Connecting Line */}
                        <div className="absolute top-1/2 left-[calc(100%-4px)] w-[40px] sm:w-[60px] md:w-[90px] lg:w-[120px] h-[2px] bg-[#1db954] shadow-[0_0_10px_rgba(29,185,84,0.8)] -translate-y-1/2 -z-10 flex">
                          <div className="w-1.5 h-1.5 rounded-full bg-white absolute -right-1.5 top-1/2 -translate-y-1/2 shadow-[0_0_10px_white]"></div>
                        </div>
                      </div>

                      {/* Apple Music Node */}
                      <div className="relative group/node cursor-pointer">
                        <div className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 rounded-[1.25rem] bg-black/80 backdrop-blur-xl border border-[#fa243c]/30 shadow-[0_0_30px_rgba(250,36,60,0.2)] flex items-center justify-center transform group-hover/node:-translate-y-2 group-hover/node:shadow-[0_0_40px_rgba(250,36,60,0.4)] transition-all duration-300">
                          <div className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full bg-gradient-to-br from-[#fa243c] to-[#fc4e63] flex items-center justify-center shadow-[0_0_15px_rgba(250,36,60,0.5)]">
                            <svg
                              className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-white"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.32 14.5l-4-2.5v-7h2v5.88l3.05 1.9-1.05 1.72z" />
                            </svg>
                          </div>
                        </div>
                        {/* Strong Connecting Line */}
                        <div className="absolute top-1/2 left-[calc(100%-4px)] w-[30px] sm:w-[50px] md:w-[70px] lg:w-[100px] h-[2px] bg-[#fa243c] shadow-[0_0_10px_rgba(250,36,60,0.8)] -translate-y-1/2 -z-10 flex">
                          <div className="w-1.5 h-1.5 rounded-full bg-white absolute -right-1.5 top-1/2 -translate-y-1/2 shadow-[0_0_10px_white]"></div>
                        </div>
                      </div>

                      {/* Soundcloud Node */}
                      <div className="relative group/node cursor-pointer">
                        <div className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 rounded-[1.25rem] bg-black/80 backdrop-blur-xl border border-[#ff5500]/30 shadow-[0_0_30px_rgba(255,85,0,0.2)] flex items-center justify-center transform group-hover/node:-translate-y-2 group-hover/node:shadow-[0_0_40px_rgba(255,85,0,0.4)] transition-all duration-300">
                          <svg
                            className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-[#ff5500] drop-shadow-[0_0_10px_rgba(255,85,0,0.8)]"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                          </svg>
                        </div>
                        {/* Strong Connecting Line */}
                        <div className="absolute top-1/2 left-[calc(100%-4px)] w-[50px] sm:w-[80px] md:w-[120px] lg:w-[160px] h-[2px] bg-[#ff5500] shadow-[0_0_10px_rgba(255,85,0,0.8)] -translate-y-1/2 -z-10 flex">
                          <div className="w-1.5 h-1.5 rounded-full bg-white absolute -right-1.5 top-1/2 -translate-y-1/2 shadow-[0_0_10px_white]"></div>
                        </div>
                      </div>
                    </div>

                    {/* Right Side Floating Nodes */}
                    <div className="absolute right-[2%] sm:right-[5%] md:right-[8%] lg:right-[10%] flex flex-col gap-12 md:gap-16 z-20">
                      {/* YouTube Node */}
                      <div className="relative group/node cursor-pointer">
                        <div className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 rounded-[1.25rem] bg-black/80 backdrop-blur-xl border border-[#ff0000]/30 shadow-[0_0_30px_rgba(255,0,0,0.2)] flex items-center justify-center transform group-hover/node:-translate-y-2 group-hover/node:shadow-[0_0_40px_rgba(255,0,0,0.4)] transition-all duration-300">
                          <svg
                            className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-[#ff0000] drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm-2 17.5V6.5L16 12l-6 5.5z" />
                          </svg>
                        </div>
                        {/* Strong Connecting Line */}
                        <div className="absolute top-1/2 right-[calc(100%-4px)] w-[50px] sm:w-[80px] md:w-[110px] lg:w-[150px] h-[2px] bg-[#ff0000] shadow-[0_0_10px_rgba(255,0,0,0.8)] -translate-y-1/2 -z-10 flex">
                          <div className="w-1.5 h-1.5 rounded-full bg-white absolute -left-1.5 top-1/2 -translate-y-1/2 shadow-[0_0_10px_white]"></div>
                        </div>
                      </div>
                      {/* YouTube Music Node */}
                      <div className="relative group/node cursor-pointer hidden sm:block">
                        <div className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 rounded-[1.25rem] bg-black/80 backdrop-blur-xl border border-[#ff0000]/30 shadow-[0_0_30px_rgba(255,0,0,0.2)] flex items-center justify-center transform group-hover/node:-translate-y-2 group-hover/node:shadow-[0_0_40px_rgba(255,0,0,0.4)] transition-all duration-300">
                          <div className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full bg-[#ff0000] flex items-center justify-center shadow-[0_0_15px_rgba(255,0,0,0.5)]">
                            <svg
                              className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-white ml-1"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                        {/* Strong Connecting Line */}
                        <div className="absolute top-1/2 right-[calc(100%-4px)] w-[40px] sm:w-[60px] md:w-[90px] lg:w-[120px] h-[2px] bg-[#ff0000] shadow-[0_0_10px_rgba(255,0,0,0.8)] -translate-y-1/2 -z-10 flex">
                          <div className="w-1.5 h-1.5 rounded-full bg-white absolute -left-1.5 top-1/2 -translate-y-1/2 shadow-[0_0_10px_white]"></div>
                        </div>
                      </div>
                    </div>

                    {/* Center Player (Glassmorphic Playlist) */}
                    <div className="relative z-30 w-[240px] sm:w-[280px] md:w-[320px] lg:w-[380px] bg-[#0a0a0c]/90 backdrop-blur-3xl border border-white/20 rounded-3xl p-5 md:p-6 lg:p-8 shadow-[0_40px_80px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)] transform group-hover/container:scale-105 transition-transform duration-700 mx-auto">
                      {/* Outer Glow behind the card */}
                      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-accent/20 to-accent/5 blur-2xl -z-10 opacity-50" />
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-3xl pointer-events-none" />

                      {/* Header */}
                      <div className="relative flex items-center justify-between mb-6 md:mb-8 opacity-90">
                        <svg
                          className="w-5 h-5 md:w-6 md:h-6 text-white hover:text-accent cursor-pointer transition-colors"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M4 6h16M4 12h16M4 18h16"
                          />
                        </svg>
                        <span className="font-display font-bold text-white uppercase tracking-widest text-sm md:text-[15px] drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">
                          Playlist
                        </span>
                        <svg
                          className="w-5 h-5 md:w-6 md:h-6 text-white hover:text-accent cursor-pointer transition-colors"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </div>

                      {/* Track List */}
                      <div className="relative space-y-5 md:space-y-7">
                        {/* Track 1 - Spotify */}
                        <div className="flex flex-col gap-2 group/track cursor-pointer bg-white/5 hover:bg-white/10 p-2 md:p-3 -mx-2 md:-mx-3 rounded-xl transition-colors">
                          <div className="flex items-center gap-3 md:gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#1db954]/20 flex items-center justify-center shadow-[0_0_15px_rgba(29,185,84,0.4)]">
                              <svg
                                className="w-5 h-5 md:w-7 md:h-7 text-[#1db954] drop-shadow-[0_0_5px_rgba(29,185,84,0.5)]"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.84.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.2-1.32 11.28-1.02 15.721 1.62.539.3.719 1.02.419 1.56-.239.54-.959.72-1.56.3z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0 flex items-center justify-between">
                              <div>
                                <h4 className="text-white font-bold text-sm md:text-base truncate">
                                  Til Further Notice
                                </h4>
                                <p className="text-white/60 text-xs md:text-sm truncate font-medium">
                                  Travis Scott & 21 Savage
                                </p>
                              </div>
                              <span className="text-white/60 text-xs md:text-sm font-mono-custom font-bold tracking-wider">
                                3:30
                              </span>
                            </div>
                          </div>
                          <div className="h-1 lg:h-1.5 bg-white/10 rounded-full overflow-hidden ml-[3.5rem] md:ml-[4.2rem] w-[calc(100%-3.5rem)] md:w-[calc(100%-4.2rem)]">
                            <div className="h-full bg-[#1db954] w-[65%] rounded-full shadow-[0_0_10px_rgba(29,185,84,0.8)]" />
                          </div>
                        </div>

                        {/* Track 2 - Apple Music */}
                        <div className="flex flex-col gap-2 group/track cursor-pointer opacity-80 hover:opacity-100 hover:bg-white/5 p-2 md:p-3 -mx-2 md:-mx-3 rounded-xl transition-all">
                          <div className="flex items-center gap-3 md:gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#fa243c]/20 flex items-center justify-center">
                              <svg
                                className="w-4 h-4 md:w-6 md:h-6 text-[#fa243c] drop-shadow-[0_0_5px_rgba(250,36,60,0.5)]"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.32 14.5l-4-2.5v-7h2v5.88l3.05 1.9-1.05 1.72z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0 flex items-center justify-between">
                              <div>
                                <h4 className="text-white font-bold text-sm md:text-base truncate">
                                  No Pole
                                </h4>
                                <p className="text-white/60 text-xs md:text-sm truncate font-medium">
                                  Don Toliver
                                </p>
                              </div>
                              <span className="text-white/60 text-xs md:text-sm font-mono-custom font-bold tracking-wider">
                                2:48
                              </span>
                            </div>
                          </div>
                          <div className="h-1 lg:h-1.5 bg-white/10 rounded-full overflow-hidden ml-[3.5rem] md:ml-[4.2rem] w-[calc(100%-3.5rem)] md:w-[calc(100%-4.2rem)]">
                            <div className="h-full bg-[#fa243c] w-[45%] rounded-full shadow-[0_0_10px_rgba(250,36,60,0.8)]" />
                          </div>
                        </div>

                        {/* Track 3 - Soundcloud */}
                        <div className="flex flex-col gap-2 group/track cursor-pointer opacity-80 hover:opacity-100 hover:bg-white/5 p-2 md:p-3 -mx-2 md:-mx-3 rounded-xl transition-all">
                          <div className="flex items-center gap-3 md:gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#ff5500]/20 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 md:w-7 md:h-7 text-[#ff5500] drop-shadow-[0_0_5px_rgba(255,85,0,0.5)]"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0 flex items-center justify-between">
                              <div>
                                <h4 className="text-white font-bold text-sm md:text-base truncate">
                                  Attention
                                </h4>
                                <p className="text-white/60 text-xs md:text-sm truncate font-medium">
                                  Charlie Puth
                                </p>
                              </div>
                              <span className="text-white/60 text-xs md:text-sm font-mono-custom font-bold tracking-wider">
                                3:28
                              </span>
                            </div>
                          </div>
                          <div className="h-1 lg:h-1.5 bg-white/10 rounded-full overflow-hidden ml-[3.5rem] md:ml-[4.2rem] w-[calc(100%-3.5rem)] md:w-[calc(100%-4.2rem)]">
                            <div className="h-full bg-[#ff5500] w-[20%] rounded-full shadow-[0_0_10px_rgba(255,85,0,0.8)]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-5 space-y-6">
              <span className="inline-block px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent font-bold text-xs uppercase tracking-widest font-mono-custom">
                Core Engine
              </span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-black tracking-tighter leading-tight text-white focus:outline-none">
                Unified
                <br />
                Streaming
              </h2>
              <p className="text-muted text-lg lg:text-xl leading-relaxed italic border-l-4 border-accent pl-6 py-2">
                "All your media, in one elegant feed."
              </p>
              <p className="text-muted text-lg leading-relaxed">
                Stream songs from Spotify, YouTube, YouTube Music, SoundCloud
                and Apple Music inside one visually striking, unified interface.
                No more bouncing between tabs.
              </p>
            </div>
          </section>

          {/* FEATURE 2: Playlist Portability (Pink/Accent2) */}
          <section className="grid grid-cols-1 lg:grid-cols-11 gap-4 lg:gap-8 items-center mb-48 text-left">
            <div className="lg:col-span-5 order-2 lg:order-1 space-y-6 lg:pl-16">
              <span className="inline-block px-4 py-1.5 rounded-full bg-accent2/10 border border-accent2/20 text-accent2 font-bold text-xs uppercase tracking-widest font-mono-custom">
                Cross-Platform
              </span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-black tracking-tighter leading-tight text-white focus:outline-none">
                Playlist
                <br />
                Portability
              </h2>
              <p className="text-muted text-lg lg:text-xl leading-relaxed italic border-l-4 border-accent2 pl-6 py-2">
                "Your playlists, across any platform."
              </p>
              <p className="text-muted text-lg leading-relaxed">
                You can import or export any existing playlist here on Unify.
                Your music, wherever you want it without arbitrary lock-ins or
                restrictions.
              </p>
              <div className="flex gap-4 pt-4">
                <svg
                  className="w-10 h-10 text-accent2 opacity-80"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
                <svg
                  className="w-10 h-10 text-accent2 opacity-80"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <svg
                  className="w-10 h-10 text-accent2 opacity-80"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
            </div>
            <div className="lg:col-span-6 order-1 lg:order-2 relative group flex items-center justify-center">
              <div className="absolute -inset-10 bg-accent2/20 blur-[120px] opacity-20 group-hover:opacity-40 transition-opacity rounded-full"></div>
              <div className="relative w-full h-[450px] lg:h-[500px] flex items-center justify-center group-hover:scale-[1.05] transition-transform duration-700">
                <img
                  className="w-full h-full object-contain opacity-90 drop-shadow-[0_0_30px_rgba(255,107,53,0.3)]"
                  alt="Playlist Portability Visual"
                  src="/image.png"
                />
              </div>
            </div>
          </section>

          {/* FEATURE 3: Smart Migration (Purple/Indigo) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center mb-48 text-left">
            <div className="lg:col-span-7 relative group py-12">
              <div className="absolute -inset-10 bg-indigo-500/20 blur-[120px] opacity-10 group-hover:opacity-30 rounded-full transition-opacity duration-700"></div>
              <div className="relative w-full group-hover:scale-[1.02] transform transition-transform duration-700">
                {/* Header Information */}
                <div className="flex justify-between items-end mb-8 px-2">
                  <div className="space-y-1">
                    <span className="font-display font-bold text-indigo-400 tracking-widest text-xs lg:text-sm uppercase block">
                      MIGRATING LIBRARY
                    </span>
                    <h3 className="text-white/60 text-xs font-mono-custom">
                      Syncing 1,248 tracks across platforms
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-indigo-400 font-bold tracking-widest font-mono-custom text-2xl lg:text-3xl block">
                      87%
                    </span>
                  </div>
                </div>

                {/* Progress Bar Container */}
                <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 mb-16 relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-indigo-400/20 animate-pulse"></div>
                  <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-400 to-indigo-500 w-[87%] shadow-[0_0_25px_rgba(99,102,241,0.6)] relative z-10 transition-all duration-1000 ease-out">
                    <div className="absolute top-0 right-0 h-full w-24 bg-gradient-to-r from-transparent to-white/30 animate-[shimmer_2s_infinite]"></div>
                  </div>
                </div>

                {/* Platform Flow UI */}
                <div className="relative pt-4">
                  {/* Glowing Connection Beam */}
                  <div className="absolute top-[2.5rem] left-10 right-10 h-[1.5px] bg-white/5 -translate-y-1/2 rounded-full overflow-hidden">
                    <div
                      className="h-full w-[80%] bg-gradient-to-r from-indigo-500/0 via-indigo-400 to-indigo-500/0 animate-[shimmer_3s_infinite]"
                      style={{ transition: "width 1s ease-in-out" }}
                    />
                  </div>

                  <div className="flex items-center justify-between relative z-10">
                    {/* Spotify Node */}
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 lg:w-20 lg:h-20 bg-black/40 backdrop-blur-xl rounded-2xl border border-[#1DB954]/20 shadow-[0_0_40px_rgba(29,185,84,0.1)] flex items-center justify-center text-[#1DB954] hover:scale-110 hover:shadow-[0_0_50px_rgba(29,185,84,0.3)] transition-all duration-500 group/spotify">
                        <svg className="w-8 h-8 lg:w-10 lg:h-10 drop-shadow-[0_0_15px_rgba(29,185,84,0.5)] z-10" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.84.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.2-1.32 11.28-1.02 15.721 1.62.539.3.719 1.02.419 1.56-.239.54-.959.72-1.56.3z" />
                        </svg>
                      </div>
                      <span className="text-[10px] lg:text-[11px] font-mono-custom tracking-[0.2em] text-[#1DB954] font-bold opacity-80 decoration-indigo-400 decoration-2">SPOTIFY</span>
                    </div>

                    {/* Central Processing Node */}
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-12 h-12 lg:w-16 lg:h-16 bg-indigo-500/10 backdrop-blur-3xl rounded-full border border-indigo-400/30 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.4)] z-20 animate-pulse">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center">
                          <svg className="w-4 h-4 lg:w-5 lg:h-5 text-white animate-spin" style={{ animationDuration: "3s" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </div>
                      </div>
                      <span className="text-[10px] lg:text-[11px] font-mono-custom tracking-[0.2em] text-indigo-400 font-medium opacity-60 animate-pulse">PROCESSING</span>
                    </div>

                    {/* YT Music Node */}
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 lg:w-20 lg:h-20 bg-black/40 backdrop-blur-xl rounded-2xl border border-[#FF0000]/20 shadow-[0_0_40px_rgba(255,0,0,0.1)] flex items-center justify-center text-[#FF0000] hover:scale-110 hover:shadow-[0_0_50_px_rgba(255,0,0,0.3)] transition-all duration-500 group/yt">
                        <svg className="w-8 h-8 lg:w-10 lg:h-10 drop-shadow-[0_0_15px_rgba(255,0,0,0.5)] z-10" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm-2 17.5V6.5L16 12l-6 5.5z" />
                        </svg>
                      </div>
                      <span className="text-[10px] lg:text-[11px] font-mono-custom tracking-[0.2em] text-[#FF0000] font-bold opacity-80">YT MUSIC</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-5 space-y-6">
              <span className="inline-block px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold text-xs uppercase tracking-widest font-mono-custom">
                Automation
              </span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-black tracking-tighter leading-tight text-white focus:outline-none">
                Smart
                <br />
                Migration
              </h2>
              <p className="text-muted text-lg lg:text-xl leading-relaxed italic border-l-4 border-indigo-500 pl-6 py-2">
                "Switch platforms in a single click."
              </p>
              <p className="text-muted text-lg leading-relaxed">
                Our Migrate feature lets you move any Spotify playlist you have
                to an alternate platform—finding the exact same songs so that
                you don't have to face ads and limits.
              </p>
            </div>
          </section>

          {/* BENTO GRID SECTION */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left mt-12">
            {/* Keyboard First (Green) */}
            <div className="md:col-span-1 bg-black/40 backdrop-blur-xl rounded-xl p-8 lg:p-10 border border-white/10 flex flex-col justify-between shadow-xl group border-t border-white/20 transition-all duration-500">
              <div>
                <div className="flex gap-2 mb-10">
                  <kbd className="px-3 py-1.5 bg-black/60 rounded border border-white/20 text-accent text-sm font-mono-custom">
                    ⌘
                  </kbd>
                  <kbd className="px-3 py-1.5 bg-black/60 rounded border border-white/20 text-accent text-xs font-mono-custom">
                    SHIFT
                  </kbd>
                  <kbd className="px-3 py-1.5 bg-black/60 rounded border border-white/20 text-accent text-sm font-mono-custom">
                    W
                  </kbd>
                </div>
                <h3 className="text-3xl font-display font-bold mb-4 text-white">
                  Keyboard First
                </h3>
                <p className="text-muted text-sm italic border-l-2 border-accent pl-4 mb-6">
                  "Speed of thought control."
                </p>
                <p className="text-muted text-base leading-relaxed">
                  No need to open a tab for anything. Operate entirely with your
                  keyboard—every major function is keyboard configured or
                  shortcut enabled.
                </p>
              </div>
              <div className="mt-12 text-accent">
                <svg
                  className="w-12 h-12"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
            </div>

            {/* Always On Top (Pink) */}
            <div className="md:col-span-1 bg-black/40 backdrop-blur-xl rounded-xl p-8 lg:p-10 border border-white/10 flex flex-col justify-between overflow-hidden relative shadow-xl group border-t border-white/20">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none transition-opacity group-hover:opacity-100 opacity-50" />
              <div className="relative z-10">
                <h3 className="text-3xl font-display font-bold mb-4 text-white">
                  Always On Top
                </h3>
                <p className="text-muted text-sm italic border-l-2 border-accent2 pl-4 mb-6">
                  "Your media, always in view."
                </p>
                <p className="text-muted text-base leading-relaxed">
                  A lightweight, semi-transparent overlay that keeps your video
                  content visible while you work.
                </p>
              </div>
              <div className="mt-12 relative h-32 flex items-center justify-center">
                <div className="absolute w-40 h-24 bg-surface/90 rounded-xl border border-accent2/30 shadow-[0_10px_30px_rgba(255,107,53,0.15)] flex items-center justify-center transform group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500">
                  <svg
                    className="w-8 h-8 text-accent2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 5h14v14H5z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Low Resource (Purple/Indigo) */}
            <div className="md:col-span-1 bg-black/40 backdrop-blur-xl rounded-xl p-8 lg:p-10 border border-white/10 flex flex-col justify-between shadow-xl group border-t border-white/20 transition-all duration-500">
              <div>
                <h3 className="text-3xl font-display font-bold mb-4 text-white">
                  Low Resource
                </h3>
                <p className="text-muted text-sm italic border-l-2 border-indigo-400 pl-4 mb-6">
                  "Blazing fast, zero bloat."
                </p>
                <p className="text-muted text-base leading-relaxed">
                  Engineered in Rust for minimum CPU impact. Unify consumes 70%
                  less RAM than a standard browser tab.
                </p>
              </div>
              <div className="mt-12 flex items-end gap-2 h-16 opacity-80 group-hover:opacity-100 transition-opacity">
                <div className="w-full bg-indigo-500/20 h-[30%] rounded-t-sm transition-all duration-500 group-hover:h-[40%]"></div>
                <div className="w-full bg-indigo-500/20 h-[45%] rounded-t-sm transition-all duration-500 group-hover:h-[55%]"></div>
                <div className="w-full bg-indigo-500/20 h-[20%] rounded-t-sm transition-all duration-500 group-hover:h-[30%]"></div>
                <div className="w-full bg-indigo-400 h-[15%] rounded-t-sm shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-500 group-hover:h-[25%]"></div>
                <div className="w-full bg-indigo-400 h-[10%] rounded-t-sm shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-500 group-hover:h-[20%]"></div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-8 border-t border-border/40 mt-20 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-muted text-sm font-mono-custom">
          © {new Date().getFullYear()} UNIFY — Universal Engine
        </div>
        <div className="flex items-center gap-6">
          <a
            href="#"
            className="text-muted hover:text-text transition-colors text-sm font-mono-custom"
          >
            Twitter
          </a>
          <a
            href="#"
            className="text-muted hover:text-text transition-colors text-sm font-mono-custom"
          >
            Discord
          </a>
          <a
            href="#"
            className="text-muted hover:text-text transition-colors text-sm font-mono-custom"
          >
            Support
          </a>
        </div>
      </footer>
    </div>
  );
}
