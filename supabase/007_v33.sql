-- Otto Trader v3.3 — editable limits & goals. Run once in the SQL Editor.
create table if not exists public.otto_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.otto_settings enable row level security;
revoke all on public.otto_settings from anon, authenticated;
insert into public.otto_settings (key, value, updated_by)
values ('limits', '{"phase":1,"max_trade_loss":100,"weekly_loss":150,"max_trades_day":2,"monthly_goal_pct":5,"warn_pct":20,"big_day":500}', 'setup')
on conflict (key) do nothing;
