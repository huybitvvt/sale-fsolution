-- Durable Facebook publishing history and cached engagement metrics.
-- Safe to run repeatedly in the Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table if exists public.post_comments
  add column if not exists post_title text;

create table if not exists public.facebook_posts (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  source text not null default 'api_publish',
  source_post_id text,
  facebook_post_id text,
  target_type text not null check (target_type in ('page', 'group')),
  target_id text not null,
  target_name text,
  facebook_page_id text,
  post_url text,
  content text not null default '',
  media_urls jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  delivery text,
  error_message text,
  reaction_count integer,
  comment_count integer,
  share_count integer,
  total_interactions integer,
  metrics_updated_at timestamptz,
  created_by_staff_id text,
  created_by_staff_name text,
  created_by_staff_username text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists facebook_posts_external_key_uidx on public.facebook_posts(external_key);
create index if not exists facebook_posts_facebook_id_idx on public.facebook_posts(facebook_post_id);
create index if not exists facebook_posts_staff_created_idx on public.facebook_posts(created_by_staff_id, created_at desc);
create index if not exists facebook_posts_status_idx on public.facebook_posts(status, created_at desc);

create or replace function public.set_facebook_posts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_facebook_posts_updated_at on public.facebook_posts;
create trigger trg_facebook_posts_updated_at
before update on public.facebook_posts
for each row execute function public.set_facebook_posts_updated_at();

alter table public.facebook_posts enable row level security;

-- Remove old permissive policy
drop policy if exists "facebook_posts_app_all" on public.facebook_posts;

-- Anon: read-only (frontend dashboard display)
create policy "facebook_posts_anon_read" on public.facebook_posts
  for select to anon using (true);

-- Authenticated: read all + insert + update own records
create policy "facebook_posts_auth_read" on public.facebook_posts
  for select to authenticated using (true);
create policy "facebook_posts_auth_insert" on public.facebook_posts
  for insert to authenticated with check (true);
create policy "facebook_posts_auth_update" on public.facebook_posts
  for update to authenticated
  using (created_by_staff_id = auth.uid()::text);

-- Service role (backend): full access (bypasses RLS by default, grant for completeness)
-- Note: service_role bypasses RLS in Supabase, these grants are belt-and-suspenders.

-- Restrict grants: anon gets SELECT only, authenticated gets SELECT/INSERT/UPDATE (no DELETE)
revoke all on public.facebook_posts from anon, authenticated;
grant select on public.facebook_posts to anon;
grant select, insert, update on public.facebook_posts to authenticated;
grant select, insert, update, delete on public.facebook_posts to service_role;
notify pgrst, 'reload schema';
