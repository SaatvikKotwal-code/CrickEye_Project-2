-- Run once in Supabase SQL Editor if delete from the app returns RLS errors.
-- (Also included in backend/supabase_schema.sql for fresh installs.)

drop policy if exists "sessions_delete_own" on public.sessions;

create policy "sessions_delete_own"
  on public.sessions for delete
  to authenticated
  using (auth.uid() = user_id);
