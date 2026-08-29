-- Zalo Web conversation/message history captured by the Chrome extension PoC.
-- Safe to run repeatedly in the Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Public read is required for durable copies of Zalo blob/data images.
-- Uploads still go through the authenticated backend with the service-role key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comment-images',
  'comment-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.zalo_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null unique,
  conversation_id text not null,
  conversation_url text,
  title text,
  customer_id text,
  customer_name text,
  customer_phone text,
  phones jsonb not null default '[]'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  participant_ids jsonb not null default '[]'::jsonb,
  source text not null default 'zalo_web_dom',
  message_count integer not null default 0,
  latest_message_at timestamptz,
  captured_by_staff_id text,
  captured_by_staff_name text,
  captured_by_staff_username text,
  owner_key text,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zalo_messages (
  id uuid primary key default gen_random_uuid(),
  message_key text not null unique,
  conversation_key text,
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
  owner_key text,
  captured_at timestamptz not null default now()
);

alter table public.zalo_conversations
  add column if not exists conversation_key text,
  add column if not exists customer_id text,
  add column if not exists customer_phone text,
  add column if not exists phones jsonb not null default '[]'::jsonb,
  add column if not exists owner_key text;

alter table public.zalo_messages
  add column if not exists conversation_key text,
  add column if not exists phone text,
  add column if not exists phones jsonb not null default '[]'::jsonb,
  add column if not exists display_time text,
  add column if not exists owner_key text;

update public.zalo_conversations
set owner_key = coalesce(
  nullif(owner_key, ''),
  nullif(captured_by_staff_id, ''),
  nullif(captured_by_staff_username, ''),
  nullif(captured_by_staff_name, ''),
  'anonymous'
);

update public.zalo_conversations
set conversation_key = encode(digest(owner_key || '|' || conversation_id, 'sha1'), 'hex')
where conversation_key is null or conversation_key = '';

alter table public.zalo_conversations
  alter column conversation_key set not null;

update public.zalo_messages
set owner_key = coalesce(
  nullif(owner_key, ''),
  nullif(captured_by_staff_id, ''),
  nullif(captured_by_staff_username, ''),
  nullif(captured_by_staff_name, ''),
  'anonymous'
);

update public.zalo_messages
set conversation_key = encode(digest(owner_key || '|' || conversation_id, 'sha1'), 'hex')
where conversation_key is null or conversation_key = '';

alter table public.zalo_conversations
  drop constraint if exists zalo_conversations_conversation_id_key;

drop index if exists zalo_conversations_conversation_id_uidx;

create unique index if not exists zalo_conversations_conversation_key_uidx
  on public.zalo_conversations (conversation_key);

create index if not exists zalo_conversations_conversation_id_idx
  on public.zalo_conversations (conversation_id);

create index if not exists zalo_conversations_staff_idx
  on public.zalo_conversations (captured_by_staff_id, updated_at desc);

create unique index if not exists zalo_messages_message_key_uidx
  on public.zalo_messages (message_key);

create index if not exists zalo_messages_conversation_idx
  on public.zalo_messages (conversation_id, captured_at desc);

create index if not exists zalo_messages_conversation_key_idx
  on public.zalo_messages (conversation_key, captured_at desc);

create index if not exists zalo_messages_sender_idx
  on public.zalo_messages (sender_id);

create or replace function public.set_zalo_conversations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_zalo_conversations_updated_at on public.zalo_conversations;
create trigger trg_zalo_conversations_updated_at
before update on public.zalo_conversations
for each row execute function public.set_zalo_conversations_updated_at();

alter table public.zalo_conversations enable row level security;
alter table public.zalo_messages enable row level security;

drop policy if exists "zalo_conversations_app_all" on public.zalo_conversations;
drop policy if exists "zalo_messages_app_all" on public.zalo_messages;
drop policy if exists "zalo_conversations_service_all" on public.zalo_conversations;
drop policy if exists "zalo_messages_service_all" on public.zalo_messages;

create policy "zalo_conversations_service_all" on public.zalo_conversations
  for all to service_role
  using (true)
  with check (true);

create policy "zalo_messages_service_all" on public.zalo_messages
  for all to service_role
  using (true)
  with check (true);

revoke all on public.zalo_conversations from anon, authenticated;
revoke all on public.zalo_messages from anon, authenticated;
grant select, insert, update, delete on public.zalo_conversations to service_role;
grant select, insert, update, delete on public.zalo_messages to service_role;

notify pgrst, 'reload schema';
