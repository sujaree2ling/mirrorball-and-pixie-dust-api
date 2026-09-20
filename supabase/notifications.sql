-- Run in Supabase Dashboard → SQL Editor
-- Stores like/comment activity for the notification bell

create table if not exists public.notifications (
  id bigserial primary key,
  recipient_id uuid not null references public.users (id) on delete cascade,
  actor_id uuid references public.users (id) on delete set null,
  post_id bigint references public.posts (id) on delete cascade,
  type text not null check (type in ('comment', 'like', 'thread_comment')),
  excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_id, created_at desc);
