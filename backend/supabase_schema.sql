create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  video_url text not null,
  status text not null check (status in ('uploaded', 'processing', 'completed', 'failed')),
  results jsonb,
  created_at timestamp with time zone default now()
);
