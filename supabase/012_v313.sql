-- Otto Trader v3.13 — one exit-engine run per trade at a time. Run once in the SQL Editor.
-- 6 Oct 2026: the same fill was processed twice at once (2-minute cron + Approve + Desk panel),
-- so the second run's stop order was rejected and Otto raised a false "NO stop" alarm.
alter table public.otto_actions add column if not exists exit_lock timestamptz;
