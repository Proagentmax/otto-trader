-- Otto Trader v3.41 (20 Oct 2026) — Josh + Baby J's PRACTICE BOOK: $4,000 paper, like Winston's, counted from the moment
-- this migration runs (the night v3.41 ships). Practice cards are sized against it (flag only, never blocked by the live
-- size cap) and scored on it. Insert-if-missing: re-running never resets the start date. No status change, no new table.
insert into public.otto_settings (key, value, updated_by)
values ('practice_book', jsonb_build_object('start', 4000, 'since', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'note', 'v3.41 practice book — $4,000 paper for Josh + Baby J practice trades'), 'v3.41')
on conflict (key) do nothing;
