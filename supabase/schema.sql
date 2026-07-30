-- Run this in Supabase Dashboard → SQL Editor
-- WARNING: This deletes the existing public.posts table and recreates it
-- so it matches this project (blogPosts seed).

drop policy if exists "Public can read published posts" on public.posts;
drop policy if exists "Anon can insert posts for seed" on public.posts;

drop table if exists public.posts cascade;

create table public.posts (
  id bigint primary key,
  title text not null,
  description text not null default '',
  content text not null default '',
  category text not null default 'General',
  image text not null default '',
  image_position text not null default 'center',
  author text not null default 'Admin',
  date date not null default current_date,
  likes integer not null default 0,
  status text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "Public can read published posts"
  on public.posts
  for select
  using (status = 'published');

-- Allows inserting rows from SQL Editor / seed (anon key).
create policy "Anon can insert posts for seed"
  on public.posts
  for insert
  with check (true);
