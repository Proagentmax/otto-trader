-- (numbered 028 so it never collides with a v3.44 SQL file that may take 027.)
-- Otto Trader v3.45 (22 Oct 2026) — Homework: the coach's after-close read, one row per trading day it is FOR (for_day) per author.
-- Otto fills the numbers (data, snapshotted at hand-in); Josh writes the answers. Due 9:00 AM ET on for_day. Never blocks a card:
-- a skipped night is flagged (Desk banner, card tag, morning read, Friday report card). Graded at 4:05 PM on for_day (grade).
create table if not exists public.otto_homework (
  id            bigserial primary key,
  for_day       date not null,
  author        text not null,
  answers       jsonb not null default '{}'::jsonb,
  call          text check (call is null or call in ('bullish','slightly bullish','slightly bearish','bearish')),
  levels        jsonb not null default '[]'::jsonb,
  data          jsonb,
  status        text not null default 'draft' check (status in ('draft','handed_in')),
  handed_in_at  timestamptz,
  grade         jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists otto_homework_day_author on public.otto_homework (for_day, author);
alter table public.otto_homework enable row level security;
revoke all on public.otto_homework from anon, authenticated;
