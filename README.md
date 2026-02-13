# UNIFY — Universal Playlist Engine

One playlist to rule them all. Spotify, YouTube, SoundCloud, Apple Music — coexist without switching apps.

## Features

- 🎵 **Universal links** — paste any Spotify, YouTube, SoundCloud, or Apple Music URL
- 🔍 **Auto-resolve metadata** — title, artist, and thumbnail fetched automatically (YouTube + SoundCloud via oEmbed, no API key needed)
- 🗂️ **Multiple playlists** — create and manage as many playlists as you want
- 🖱️ **Drag to reorder** — powered by `@dnd-kit`
- 📤 **Export / Import** — save playlists as JSON and restore them
- 🔐 **Auth** — sign in with Google or GitHub via NextAuth.js
- 💾 **Local storage** — works offline without signing in
- 🎨 **Platform filters** — filter by Spotify, YouTube, etc.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Setting Up OAuth Providers

### Google

1. Go to [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project → Enable **Google+ API**
3. Go to **Credentials** → Create **OAuth 2.0 Client ID**
4. Set Authorized redirect URI to: `http://localhost:3000/api/auth/callback/google`
5. Copy Client ID and Secret to `.env.local`

### GitHub

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. New OAuth App
3. Set Authorization callback URL to: `http://localhost:3000/api/auth/callback/github`
4. Copy Client ID and Secret to `.env.local`

---

## Auto-fetching Track Metadata

| Platform    | Auto-fetch | Requires API Key |
|-------------|-----------|-----------------|
| YouTube     | ✅ Title, artist, thumbnail | No (oEmbed) |
| SoundCloud  | ✅ Title, artist, thumbnail | No (oEmbed) |
| Spotify     | ✅ Title, artist, thumbnail, duration | Yes (optional) |
| Apple Music | ⚠️ Parsed from URL | No |

### Optional: Spotify metadata

To enable Spotify auto-fetch, get an access token from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and add it to `.env.local`:

```env
SPOTIFY_ACCESS_TOKEN=your_token_here
```

> Note: Access tokens expire after 1 hour. For production, implement the [Client Credentials flow](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow) with token refresh.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/  # NextAuth handler
│   │   └── resolve/             # Track metadata resolver
│   ├── auth/signin/             # Custom sign-in page
│   ├── layout.tsx
│   ├── page.tsx                 # Main app page
│   ├── providers.tsx            # SessionProvider wrapper
│   └── globals.css
├── components/
│   ├── AddTrack.tsx             # URL input + resolve
│   ├── EditTrackModal.tsx       # Edit title/artist
│   ├── Navbar.tsx               # Top bar with auth
│   ├── PlaylistView.tsx         # Track list + DnD
│   ├── Sidebar.tsx              # Playlist management
│   └── SortableTrackCard.tsx    # Individual track card
├── lib/
│   ├── platform.ts              # Platform detection + utils
│   └── usePlaylists.ts          # State management hook
└── types/
    └── index.ts                 # TypeScript types
```

---

## Deploying to Vercel

```bash
npm run build   # verify build passes
```

Then push to GitHub and import in [Vercel](https://vercel.com). Add your environment variables in the Vercel project settings.

Set `NEXTAUTH_URL` to your production URL (e.g. `https://unify.vercel.app`).

---

## Built With

- [Next.js 14](https://nextjs.org/) — App Router
- [NextAuth.js](https://next-auth.js.org/) — Authentication
- [@dnd-kit](https://dndkit.com/) — Drag and drop
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [Lucide React](https://lucide.dev/) — Icons
- [Syne + DM Mono](https://fonts.google.com/) — Typography
