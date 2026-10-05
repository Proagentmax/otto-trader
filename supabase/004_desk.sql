-- Otto Trader v3.0 — The Desk. Run once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run. Every table has row-level security ON and no policies, so
-- only the edge function (service role) can read or write them. The browser
-- never touches these tables directly.

create table if not exists public.otto_conn (
  service       text primary key check (service in ('tv','rh')),
  client_id     text not null,
  tokens        text not null,            -- AES-GCM sealed; key is the OTTO_TOKEN_KEY secret
  connected_by  text,
  connected_at  timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists public.otto_oauth (
  state       text primary key,
  service     text not null,
  client_id   text not null,
  verifier    text not null,              -- sealed PKCE verifier
  started_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.otto_actions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  text,
  title       text not null,
  summary     text,
  calls       jsonb not null,             -- the exact tool calls Approve will run
  risk        jsonb,
  review      text,                       -- Robinhood's own pre-trade review
  status      text not null default 'pending'
              check (status in ('pending','running','done','failed','rejected','expired')),
  decided_by  text,
  decided_at  timestamptz,
  result      jsonb
);
create index if not exists otto_actions_status on public.otto_actions (status, created_at desc);

create table if not exists public.otto_desk (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  role        text not null check (role in ('user','assistant','system')),
  author      text,
  content     text not null,
  action_id   uuid references public.otto_actions(id) on delete set null
);

alter table public.otto_conn    enable row level security;
alter table public.otto_oauth   enable row level security;
alter table public.otto_actions enable row level security;
alter table public.otto_desk    enable row level security;

revoke all on public.otto_conn, public.otto_oauth, public.otto_actions, public.otto_desk from anon, authenticated;
revoke all on sequence public.otto_desk_id_seq from anon, authenticated;
