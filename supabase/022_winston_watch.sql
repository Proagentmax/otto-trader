-- v3.32: Winston's one-minute watch. It does nothing unless a paper trade is open (the function checks), so most minutes are a single cheap read.
-- Same pattern as 021: copy URL, key and secret from an existing otto-* job; only the function name and fn= change.
do $$
declare base text; cmd text;
begin
  select command into base from cron.job where jobname like 'otto-%' and command ~ 'fn=cron_[a-z_]+' order by jobid limit 1;
  if base is null then raise exception 'winston watch: no existing otto-* cron job to copy the URL and secret from'; end if;
  cmd := replace(base, '/functions/v1/otto-proxy', '/functions/v1/winston');
  cmd := regexp_replace(cmd, 'fn=cron_[a-z_]+', 'fn=watch');
  if position('/functions/v1/winston' in cmd) = 0 or position('fn=watch' in cmd) = 0 then
    raise exception 'winston watch: could not rewrite the otto-proxy job command';
  end if;
  if exists (select 1 from cron.job where jobname = 'winston-watch') then perform cron.unschedule('winston-watch'); end if;
  perform cron.schedule('winston-watch', '* 13-20 * * 1-5', cmd);
end $$;
select jobname, schedule, (command like '%/functions/v1/winston%') as points_at_winston from cron.job where jobname = 'winston-watch';
