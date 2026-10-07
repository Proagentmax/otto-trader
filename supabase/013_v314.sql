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
-- Copies the URL, key and cron-secret header from an existing Otto cron job (only fn= changes),
-- so the secret never has to live in this public repo. (6 Oct: there is no cron_alerts job in
-- pg_cron, so this copies from whichever otto-* job calls ?fn=cron_…, e.g. otto-morning-edt.)
do $$
declare cmd text;
begin
  select regexp_replace(command, 'fn=cron_[a-z_]+', 'fn=cron_watch')
    into cmd
    from cron.job
   where jobname like 'otto-%' and command ~ 'fn=cron_[a-z_]+'
   order by jobid limit 1;
  if cmd is null then
    raise exception 'otto-watch: no existing otto-* cron job with fn=cron_... to copy the URL and secret from';
  end if;
  if exists (select 1 from cron.job where jobname = 'otto-watch') then
    perform cron.unschedule('otto-watch');
  end if;
  perform cron.schedule('otto-watch', '* 13-21 * * 1-5', cmd);
end $$;
select jobname, schedule, (command like '%fn=cron_watch%') as is_watch from cron.job order by jobid;
