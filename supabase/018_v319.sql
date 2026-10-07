-- Otto Trader v3.19 — Lock today's plan (7 Oct 2026). Runs automatically through the deploy workflow's SQL ledger.
-- After Jarvis grades the morning read, the trader locks ONE plan: ticker + calls/puts, entry level / how / timeframe,
-- wrong-if and target. Pinned on the Desk all day; checked against the tape and the account's trades at 4:05 PM.
alter table public.otto_prep add column if not exists plan jsonb;
