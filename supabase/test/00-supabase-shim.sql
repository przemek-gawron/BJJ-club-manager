-- ============================================================================
--  Shim odtwarzający środowisko Supabase na czystym Postgresie.
--  Tylko do testów migracji i polityk RLS lokalnie (bez Docker/Supabase CLI).
--  Nie jest częścią wdrożenia — aplikacja łączy się z prawdziwym Supabase.
-- ============================================================================

create schema if not exists auth;

-- Supabase udostępnia oba rozszerzenia domyślnie; seed używa uuid_generate_v5/uuid_ns_dns.
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- Role, których używają polityki (w Supabase tworzy je platforma).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- Tabela kont: tyle kolumn, ile czytają migracje i seed.
create table if not exists auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                varchar(255),
  role               varchar(255),
  email              varchar(255),
  email_confirmed_at timestamptz,
  encrypted_password varchar(255),
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  created_at         timestamptz,
  updated_at         timestamptz,
  is_sso_user        boolean not null default false,
  is_anonymous       boolean not null default false
);

-- W Supabase auth.uid() czyta JWT z GUC request.jwt.claims — odwzorowujemy to 1:1.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
      current_setting('request.jwt.claim.sub', true)
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    current_setting('request.jwt.claim.role', true),
    'anon'
  )
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- Supabase nadaje uprawnienia domyślnie; tu robimy to jawnie dla naszych ról.
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;
alter default privileges in schema public grant all on sequences to service_role;
