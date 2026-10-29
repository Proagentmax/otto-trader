-- Otto Trader v5.0 — ROOMS. One house (this project), one app, one brain;
-- every signed-in person gets a walled-off room: their own broker/chart
-- connections, their own Desk conversation, their own cards, their own
-- Anthropic key and model. Existing rows all belong to the house room
-- (ottotrader@vinecreativestudio.com) through the column DEFAULT, so nothing
-- that runs today changes: cron, Winston and the Watcher keep writing house rows.
-- Safe to re-run.

-- Who may enter, and what they brought.
create table if not exists public.otto_users (
  email          text primary key,                      -- lower-case
  name           text,
  role           text not null default 'member' check (role in ('owner','member')),
  status         text not null default 'invited' check (status in ('invited','active','off')),
  anthropic_key  text,                                  -- AES-GCM sealed with OTTO_TOKEN_KEY; never returned
  key_ok_at      timestamptz,                           -- last time the key answered
  key_last4      text,                                  -- the only part ever shown back
  model          text,                                  -- null = house default
  invited_by     text,
  invited_at     timestamptz,
  first_seen     timestamptz,
  last_seen      timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.otto_users enable row level security;
revoke all on public.otto_users from anon, authenticated;

insert into public.otto_users (email, name, role, status, first_seen)
  values ('ottotrader@vinecreativestudio.com', 'Otto (house)', 'owner', 'active', now())
  on conflict (email) do nothing;

-- Connections: one row per (room, service) instead of one per service.
alter table public.otto_conn add column if not exists owner text not null default 'ottotrader@vinecreativestudio.com';
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'otto_conn_pkey'
             and conrelid = 'public.otto_conn'::regclass
             and array_length(conkey, 1) = 1) then
    alter table public.otto_conn drop constraint otto_conn_pkey;
    alter table public.otto_conn add primary key (owner, service);
  end if;
end $$;

alter table public.otto_oauth   add column if not exists owner text not null default 'ottotrader@vinecreativestudio.com';
alter table public.otto_actions add column if not exists owner text not null default 'ottotrader@vinecreativestudio.com';
alter table public.otto_desk    add column if not exists owner text not null default 'ottotrader@vinecreativestudio.com';

create index if not exists otto_actions_owner on public.otto_actions (owner, status, created_at desc);
create index if not exists otto_desk_owner    on public.otto_desk (owner, id desc);
