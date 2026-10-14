-- Otto Trader v3.31 — Winston (paper-only autonomous trader), 14 Oct 2026.
-- Winston runs as his OWN Edge Function (`winston`), with his OWN tables. Nothing here touches otto_actions,
-- otto_desk, otto_watch, otto_checks or otto_conn. All tables are service-role only (no row access for anon / signed-in users);
-- the app reads Winston through the function, which checks the signed-in Otto email.
-- Safe to run twice (create if not exists / on conflict do nothing).

create table if not exists public.winston_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The rule book Winston trades by. Edit rows here (active on/off, text, params) — no deploy needed.
--   source: 'book' (confirmed in a book, page in book_ref) | 'book-partial' | 'plan-only' | 'coach'
--   kind  : 'process' | 'fill' | 'gate' | 'experiment' | 'judge'
create table if not exists public.winston_rules (
  id        text primary key,
  sort      int  not null default 0,
  kind      text not null,
  source    text not null,
  book_ref  text,
  title     text not null,
  body      text not null,
  why       text,
  active    boolean not null default true,
  params    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.winston_days (
  day           date primary key,
  start_balance numeric,
  end_balance   numeric,
  routine       jsonb,            -- 8:45 routine: calendar, news, plan, watch list
  sentiment     jsonb,            -- 9:15 read of the tape
  report        jsonb,            -- end-of-day report (taken, passed and why, money, costs)
  ai            jsonb not null default '{"calls":0,"input_tokens":0,"output_tokens":0}'::jsonb,
  kill          jsonb,            -- {locked:true, why, until} when his own daily stop / weekly limit tripped
  updated_at    timestamptz not null default now()
);

create table if not exists public.winston_ideas (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  day        date not null,
  ticker     text,
  side       text check (side in ('call','put')),
  source     text not null default 'own',   -- 'own' | 'coach:<otto_jason id>'
  status     text not null check (status in ('taken','passed','blocked')),
  reason     text,
  rule_ids   text[] not null default '{}',
  cites      jsonb not null default '[]'::jsonb,   -- what he leaned on (rule ids, brain items, news) — nothing invented
  plan       jsonb,
  trade_id   bigint,
  experiment text
);
create index if not exists winston_ideas_day on public.winston_ideas (day);

create table if not exists public.winston_trades (
  id            bigserial primary key,
  day           date not null,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  status        text not null default 'open' check (status in ('open','closed')),
  ticker        text not null,
  side          text not null check (side in ('call','put')),
  option_id     text,
  label         text,
  qty           int  not null default 1,
  source        text not null default 'own',
  idea_id       bigint,
  experiment    text,
  plan          jsonb not null,          -- wrong_if_level, target_level, time_exit_min, stop_option, planned_loss
  entry_bid     numeric, entry_ask numeric, entry_mid numeric, entry_fill numeric,
  entry_under   numeric,
  exit_bid      numeric, exit_ask numeric, exit_mid numeric, exit_fill numeric,
  exit_under    numeric,
  exit_reason   text,                    -- wrong_if | target | time | flat_close | kill
  pnl_realistic numeric,                 -- ask in, bid out
  pnl_mid       numeric,
  spread_cost   numeric,
  pnl_double    numeric,                -- same trade with the spread cost doubled (rule W11)
  r_multiple    numeric,
  followed_rules boolean,
  broke         text[] not null default '{}',
  flags         text[] not null default '{}'   -- e.g. 'both_hit_same_bar_stop_first' (rule W8)
);
create index if not exists winston_trades_day on public.winston_trades (day);
create index if not exists winston_trades_open on public.winston_trades (status) where status = 'open';

create table if not exists public.winston_log (
  id   bigserial primary key,
  at   timestamptz not null default now(),
  kind text not null,
  data jsonb
);
create index if not exists winston_log_at on public.winston_log (at desc);

alter table public.winston_settings enable row level security;
alter table public.winston_rules    enable row level security;
alter table public.winston_days     enable row level security;
alter table public.winston_ideas    enable row level security;
alter table public.winston_trades   enable row level security;
alter table public.winston_log      enable row level security;
revoke all on public.winston_settings, public.winston_rules, public.winston_days,
              public.winston_ideas, public.winston_trades, public.winston_log from anon, authenticated;
revoke all on sequence public.winston_ideas_id_seq, public.winston_trades_id_seq, public.winston_log_id_seq from anon, authenticated;

-- Settings: paper account, entry windows, and the on/off switch. Limits (percentages) are READ from otto_settings.limits by the function,
-- numbers only, and applied to HIS $4,000 — never to the live account.
insert into public.winston_settings (key, value) values
  ('config', '{"enabled": true, "paper_balance": 4000, "own_idea_from_min": 600, "coach_idea_from_min": 571,
               "last_entry_min": 930, "default_time_exit_min": 180, "flat_min": 950, "max_open": 1,
               "universe": ["SPY","QQQ","NVDA","TSLA","AAPL","MSFT","META","AMZN","GOOGL","AMD","PLTR","MU"]}'::jsonb)
on conflict (key) do nothing;

-- Rules. A and B active; C loaded OFF (turn on after Week 1 data); E1/E2 experiments OFF until the 5-minute history check.
insert into public.winston_rules (id, sort, kind, source, book_ref, title, body, why, active, params) values
 ('W1', 10, 'process', 'book-partial', 'Z p91-93; T p296-298', 'Plan before the click',
  'No entry without a written entry, stop (wrong-if), target, time exit and size before he enters. Missing any = pass and log why.',
  'Books support predefining risk and a written plan; the exact five-item list is Otto''s wording.', true, '{}'),
 ('W2', 20, 'process', 'book', 'S p117; Z p91-93; D p44,50', 'Risk set first, never widen a stop',
  'Risk is set before entry. A stop only moves in the direction of the trade, never wider. If the size does not fit the cap, skip; do not tighten the stop to make it fit.',
  'Elder p117 states the one-way stop rule. Skip-instead-of-tighten is Otto''s own addition.', true, '{}'),
 ('W3', 30, 'process', 'book', 'D p112-113,197,212; T p219,297', 'No averaging down, no adding, no day trade turned into a hold',
  'No averaging down, no adding to a position, no turning a losing day trade into an overnight hold.',
  'Aziz is explicit and repeats it.', true, '{}'),
 ('W4', 40, 'process', 'plan-only', 'books use partials: T p322-323, Z p166', 'Exits fixed before entry',
  'One stop, one target, one time exit, fixed before entry. Partial exits only as a separately labeled version.',
  'A Winston simplification; the books take partials and move the stop to breakeven.', true, '{}'),
 ('W5', 50, 'process', 'book-partial', 'D p200; S p36; L p43; T p298', 'Tag every trade',
  'Every trade is tagged followed-the-rules or broke-a-rule. A profitable rule-break counts as a failed process in the stats.',
  'Books support journaling; the profitable-break-fails idea is Otto''s.', true, '{}'),
 ('W6', 60, 'process', 'plan-only', null, 'Hypotheses, with sources',
  'Coach posts and book rules are hypotheses. Winston logs why he took or passed each one, citing the source. Nothing invented.',
  null, true, '{}'),
 ('W7', 70, 'process', 'plan-only', null, 'Shadow list',
  'Passed or blocked ideas go in the idea log as passed/blocked and are never counted as trades.', null, true, '{}'),
 ('W8', 80, 'fill', 'plan-only', null, 'Stop first on a same-bar tie',
  'If the stop and the target could both have hit inside the same 10-minute bar, assume the stop hit first and flag it.', null, true, '{}'),
 ('W9', 90, 'fill', 'plan-only', null, 'Gaps fill at the next bid',
  'A gap through a stop fills at the next available bid, not at the stop price.', null, true, '{}'),
 ('W10', 100, 'fill', 'book', 'D p81', 'Buy at the ask, sell at the bid',
  'Entries use the ask at decision time, exits the bid. A touched limit does not guarantee a fill.', null, true, '{}'),
 ('W11', 110, 'fill', 'plan-only', null, 'Double the spread',
  'Every report also shows the results with the spread cost doubled.', null, true, '{}'),
 ('W12', 120, 'gate', 'book-partial', 'T p46', 'Liquidity (spread)',
  'Skip if the option bid-ask spread is too wide. Threshold NOT decided; needs real option-spread data (set params.max_spread_pct when known).',
  'Plan''s stock numbers do not transfer to options.', false, '{"max_spread_pct": null}'),
 ('W13', 130, 'gate', 'plan-only', null, 'Fresh quote',
  'Quote must be fresh. Stale or missing quote = pass.', null, false, '{"max_age_sec": 15}'),
 ('W14', 140, 'gate', 'book-partial', 'T p298 (general)', 'Event blackout',
  'No new entry within the window around CPI, jobs report or FOMC; skip if earnings fall inside the hold. A coach call can override (coach wins).',
  'The 15-minute window is the plan''s number, not the books''.', false, '{"window_min": 15}'),
 ('W15', 150, 'gate', 'plan-only', 'T p296 allows 3 attempts per ticker', 'One idea per ticker per day',
  'One idea per ticker per day (matches Otto''s one-card-per-ticker rule).', null, false, '{}'),
 ('W16', 160, 'gate', 'book-partial', 'L p120,228', 'One job per indicator',
  'Each indicator has one job: a trend filter or an entry trigger, never a vote of many.', null, false, '{}'),
 ('E1', 200, 'experiment', 'plan-only', 'D p159-160 (ORB is entry-only, VWAP stop)', 'Experiment: 15-minute opening-range breakout',
  'First 5-minute close after 9:45 above the 15-minute range high plus a small buffer, above VWAP, volume at least 1.5x the opening bars, SPY above its own VWAP; stop below the range low; target 2x the risk; exit by 60 minutes or 11:30.',
  'Tagged experiment, kept out of the main score. OFF until the 5-minute history check is done.', false, '{}'),
 ('E2', 210, 'experiment', 'plan-only', 'T p127 differs (2-min 20 EMA)', 'Experiment: VWAP pullback',
  'Between 10:15 and 11:00 in a rising trend, a bar dips to VWAP and closes back above it on equal or higher volume; stop below the dip; target 2x risk.',
  'Tagged experiment, kept out of the main score. OFF until the 5-minute history check is done.', false, '{}'),
 ('W17', 300, 'judge', 'book-partial', 'D p37; T p25,296', 'How he is judged',
  'Report expectancy (average result per trade in R, where R is the planned loss), profit factor, worst day, longest losing streak and fill cost. Judge by trading day, not by single trade.', null, true, '{}'),
 ('W19', 310, 'judge', 'plan-only', null, 'Paper only',
  'Winston stays paper. Any move toward live is a separate decision with its own approval.', null, true, '{}')
on conflict (id) do nothing;

-- Schedules. Each job copies the URL, key and cron-secret header from an existing otto-* job (the secret never lives in this public repo);
-- only the function name and fn= change. UTC schedules cover both daylight and standard time; the function checks the New York clock itself.
do $$
declare base text; cmd text; j record;
begin
  select command into base from cron.job where jobname like 'otto-%' and command ~ 'fn=cron_[a-z_]+' order by jobid limit 1;
  if base is null then raise exception 'winston cron: no existing otto-* cron job to copy the URL and secret from'; end if;
  for j in select * from (values
    ('winston-routine',   '45 12,13 * * 1-5',      'routine'),
    ('winston-sentiment', '15 13,14 * * 1-5',      'sentiment'),
    ('winston-tick',      '1-59/10 13-20 * * 1-5', 'tick'),
    ('winston-flatten',   '50 19,20 * * 1-5',      'flatten'),
    ('winston-report',    '15 20,21 * * 1-5',      'report')
  ) as t(name, sched, fn) loop
    cmd := replace(base, '/functions/v1/otto-proxy', '/functions/v1/winston');
    cmd := regexp_replace(cmd, 'fn=cron_[a-z_]+', 'fn=' || j.fn);
    if position('/functions/v1/winston' in cmd) = 0 or position('fn=' || j.fn in cmd) = 0 then
      raise exception 'winston cron: could not rewrite the otto-proxy job command (%)', j.name;
    end if;
    if exists (select 1 from cron.job where jobname = j.name) then perform cron.unschedule(j.name); end if;
    perform cron.schedule(j.name, j.sched, cmd);
  end loop;
end $$;
select jobname, schedule, (command like '%/functions/v1/winston%') as points_at_winston from cron.job where jobname like 'winston-%' order by jobname;
