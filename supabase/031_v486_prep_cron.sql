-- v4.8.6: Winston's manual PREP switch needs his tick to wake from 8:00 AM ET (12 UTC in daylight time) instead of 9:01.
-- Before the open a tick does nothing unless the switch is on for today (the function checks the New York clock and the switch itself), so it costs one cheap read.
-- Same pattern as 021/022: copy URL, key and secret from an existing otto-* job; only the function name, fn= and the schedule change.
do $$
declare base text; cmd text;
begin
  select command into base from cron.job where jobname like 'otto-%' and command ~ 'fn=cron_[a-z_]+' order by jobid limit 1;
  if base is null then raise exception 'winston prep cron: no existing otto-* cron job to copy the URL and secret from'; end if;
  cmd := replace(base, '/functions/v1/otto-proxy', '/functions/v1/winston');
  cmd := regexp_replace(cmd, 'fn=cron_[a-z_]+', 'fn=tick');
  if position('/functions/v1/winston' in cmd) = 0 or position('fn=tick' in cmd) = 0 then
    raise exception 'winston prep cron: could not rewrite the otto-proxy job command';
  end if;
  if exists (select 1 from cron.job where jobname = 'winston-tick') then perform cron.unschedule('winston-tick'); end if;
  perform cron.schedule('winston-tick', '1-59/10 12-20 * * 1-5', cmd);
end $$;
select jobname, schedule, (command like '%/functions/v1/winston%') as points_at_winston from cron.job where jobname = 'winston-tick';
