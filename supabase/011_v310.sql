-- Otto Trader v3.10 — a conversation under each Otto Signal. Run once in the SQL Editor.
create table if not exists public.otto_signal_chat (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  batch_id    bigint not null,                -- otto_signal_batches.id (the signal)
  role        text not null check (role in ('user','assistant')),
  author      text,
  content     text not null,
  cards       text[],                         -- any new card Jarvis made in this reply
  cleared     boolean not null default false, -- "Clear chats" hides, never deletes
  cleared_by  text
);
create index if not exists otto_signal_chat_batch on public.otto_signal_chat (batch_id, cleared);
alter table public.otto_signal_chat enable row level security;
revoke all on public.otto_signal_chat from anon, authenticated;
