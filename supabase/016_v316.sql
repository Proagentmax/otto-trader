-- Otto Trader v3.16 — Signals that always end in a card or a reason; Jarvis's promises backed by code (7 Oct 2026).
-- Runs automatically through the deploy workflow's SQL ledger. No new cron job: check-ins, the missed-ping sweep
-- and the 9:10 Signal self-test ride the existing every-minute otto-watch job (?fn=cron_watch).

-- The coach's result posts ("$1000 FOR 2 PUTS ON MU", "NICE SHORT ON MU") are kept as 'result', linked to his call.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.otto_jason'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop execute format('alter table public.otto_jason drop constraint %I', c); end loop;
end $$;
alter table public.otto_jason add constraint otto_jason_kind_check check (kind in ('call','level','note','result'));
alter table public.otto_jason add column if not exists result_for bigint;

-- Post → ping → card timings for every Signal batch (shown in the daily recap, later on the Score tab).
alter table public.otto_signal_batches add column if not exists timing jsonb;

-- Every card's ping is recorded; the minute timer pings any Signal / alert / Watcher card still unpinged after 3 min.
alter table public.otto_actions add column if not exists pinged_at timestamptz;
-- Cards that already exist are treated as pinged, so the first sweep doesn't re-ping old ones.
update public.otto_actions set pinged_at = created_at where pinged_at is null;

-- Check-ins Jarvis schedules ("I'll check back at 1:30") — run by ?fn=cron_watch when due.
create table if not exists public.otto_checks (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  day         date not null,
  due_at      timestamptz not null,
  what        text not null,
  by          text,
  status      text not null default 'pending' check (status in ('pending','running','done','missed','error','cancelled')),
  result      text
);
create index if not exists otto_checks_due on public.otto_checks (status, due_at);
alter table public.otto_checks enable row level security;
revoke all on public.otto_checks from anon, authenticated;
