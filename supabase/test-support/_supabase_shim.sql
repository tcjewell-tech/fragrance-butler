-- Local stand-in for the parts of Supabase that the migrations and tests rely on.
-- Loaded ONLY by scripts/test-db.sh into a throwaway Postgres cluster. Never apply to a real project.

-- Roles (Supabase creates these itself).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- Extension schema, as on Supabase.
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- auth schema and the minimum of auth.users the app's FKs need.
create schema auth;
create table auth.users (
  id uuid primary key,
  email text
);
grant usage on schema auth to anon, authenticated, service_role;
grant all on auth.users to service_role;

-- JWT helper, same behaviour as GoTrue/PostgREST's auth.uid().
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- Supabase grants everything on new public objects to the API roles by default;
-- reproduce that so migrations must explicitly revoke what they do not want exposed.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- pgTAP (the Supabase CLI enables it itself for `supabase test db`).
create extension if not exists pgtap;
