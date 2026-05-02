export interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: number;
  url: string;
  platform: string;
  stream_url?: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

export interface User {
  id: string;
  email?: string;
}