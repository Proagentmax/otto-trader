-- Otto Trader v3.2 — TradingView alert watcher memory. Run once in the SQL Editor.
-- The every-2-minutes schedule that drives it is set up with the cron secret,
-- which is NOT kept in this public repo (see the setup file sent in chat).
create table if not exists public.otto_alert_fires (
  key         text primary key,           -- alert id | fire time
  payload     jsonb,
  created_at  timestamptz not null default now()
);
alter table public.otto_alert_fires enable row level security;
revoke all on public.otto_alert_fires from anon, authenticated;
