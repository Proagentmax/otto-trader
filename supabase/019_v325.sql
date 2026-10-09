-- Otto Trader v3.25 (8 Oct 2026) — Night Charts.
-- One row per stock per trading day: Otto's boxes, Josh's keep/adjust/remove, the per-chart chat.
create table if not exists public.otto_charts (
  id          bigserial primary key,
  day         date not null,
  ticker      text not null,
  status      text not null default 'charting' check (status in ('charting','ready','error')),
  extra       boolean not null default false,        -- a ticker typed in by hand: on the list for that day only
  mode        text,                                   -- night | morning | manual
  charted_by  text,
  last        numeric,
  daily       jsonb,                                  -- last 60 daily bars [t,o,h,l,c]
  weekly      jsonb,                                  -- last 60 weekly bars
  candidates  jsonb,                                  -- zones the server found
  boxes       jsonb not null default '[]'::jsonb,     -- the picked boxes + review state
  read        text,
  chat        jsonb not null default '[]'::jsonb,
  error       text,
  charted_at  timestamptz,
  used_at     timestamptz,                            -- "Use kept boxes today" pressed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (day, ticker)
);
alter table public.otto_charts enable row level security;
revoke all on public.otto_charts from anon, authenticated;

-- The charts timer: every 10 minutes; ?fn=cron_charts only works in the night window (8:30–10 PM New York,
-- trading days, for the next trading day) and the 8:45 AM window. Copies the URL, key and secret header from an
-- existing Otto cron job (only fn= changes), so the secret never lives in this public repo.
do $$
declare cmd text;
begin
  select regexp_replace(command, 'fn=cron_[a-z_]+', 'fn=cron_charts')
    into cmd
    from cron.job
   where jobname like 'otto-%' and command ~ 'fn=cron_[a-z_]+'
   order by jobid limit 1;
  if cmd is null then
    raise exception 'otto-charts: no existing otto-* cron job with fn=cron_... to copy the URL and secret from';
  end if;
  if exists (select 1 from cron.job where jobname = 'otto-charts') then
    perform cron.unschedule('otto-charts');
  end if;
  perform cron.schedule('otto-charts', '*/10 * * * *', cmd);
end $$;
