-- Run once in Supabase SQL Editor so the app can delete uploaded videos (frees storage quota).
-- Also included in backend/supabase_schema.sql for fresh installs.

drop policy if exists "videos_delete_own" on storage.objects;
drop policy if exists "videos_update_own" on storage.objects;

-- Required when upload uses upsert: true (same file hash replaces one object per user).
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
