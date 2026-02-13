import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        text: '#ffffff',
        primary: '#c8ff00', // alias for accent
        bg: '#0a0a0f',
        surface: '#111118',
        surface2: '#1a1a24',
        border: '#2a2a3a',
        accent: '#c8ff00',
        accent2: '#ff6b35',
        muted: '#6b6b88',
        spotify: '#1DB954',
        youtube: '#FF0000',
        soundcloud: '#ff5500',
        apple: '#fc3c44',
      },
      keyframes: {
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        trackIn: {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        wave: {
          from: { transform: 'scaleY(0.4)' },
          to: { transform: 'scaleY(1)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        bgPulse: {
          from: { transform: 'scale(1) rotate(0deg)' },
          to: { transform: 'scale(1.1) rotate(2deg)' },
        },
      },
      animation: {
        slideDown: 'slideDown 0.5s cubic-bezier(0.16,1,0.3,1) both',
        slideUp: 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        trackIn: 'trackIn 0.4s cubic-bezier(0.16,1,0.3,1) both',
        wave: 'wave 0.8s ease-in-out infinite alternate',
        fadeIn: 'fadeIn 0.4s ease both',
        bgPulse: 'bgPulse 8s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [],
}

export default config
