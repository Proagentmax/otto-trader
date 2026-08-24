-- The corpus itself, versioned. Moving it here does two things:
--   1. it stops publishing Jason's paid coaching material at a public URL
--   2. a new call can be published without touching GitHub
-- Stored as one jsonb payload per version rather than shredded into rows, so
-- a bad publish is one row to roll back and the app's shape can change without
-- a migration. The Edge Function chunks and searches it in memory.

create table if not exists public.brain_versions (
  version      bigserial   primary key,
  published_at timestamptz not null default now(),
  notes        text,
  payload      jsonb       not null
);
alter table public.brain_versions enable row level security;

drop policy if exists brain_read on public.brain_versions;

-- Any signed-in user may read the corpus. There is no insert/update policy:
-- publishing a call is a deliberate act done with the service role, never
-- something a session token can do.
create policy brain_read on public.brain_versions
  for select using ((select auth.uid()) is not null);

-- Conversations, so the Coach has a memory instead of amnesia between messages.
create table if not exists public.conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;

create table if not exists public.messages (
  id              bigserial   primary key,
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            text        not null check (role in ('user','assistant')),
  content         text        not null,
  cites           jsonb,
  created_at      timestamptz not null default now()
);
alter table public.messages enable row level security;
create index if not exists messages_conv_idx on public.messages(conversation_id, created_at);

drop policy if exists conversations_own on public.conversations;
drop policy if exists conversations_coach on public.conversations;
drop policy if exists messages_own on public.messages;
drop policy if exists messages_coach on public.messages;

create policy conversations_own on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy messages_own on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The coach reads, never writes. Same rule as the journal: a mentor who can
-- edit the record is no longer looking at what actually happened.
create policy conversations_coach on public.conversations
  for select using (
    exists (select 1 from public.coach_links l
            where l.student_id = conversations.user_id and l.coach_id = auth.uid())
  );
create policy messages_coach on public.messages
  for select using (
    exists (select 1 from public.coach_links l
            where l.student_id = messages.user_id and l.coach_id = auth.uid())
  );

select 'otto brain + conversations ready' as status;
