-- Otto Trader v3.35 (15 Oct 2026) — practice cards that wait for Josh's Approve / Reject.
-- paper_wait  = a practice (paper) idea waiting for Josh. paper_taken = Josh approved it as a practice trade (no real order, ever).
-- `paper` stays for the safety auto-rejects (kill switch, size cap, late coach call). Same pattern as 020_v326.sql: drop the old status check, add the wider one.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.otto_actions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop execute format('alter table public.otto_actions drop constraint %I', c.conname); end loop;
end $$;
alter table public.otto_actions add constraint otto_actions_status_check
  check (status in ('pending','running','done','failed','rejected','expired','paper','paper_wait','paper_taken'));
