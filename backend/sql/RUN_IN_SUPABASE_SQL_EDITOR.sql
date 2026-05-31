-- =============================================================================
-- Crickeye — run this ONCE in Supabase → SQL Editor → New query → Run
-- (Idempotent: safe to re-run; uses IF NOT EXISTS / DROP POLICY IF EXISTS)
-- =============================================================================

-- 1) Data API grants (Supabase email re Oct 2026 — future-proof existing tables)
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.sessions to service_role;

-- 2) Session delete from the app (My Sessions → remove / clear all)
drop policy if exists "sessions_delete_own" on public.sessions;

create policy "sessions_delete_own"
  on public.sessions for delete
  to authenticated
  using (auth.uid() = user_id);

-- 3) Storage bucket "videos" — upload (own folder), replace, delete, read
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

create policy "videos_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'videos');
