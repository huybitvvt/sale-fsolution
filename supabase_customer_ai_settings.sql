-- Bảng lưu cấu hình AI theo từng user/khách.
-- Dùng để khách nhập API key một lần trong màn Content/Kịch bản.

create extension if not exists pgcrypto;

create table if not exists public.customer_ai_settings (
    id            uuid primary key default gen_random_uuid(),
    staff_key     text not null unique,
    staff_id      text,
    username      text,
    customer_name text,
    provider      text not null default 'gemini',
    model         text not null default 'gemini-3.1-pro-preview',
    api_key       text,
    api_keys      jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create or replace function public.set_customer_ai_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_customer_ai_settings_updated_at on public.customer_ai_settings;
create trigger trg_customer_ai_settings_updated_at
before update on public.customer_ai_settings
for each row
execute function public.set_customer_ai_settings_updated_at();

create index if not exists idx_customer_ai_settings_staff_key
on public.customer_ai_settings (staff_key);

-- App hiện dùng backend riêng. Nếu backend chưa có service role key, tắt RLS
-- để publishable/anon key trong backend ghi được bảng này.
alter table public.customer_ai_settings disable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.customer_ai_settings to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'customer_ai_settings';
