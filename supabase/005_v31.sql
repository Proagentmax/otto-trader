-- Otto Trader v3.1 — sentiment history, journal, weekly reviews, scorecard fields.
-- Run once in Supabase → SQL Editor. Safe to re-run. Service-role only, like 004.
-- The two scheduled jobs (8:45 read, Friday review) are set up separately with the
-- cron secret — that SQL is NOT kept in this public repo.

create table if not exists public.otto_sentiment (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  kind     text not null default 'live',      -- 'live' snapshot or 'auto' (8:45 run)
  verdict  text,
  score    int,
  payload  jsonb,
  news     text
);
create index if not exists otto_sentiment_at on public.otto_sentiment (at desc);

create table if not exists public.otto_trades (
  id             text primary key,             -- account|option|opening order
  account        text,                          -- masked label, e.g. "Agentic ••7012"
  symbol         text,
  contract       text,
  option_id      text,
  side           text,                          -- long / short
  qty            numeric,
  entry          numeric,
  exit           numeric,
  pnl            numeric,
  opened_at      timestamptz,
  closed_at      timestamptz,
  status         text,                          -- open / partial / closed / expired
  open_order_id  text,
  agent          text,                          -- user / agentic
  action_id      uuid references public.otto_actions(id) on delete set null,
  reason         text,                          -- Jason's rule: every trade needs one
  reason_by      text,
  reason_at      timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists otto_trades_opened on public.otto_trades (opened_at desc);

create table if not exists public.otto_reviews (
  week_start  date primary key,
  payload     jsonb not null,
  built_by    text,
  created_at  timestamptz not null default now()
);

alter table public.otto_actions add column if not exists plan     jsonb;
alter table public.otto_actions add column if not exists banner   jsonb;
alter table public.otto_actions add column if not exists checks   jsonb;
alter table public.otto_actions add column if not exists order_id text;
alter table public.otto_actions add column if not exists outcome  jsonb;

alter table public.otto_sentiment enable row level security;
alter table public.otto_trades    enable row level security;
alter table public.otto_reviews   enable row level security;
revoke all on public.otto_sentiment, public.otto_trades, public.otto_reviews from anon, authenticated;
revoke all on sequence public.otto_sentiment_id_seq from anon, authenticated;
