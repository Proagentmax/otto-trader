-- Otto Trader v3.14 — the Watcher. Run once in the SQL Editor.
-- (The Scoreboard reuses otto_actions.plan / outcome; no new table.)

-- Levels the Watcher checks every minute on 5- and 10-minute closes. One row per level per day;
-- rows from earlier days are simply ignored (levels expire at the close).
create table if not exists public.otto_watch (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  day         date not null,                       -- New York trading day
  ticker      text not null,
  level       numeric not null,
  dir         text not null check (dir in ('up','down','both')),   -- up = calls side, down = puts side
  source      text not null check (source in ('signal','desk','scanner')),
  status      text not null default 'watching' check (status in ('watching','proposed','done','removed')),
  note        text,
  source_ref  text,                                -- otto_jason id for Signal levels
  added_by    text,
  fired       jsonb not null default '{}'::jsonb,  -- {"up": {...}, "down": {...}} once each direction has fired
  last        jsonb                                -- last price / distance, for the panel
);
create unique index if not exists otto_watch_uniq on public.otto_watch (day, ticker, level, dir);
create index if not exists otto_watch_day on public.otto_watch (day, status);
alter table public.otto_watch enable row level security;
revoke all on public.otto_watch from anon, authenticated;

-- Every minute 13:00–21:59 UTC on weekdays; the function itself only works 9:30–4:00 New York.
-- Reuses the existing cron_alerts job's call (same URL, key and cron secret), only the fn changes.
select cron.unschedule('otto-watch') where exists (select 1 from cron.job where jobname = 'otto-watch');
select cron.schedule('otto-watch', '* 13-21 * * 1-5',
  (select replace(command, 'fn=cron_alerts', 'fn=cron_watch') from cron.job where command like '%fn=cron_alerts%' limit 1));
select jobname, schedule, (command like '%fn=cron_watch%') as is_watch from cron.job order by jobid;
