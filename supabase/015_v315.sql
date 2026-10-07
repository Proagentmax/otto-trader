-- Otto Trader v3.15 — feedback notes + the 5:15 PM daily recap timer (7 Oct 2026).
-- Runs automatically through the deploy workflow's SQL ledger.

-- Feedback from the in-app button: bug / idea / slow / wrong answer, with the screen,
-- build and the last few browser errors attached. Service-role only, like every Otto table.
create table if not exists public.otto_feedback (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  kind        text not null default 'bug' check (kind in ('bug','idea','slow','wrong')),
  note        text not null,
  author      text,
  screen      text,
  build       text,
  errors      jsonb not null default '[]'::jsonb,
  ua          text,
  status      text not null default 'new'
);
create index if not exists otto_feedback_at on public.otto_feedback (created_at desc);
alter table public.otto_feedback enable row level security;
revoke all on public.otto_feedback from anon, authenticated;

-- Daily recap: 21:15 UTC (5:15 PM EDT) and 22:15 UTC (5:15 PM EST) on weekdays; the function
-- runs only the one that lands between 5:00 and 6:00 PM New York, once per trading day.
-- Copies the URL, key and cron-secret header from an existing otto-* job (only fn= changes),
-- so the secret never lives in this public repo.
do $$
declare cmd text;
begin
  select regexp_replace(command, 'fn=cron_[a-z_]+', 'fn=cron_daily')
    into cmd
    from cron.job
   where jobname like 'otto-%' and command ~ 'fn=cron_[a-z_]+'
   order by jobid limit 1;
  if cmd is null then
    raise exception 'otto-daily: no existing otto-* cron job with fn=cron_... to copy the URL and secret from';
  end if;
  if exists (select 1 from cron.job where jobname = 'otto-daily-edt') then perform cron.unschedule('otto-daily-edt'); end if;
  if exists (select 1 from cron.job where jobname = 'otto-daily-est') then perform cron.unschedule('otto-daily-est'); end if;
  perform cron.schedule('otto-daily-edt', '15 21 * * 1-5', cmd);
  perform cron.schedule('otto-daily-est', '15 22 * * 1-5', cmd);
end $$;
select jobname, schedule, (command like '%fn=cron_daily%') as is_daily from cron.job order by jobid;
