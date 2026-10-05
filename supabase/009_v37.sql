-- Otto Trader v3.7 — Jason's calls from Discord. Run once in the SQL Editor.
-- Every post Jason makes in #platinum-chat that reaches Otto (pasted screenshot
-- or the 5 PM sweep), sorted call / level / note. Dated ideas: scored, never
-- part of the teaching brain.
create table if not exists public.otto_jason (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  day          date not null,                 -- New York date of the post
  posted_at    timestamptz,
  posted_label text,                          -- "10:02 AM"
  kind         text not null check (kind in ('call','level','note')),
  ticker       text,
  direction    text check (direction in ('long','short')),
  late         boolean not null default false,
  entry        numeric,
  level        numeric,
  option       text,
  pinged       boolean not null default false,
  words        text not null,                 -- Jason's exact words
  chart        text,
  summary      text,
  source       text not null default 'paste', -- paste | sweep
  added_by     text,
  action_id    text,                          -- the Desk card made from it
  score        jsonb,
  fp           text unique                    -- day|time|words, so a post is saved once
);
create index if not exists otto_jason_day on public.otto_jason (day);
alter table public.otto_jason enable row level security;
revoke all on public.otto_jason from anon, authenticated;
