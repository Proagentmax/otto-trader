-- Otto Trader v3.36 (16 Oct 2026) — Winston DATA MODE + the coach's 15 Oct rules.
-- Ifoma, 15 Oct: "make him very relaxed so he can get into trades — not reckless — so we can see where the holes are and adjust faster."
-- Data mode: the soft gates STAMP a trade instead of blocking it (the report scores each stamp), the contract picker gets a loose
-- third tier, three open positions, the time exit has a 120-minute floor, and Winston's own daily stop is OFF (limits_override) while
-- Josh's live limits are untouched. Flip back any time: set "mode": "strict" in winston_settings.config (no deploy).
-- Safety that stays: paper only, one contract, ask/bid fills, W1 written plan, W2 max loss + size cap, cash, weekly kill switch, flat by 3:50.

-- 1. The coach's rules from the 15 Oct call (source-tagged; switchable in this table, no deploy needed).
insert into public.winston_rules (id, sort, kind, source, book_ref, title, body, why, active, params) values
 ('W20', 170, 'gate', 'coach 2026-10-15', 'call 15 Oct 0:02, 37:52', 'Let price come to you (no re-entry chasing)',
  'After a closed trade on a ticker, no new entry on the same ticker and side further along in the trade''s direction than where that trade got out. Wait for price to come back to a level.',
  'SPY 15 Oct: 767.26, 768.53, 770.22 — three buys in 40 minutes, the third at the coach''s sell point. "You lost your money because of bad entry, not bounces."', true, '{}'),
 ('W21', 171, 'gate', 'coach 2026-10-15', 'call 15 Oct 36:06', 'Don''t buy at the sell-to',
  'When a coach level post names a level for the ticker that is not in the trade''s direction, no entry within $0.50 of it: that is where he takes profit, not where he enters.',
  '"768 was your first sale, 770 your second." Winston bought SPY at 770.22.', true, '{"band": 0.5}'),
 ('W22', 172, 'exit', 'coach 2026-10-15', 'call 15 Oct 30:30-31:40', 'Coach''s exit: indecision then no new high',
  'On completed 10-minute bars after the entry: an indecision bar (body at most a quarter of its range) followed by a bar that fails to make a new high (longs) or new low (shorts) = exit now, before the time stop.',
  '"Indecision followed by a lower high — easy sell position." Both 15 Oct losses were time exits on flat trades.', true, '{}'),
 ('W23', 173, 'gate', 'coach 2026-10-15', 'call 15 Oct 13:30-15:00', 'Index agreement',
  'No short in an index name while SPY is above its VWAP with rising closes; no long while SPY is below its VWAP with falling closes.',
  'QQQ 720P at 12:21 fought a relief rally the coach had called at 11 AM.', true, '{}')
on conflict (id) do update set sort = excluded.sort, kind = excluded.kind, source = excluded.source, book_ref = excluded.book_ref,
  title = excluded.title, body = excluded.body, why = excluded.why, active = excluded.active, params = excluded.params, updated_at = now();

-- 2. Data mode on. Merged into the existing config (every other key stays as it is).
insert into public.winston_settings (key, value) values
  ('config', '{"mode": "data", "max_open": 3, "min_time_exit_min": 120, "limits_override": {"daily_on": false}}'::jsonb)
on conflict (key) do update set value = public.winston_settings.value || excluded.value, updated_at = now();

select id, active, source from public.winston_rules where id in ('W20','W21','W22','W23') order by id;
select value->>'mode' as mode, value->>'max_open' as max_open, value->'limits_override' as limits_override from public.winston_settings where key = 'config';
