-- Run in Supabase Dashboard → SQL Editor
-- Creates the public profile table linked to Supabase Auth user ids

create table if not exists public.users (
  id uuid primary key,
  username varchar(50) unique not null,
  name varchar(100) not null,
  profile_pic text,
  role varchar(10) check (role in ('user', 'admin')) not null
);
