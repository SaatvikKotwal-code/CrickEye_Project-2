-- Run once in Supabase SQL Editor: column + RLS so coaches can hide demo players from the dashboard.
-- (Also merged into backend/supabase_schema.sql for new projects.)

alter table public.profiles
  add column if not exists hidden_from_coach_dashboard boolean not null default false;

drop policy if exists "profiles_update_coach" on public.profiles;

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

-- Optional: bulk-hide known demo emails (edit list, then run):
-- update public.profiles
-- set hidden_from_coach_dashboard = true
-- where role = 'player' and email in ('demo1@example.com', 'demo2@example.com');
