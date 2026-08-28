-- Messenger conversation/message history captured by the Chrome extension PoC.
-- Safe to run repeatedly in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.messenger_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null unique,
  conversation_url text,
  title text,
  customer_id text,
  customer_name text,
  customer_phone text,
  phones jsonb not null default '[]'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  participant_ids jsonb not null default '[]'::jsonb,
  source text not null default 'chrome_dom',
  message_count integer not null default 0,
  latest_message_at timestamptz,
  captured_by_staff_id text,
  captured_by_staff_name text,
  captured_by_staff_username text,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  message_key text not null unique,
  conversation_id text not null,
  message_id text,
  sender_id text,
  sender_name text,
  sender_type text not null default 'unknown',
  direction text not null default 'unknown',
  text text not null default '',
  phone text,
  phones jsonb not null default '[]'::jsonb,
  display_time text,
  sent_at timestamptz,
  raw_message jsonb not null default '{}'::jsonb,
  captured_by_staff_id text,
  captured_by_staff_name text,
  captured_by_staff_username text,
  captured_at timestamptz not null default now()
);

alter table public.messenger_conversations
  add column if not exists customer_id text,
  add column if not exists customer_phone text,
  add column if not exists phones jsonb not null default '[]'::jsonb;

alter table public.messenger_messages
  add column if not exists phone text,
  add column if not exists phones jsonb not null default '[]'::jsonb,
  add column if not exists display_time text;

create unique index if not exists messenger_conversations_conversation_id_uidx
  on public.messenger_conversations (conversation_id);

create unique index if not exists messenger_messages_message_key_uidx
  on public.messenger_messages (message_key);

create index if not exists messenger_messages_conversation_idx
  on public.messenger_messages (conversation_id, captured_at desc);

create index if not exists messenger_messages_sender_idx
  on public.messenger_messages (sender_id);

create or replace function public.set_messenger_conversations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_messenger_conversations_updated_at on public.messenger_conversations;
create trigger trg_messenger_conversations_updated_at
before update on public.messenger_conversations
for each row execute function public.set_messenger_conversations_updated_at();

alter table public.messenger_conversations enable row level security;
alter table public.messenger_messages enable row level security;

drop policy if exists "messenger_conversations_app_all" on public.messenger_conversations;
drop policy if exists "messenger_messages_app_all" on public.messenger_messages;
drop policy if exists "messenger_conversations_service_all" on public.messenger_conversations;
drop policy if exists "messenger_messages_service_all" on public.messenger_messages;

create policy "messenger_conversations_service_all" on public.messenger_conversations
  for all to service_role
  using (true)
  with check (true);

create policy "messenger_messages_service_all" on public.messenger_messages
  for all to service_role
  using (true)
  with check (true);

revoke all on public.messenger_conversations from anon, authenticated;
revoke all on public.messenger_messages from anon, authenticated;
grant select, insert, update, delete on public.messenger_conversations to service_role;
grant select, insert, update, delete on public.messenger_messages to service_role;

notify pgrst, 'reload schema';
