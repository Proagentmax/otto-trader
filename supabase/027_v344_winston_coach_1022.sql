-- Otto Trader v3.44 (22 Oct 2026) — Winston: the coach's 22 Oct call (bonds first, the first 15 minutes, don't chase a move that's done) + FOMC.
-- Ifoma, 22 Oct: "do your suggestions" = add these as data-mode STAMPS (they score, they don't block), so next week's coach review
-- can see which of his rules would have helped. In strict mode they block (when the rule is on). Switch any of them here, no deploy.
-- Thresholds are Claude's defaults (Ifoma to confirm): W24 QQQ <= -1% and TLT >= +0.2%; W25 15 min / 30 min after earnings;
-- W26 index names 1.5%, single stocks 5% from yesterday's close.

insert into public.winston_rules (id, sort, kind, source, book_ref, title, body, why, active, params) values
 ('W24', 174, 'gate', 'coach 2026-10-22', 'call 22 Oct, the morning read (bonds first)', 'Read the bond market first',
  'When the Nasdaq (QQQ) is red and Treasuries are being bought (TLT up = yields down), the tape is defensive: puts, not calls, and discount the bounces. A call on a defensive day is stamped.',
  '"If you learn that alone, you''ve learned more than most people on Wall Street." 22 Oct: QQQ about -2%, bonds bought, his read was extremely bearish.', true,
  '{"nasdaq_pct": 1, "bond_pct": 0.2}'),
 ('W25', 175, 'gate', 'coach 2026-10-22', 'call 22 Oct 53:37', 'The first 15 minutes doubles everything',
  'Options reprice in the first 15 minutes after the open: no entry before 9:45 ET. After a stock''s own earnings (reported after yesterday''s close or before today''s open), wait the full 30 minutes.',
  '"Double right or double wrong." On MU the post-earnings reprice can be about $300.', true,
  '{"open_wait_min": 15, "earnings_wait_min": 30}'),
 ('W26', 176, 'gate', 'coach 2026-10-22', 'call 22 Oct (QQQ, LRCX)', 'Don''t chase a move that''s done',
  'No put on a name already down big from yesterday''s close, no call on one already up big. Index names (SPY, QQQ): 1.5%. Single stocks: 5%.',
  'After -2% on the index, puts at support are "too dangerous". LRCX was -10.5% after earnings; Winston bought LRCX puts that day.', true,
  '{"index_pct": 1.5, "stock_pct": 5}')
on conflict (id) do update set sort = excluded.sort, kind = excluded.kind, source = excluded.source, book_ref = excluded.book_ref,
  title = excluded.title, body = excluded.body, why = excluded.why, active = excluded.active, params = excluded.params, updated_at = now();

-- FOMC next week: W14 (event blackout) ON. In data mode it STAMPS trades within 15 minutes of CPI / jobs / FOMC instead of blocking
-- them, so Winston trades through FOMC (what the coach asked to see) and the report shows how those trades did. A coach call is never blocked by W14.
update public.winston_rules set active = true, updated_at = now() where id = 'W14';

select id, active, params from public.winston_rules where id in ('W14','W24','W25','W26') order by id;
