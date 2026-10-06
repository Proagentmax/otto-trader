-- Otto Trader v3.9 — Otto Signals (the Discord watcher). Run once in the SQL Editor.
-- The Chrome extension on Ifoma's PC sends every new message from the mentor's
-- Discord account here. Raw messages + chart images are kept permanently; what
-- they say (call / level / note) goes into otto_jason like every other post.
create table if not exists public.otto_signal_msgs (
  msg_id     text primary key,               -- Discord message id (dedupe)
  created_at timestamptz not null default now(),
  day        date not null,                  -- New York date of the post
  posted_at  timestamptz not null,
  author     text,
  text       text,
  imgs       int not null default 0,
  channel    text,
  batch_id   bigint
);
create index if not exists otto_signal_msgs_at on public.otto_signal_msgs (posted_at);

create table if not exists public.otto_signal_imgs (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  msg_id     text not null,
  mime       text,
  data       text not null                   -- base64, shrunk by the extension (max 1600px JPEG)
);
create index if not exists otto_signal_imgs_msg on public.otto_signal_imgs (msg_id);

-- One burst of messages = one batch = one Jarvis read (+ the cards it made).
create table if not exists public.otto_signal_batches (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  day        date,
  msg_ids    text[],
  rows       bigint[],                       -- otto_jason ids read from it
  status     text,                           -- reading | jarvis | done | chatter | nothing | caught_up | error
  read       text,                           -- Jarvis's read for the Otto Signals feed
  cards      text[],
  error      text
);
create index if not exists otto_signal_batches_at on public.otto_signal_batches (created_at);

alter table public.otto_signal_msgs    enable row level security;
alter table public.otto_signal_imgs    enable row level security;
alter table public.otto_signal_batches enable row level security;
revoke all on public.otto_signal_msgs, public.otto_signal_imgs, public.otto_signal_batches from anon, authenticated;

-- otto_jason.source gains 'watcher' (it's free text; noted here for the record).
