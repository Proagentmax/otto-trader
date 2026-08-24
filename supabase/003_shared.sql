-- One shared workspace instead of one pile per device.
--
-- app_state keyed rows by user_id, which meant Ifoma's laptop and Josh's phone
-- were separate anonymous users with separate data. For a two-person app that
-- is the wrong shape: they want to see the same homework ticks and the same
-- journal. So state moves to a single shared table with no owner column.
--
-- Any signed-in user reads and writes it. The gate is that you need a session
-- at all, which the Edge Function also requires before it will spend the Claude
-- or market-data keys.

create table if not exists public.shared_state (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);
alter table public.shared_state enable row level security;

drop policy if exists shared_state_rw on public.shared_state;
create policy shared_state_rw on public.shared_state
  for all
  using      ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop trigger if exists shared_state_touch on public.shared_state;
create trigger shared_state_touch before update on public.shared_state
for each row execute function public.touch_updated_at();

-- Carry over anything already written per-user, newest wins, so nothing that
-- has been ticked or journalled so far is lost.
insert into public.shared_state (key, value, updated_at)
select distinct on (key) key, value, updated_at
from public.app_state
order by key, updated_at desc
on conflict (key) do nothing;

select 'shared workspace ready — ' || count(*)::text || ' rows carried over'
from public.shared_state;
