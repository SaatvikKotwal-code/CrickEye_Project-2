create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  video_url text not null,
  status text not null check (status in ('uploaded', 'processing', 'completed', 'failed')),
  results jsonb,
  created_at timestamp with time zone default now()
);

-- Same binary video (per user): skip re-running the pipeline and replay saved results.
alter table public.sessions add column if not exists file_hash text;

create index if not exists sessions_user_file_hash_idx
  on public.sessions (user_id, file_hash)
  where file_hash is not null;

-- ── Row Level Security: sessions ───────────────────────────────────────────
-- Without these policies, inserts/updates from the browser fail with:
--   "new row violates row-level security policy"

alter table public.sessions enable row level security;

drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;

create policy "sessions_select_own"
  on public.sessions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "sessions_insert_own"
  on public.sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "sessions_update_own"
  on public.sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Storage: bucket "videos" (run after creating the bucket in the UI) ─────
-- If uploads fail with RLS errors, run this in the SQL editor.

drop policy if exists "videos_insert_authenticated" on storage.objects;
drop policy if exists "videos_select_authenticated" on storage.objects;
drop policy if exists "videos_select_public" on storage.objects;

create policy "videos_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'videos');

create policy "videos_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'videos');

-- Optional: allow public read (e.g. public bucket + getPublicUrl in browser)
create policy "videos_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'videos');
