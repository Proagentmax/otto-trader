-- Otto Trader v3.45 (23 Oct 2026) — Winston rule W3 (no adding to the same ticker) is now a HARD gate in every mode (code change in winston.ts,
-- same pattern as W12 in 026). Ifoma 22 Oct: "whatever you decide" on the day-review suggestion. Evidence: every trade W3 had stamped
-- was a loss — 19 Oct TSLA 377.5C $0; 22 Oct SPY 760P −$91 and SPY 759P −$33, the two adds that turned a +$120 SPY day into +$11.
-- The rule is also the coach's (no adding, no averaging). Rollback = revert the commit (this row is text only; W3 was already active).
update public.winston_rules
   set active = true,
       body = 'No averaging down, no adding to a position, no turning a losing day trade into an overnight hold. Hard gate in every mode from 23 Oct 2026 (the 22 Oct SPY adds).',
       updated_at = now()
 where id = 'W3';
select id, active, left(body, 80) as body from public.winston_rules where id in ('W3', 'W12') order by id;
