create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  age integer check (age between 8 and 100),
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  role text not null default 'player' check (role in ('player', 'coach')),
  created_at timestamp with time zone default now()
);

-- Coach dashboard: hide demo/legacy players without deleting accounts or data.
alter table public.profiles add column if not exists hidden_from_coach_dashboard boolean not null default false;

alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email_key on public.profiles (email);

create index if not exists profiles_role_created_at_idx
  on public.profiles (role, created_at desc);

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

create index if not exists sessions_user_created_at_idx
  on public.sessions (user_id, created_at desc);

-- ── Data API grants (Supabase PostgREST / supabase-js) ─────────────────────
-- Explicit grants for profiles + sessions. Safe on existing projects; required
-- for new public tables after Supabase's Oct 2026 rollout.

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.sessions to service_role;

-- ── Row Level Security: sessions ───────────────────────────────────────────
-- Without these policies, inserts/updates from the browser fail with:
--   "new row violates row-level security policy"

alter table public.sessions enable row level security;
alter table public.profiles enable row level security;

create or replace function public.is_coach(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'coach'
  );
$$;

revoke all on function public.is_coach(uuid) from public;
grant execute on function public.is_coach(uuid) to authenticated;

drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;
drop policy if exists "sessions_delete_own" on public.sessions;
drop policy if exists "profiles_select_self_or_coach" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_update_coach" on public.profiles;

create policy "sessions_select_own"
  on public.sessions for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_coach(auth.uid())
  );

create policy "sessions_insert_own"
  on public.sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "sessions_update_own"
  on public.sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lets players remove saved session rows (e.g. re-test same video with a new pipeline).
create policy "sessions_delete_own"
  on public.sessions for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "profiles_select_self_or_coach"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_coach(auth.uid())
  );

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and role = 'player');

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (
      select p.role
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    )
  );

-- Coaches may update player rows (e.g. hide demo accounts from the dashboard).
create policy "profiles_update_coach"
  on public.profiles for update
  to authenticated
  using (
    public.is_coach(auth.uid())
    and id <> auth.uid()
    and role = 'player'
  )
  with check (
    public.is_coach(auth.uid())
    and id <> auth.uid()
    and role = 'player'
  );

-- ── Storage: bucket "videos" (run after creating the bucket in the UI) ─────
-- If uploads fail with RLS errors, run this in the SQL editor.

drop policy if exists "videos_insert_authenticated" on storage.objects;
drop policy if exists "videos_select_authenticated" on storage.objects;
drop policy if exists "videos_select_public" on storage.objects;
drop policy if exists "videos_delete_own" on storage.objects;
drop policy if exists "videos_update_own" on storage.objects;

create policy "videos_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "videos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "videos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "videos_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'videos');

-- Optional: allow public read (e.g. public bucket + getPublicUrl in browser)
create policy "videos_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'videos');
