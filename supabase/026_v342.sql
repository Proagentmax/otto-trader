-- Otto Trader v3.42 (20 Oct 2026) — Winston rule W12 (liquidity / spread) switched ON at 15% of mid.
-- Evidence: of 14 Winston trades 14–20 Oct, the only two entries with a spread over 15% (CRM 24% on 16 Oct, AMGN 77% on 20 Oct)
-- are his two biggest losses, −$509 together; the other twelve were 0–8%. The function now treats W12 as a HARD gate in every mode.
update public.winston_rules
   set active = true,
       params = coalesce(params, '{}'::jsonb) || '{"max_spread_pct": 15}'::jsonb,
       body = 'Skip if the option bid-ask spread is wider than max_spread_pct of the mid (15% from 20 Oct 2026: CRM 24% and AMGN 77% were the two biggest losses). Hard gate in every mode.',
       updated_at = now()
 where id = 'W12';
