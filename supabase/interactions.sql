-- Run in Supabase Dashboard → SQL Editor (safe if tables already exist)
-- Persists blog likes and comments

create table if not exists public.comments (
  id serial primary key,
  post_id integer references public.posts (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  comment_text text not null,
  created_at timestamp without time zone default current_timestamp
);

create index if not exists comments_post_id_created_at_idx
  on public.comments (post_id, created_at desc);

create table if not exists public.post_likes (
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_id_idx
  on public.post_likes (user_id);
