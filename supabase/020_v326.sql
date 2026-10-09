-- Otto Trader v3.26 (9 Oct 2026) — kill switch, size cap, every limit on/off, Activity log, Coaches Corner.

-- 1. Paper cards: auto-rejected by the size cap or made while the kill switch is on. Shown, scored, never approvable.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.otto_actions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop execute format('alter table public.otto_actions drop constraint %I', c.conname); end loop;
end $$;
alter table public.otto_actions add constraint otto_actions_status_check
  check (status in ('pending','running','done','failed','rejected','expired','paper'));

-- 2. The Activity log: every change, break, trade, lock and "outside Otto" event, with who did it.
create table if not exists public.otto_activity (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  day         date not null,
  kind        text not null check (kind in ('change','break','trade','lock','outside','card')),
  text        text not null,
  who         text,
  ref         text unique,                   -- dedupe key for events found by sweeps (null = always insert)
  data        jsonb
);
create index if not exists otto_activity_day on public.otto_activity (day desc, at desc);
alter table public.otto_activity enable row level security;
revoke all on public.otto_activity from anon, authenticated;
revoke all on sequence public.otto_activity_id_seq from anon, authenticated;

-- 3. The coach's own direction on a Watcher level (null = he gave a level, not a direction).
alter table public.otto_watch add column if not exists coach_dir text;

-- 4. Coaches Corner score per coach post (both ways for a level with no direction).
alter table public.otto_jason add column if not exists cc jsonb;
