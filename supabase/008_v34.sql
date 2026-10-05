-- Otto Trader v3.4 — enter with the exit already set. Run once in the SQL Editor.
-- otto_actions.exit holds each opening card's exit plan and the exit engine's state:
--   planned → waiting_fill → armed → closed   (or dead if the entry never filled)
alter table public.otto_actions add column if not exists exit jsonb;
create index if not exists otto_actions_exit_state on public.otto_actions ((exit->>'state'));
