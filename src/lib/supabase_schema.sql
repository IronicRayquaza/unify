-- Enable the UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES TABLE
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  username text,
  avatar_url text,
  updated_at timestamp with time zone
);

-- Set up Row Level Security (RLS) for profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- PLAYLISTS TABLE
create table public.playlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  name text not null,
  description text,
  cover_url text,
  is_public boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for playlists
alter table public.playlists enable row level security;

create policy "Playlists are viewable by everyone if public, or by owner."
  on playlists for select
  using ( is_public or auth.uid() = user_id );

create policy "Users can create their own playlists."
  on playlists for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own playlists."
  on playlists for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own playlists."
  on playlists for delete
  using ( auth.uid() = user_id );

-- TRACKS TABLE (Global library of tracks)
create table public.tracks (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  artist text,
  url text not null,
  thumbnail text,
  platform text not null, -- 'youtube', 'soundcloud', 'spotify'
  duration integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(url) -- Avoid duplicate tracks by URL
);

-- RLS for tracks (readable by all, insertable by authenticated users)
alter table public.tracks enable row level security;

create policy "Tracks are viewable by everyone."
  on tracks for select
  using ( true );

create policy "Authenticated users can insert tracks."
  on tracks for insert
  with check ( auth.role() = 'authenticated' );

-- PLAYLIST_TRACKS TABLE (Junction table)
create table public.playlist_tracks (
  id uuid default uuid_generate_v4() primary key,
  playlist_id uuid references public.playlists(id) on delete cascade not null,
  track_id uuid references public.tracks(id) not null,
  position integer not null, -- For ordering
  added_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for playlist_tracks
alter table public.playlist_tracks enable row level security;

-- Policies inherit from the playlist ownership
create policy "Playlist tracks are viewable by everyone if playlist is public, or by owner."
  on playlist_tracks for select
  using (
    exists (
      select 1 from playlists
      where playlists.id = playlist_tracks.playlist_id
      and (playlists.is_public or playlists.user_id = auth.uid())
    )
  );

create policy "Users can add tracks to their own playlists."
  on playlist_tracks for insert
  with check (
    exists (
      select 1 from playlists
      where playlists.id = playlist_tracks.playlist_id
      and playlists.user_id = auth.uid()
    )
  );

create policy "Users can remove tracks from their own playlists."
  on playlist_tracks for delete
  using (
    exists (
      select 1 from playlists
      where playlists.id = playlist_tracks.playlist_id
      and playlists.user_id = auth.uid()
    )
  );

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, username, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
