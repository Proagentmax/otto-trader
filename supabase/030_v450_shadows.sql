-- Otto Trader v4.5 (26 Oct 2026) — Winston rule-cost ledger: when a rule blocks an idea that has a ticker, a side and a plan (wrong-if + target),
-- Winston books a SHADOW trade and scores it on the underlying by the same exits (target touch, 10-minute close through the wrong-if, 3:50 PM).
-- Shadows never touch his book, equity, stats or the go-live gate. They exist so every rule gets a ledger: blocked N, shadow wins/losses, est. $.
create table if not exists public.winston_shadows (
  id          bigserial primary key,
  day         date not null,
  created_at  timestamptz not null default now(),
  ticker      text not null,
  side        text not null check (side in ('call','put')),
  rule        text not null,
  why         text,
  source      text,
  spot        numeric not null,
  wrong_if    numeric not null,
  target      numeric not null,
  status      text not null default 'open' check (status in ('open','win','loss','time')),
  exit_under  numeric,
  exit_at     timestamptz,
  r           numeric,
  pnl_est     numeric,
  plan        jsonb
);
create index if not exists winston_shadows_day on public.winston_shadows (day);
alter table public.winston_shadows enable row level security;
revoke all on public.winston_shadows from anon, authenticated;
revoke all on sequence public.winston_shadows_id_seq from anon, authenticated;
