-- Data API grants only (Supabase PostgREST / supabase-js).
-- Included in backend/supabase_schema.sql and RUN_IN_SUPABASE_SQL_EDITOR.sql.

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.sessions to service_role;
