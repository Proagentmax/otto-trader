-- Otto Trader — restore the 2-minute alerts timer (7 Oct 2026).
-- ?fn=cron_alerts reads TradingView's alert log onto the Desk, runs the exits engine
-- (exit_lock lease from 012 keeps it to one driver at a time), and the position review.
-- It was missing from pg_cron (found 6 Oct). Every 2 minutes 12:00–21:59 UTC on weekdays;
-- the function itself only works 9:00–4:30 New York.
-- Copies the URL, key and cron-secret header from an existing Otto cron job (only fn= changes),
-- so the secret never lives in this public repo.
do $$
declare cmd text;
begin
  select regexp_replace(command, 'fn=cron_[a-z_]+', 'fn=cron_alerts')
    into cmd
    from cron.job
   where jobname like 'otto-%' and command ~ 'fn=cron_[a-z_]+'
   order by jobid limit 1;
  if cmd is null then
    raise exception 'otto-alerts: no existing otto-* cron job with fn=cron_... to copy the URL and secret from';
  end if;
  if exists (select 1 from cron.job where jobname = 'otto-alerts') then
    perform cron.unschedule('otto-alerts');
  end if;
  perform cron.schedule('otto-alerts', '*/2 12-21 * * 1-5', cmd);
end $$;
select jobname, schedule, (command like '%fn=cron_alerts%') as is_alerts from cron.job order by jobid;
