-- Otto Trader v3.18 — 🌅 Morning Prep (7 Oct 2026). Runs automatically through the deploy workflow's SQL ledger.
-- One morning sentiment read per person per day (Ifoma / Josh): their notes + charts, Jarvis's questions and grade,
-- the levels it read (with "+ Watcher"), and the 4:05 PM grade against the tape. No new cron job: the grade rides
-- the existing every-minute otto-watch job (?fn=cron_watch).
create table if not exists public.otto_prep (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  day         date not null,
  author      text not null check (author in ('Ifoma','Josh')),
  notes       text not null default '',
  imgs        int not null default 0,
  status      text not null default 'asking' check (status in ('asking','asked','graded')),
  thread      jsonb not null default '[]'::jsonb,
  bias        text check (bias in ('long','short','neutral')),
  main        text,
  levels      jsonb not null default '[]'::jsonb,
  grade       jsonb,
  result      jsonb
);
create unique index if not exists otto_prep_day_author on public.otto_prep (day, author);

create table if not exists public.otto_prep_imgs (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  prep_id     bigint not null references public.otto_prep(id) on delete cascade,
  mime        text,
  data        text not null              -- base64, shrunk in the browser (max 1600px JPEG)
);
create index if not exists otto_prep_imgs_prep on public.otto_prep_imgs (prep_id);

alter table public.otto_prep enable row level security;
alter table public.otto_prep_imgs enable row level security;
revoke all on public.otto_prep, public.otto_prep_imgs from anon, authenticated;
