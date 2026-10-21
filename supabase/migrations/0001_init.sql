-- Fragrance Butler: schema, RLS, search and account deletion.

-- Extensions live in the `extensions` schema, as on Supabase.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- created_by is null  => reference (catalog) entry, readable by every signed-in user.
-- created_by not null => custom entry, visible only to its creator.
create table public.fragrances (
  id uuid primary key default gen_random_uuid(),
  house text not null,
  name text not null,
  concentration text not null check (concentration in ('EDT', 'EDP', 'Parfum', 'Extrait', 'Other')),
  note_pyramid jsonb not null default '{"top":[],"heart":[],"base":[]}',
  olfactory_family text,
  longevity smallint check (longevity between 1 and 5),
  projection smallint check (projection between 1 and 5),
  season_affinity text[] not null default '{}',
  time_affinity text[] not null default '{}',
  marketed_gender text check (marketed_gender in ('feminine', 'masculine', 'unisex')),
  release_year int,
  reference_images text[] not null default '{}',
  created_by uuid references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- No cascade: a fragrance someone owns cannot be deleted, so catalog maintenance can never
  -- wipe a collection. Account deletion still works: auth.users cascades to the user's items and
  -- custom fragrances (see 0003_delete_account.test.sql).
  fragrance_id uuid not null references public.fragrances(id),
  bottle_size_ml int not null check (bottle_size_ml between 1 and 1000),
  concentration text not null check (concentration in ('EDT', 'EDP', 'Parfum', 'Extrait', 'Other')),
  acquisition_date date,
  capture_method text not null check (capture_method in ('barcode', 'image', 'manual')),
  user_notes text,
  favorite_flag boolean not null default false,
  wear_count int not null default 0 check (wear_count >= 0),
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index collection_items_user_id_idx on public.collection_items (user_id);
create index collection_items_fragrance_id_idx on public.collection_items (fragrance_id);
create index fragrances_created_by_idx on public.fragrances (created_by) where created_by is not null;
-- Reference (catalog) rows are unique per house + name + concentration, ignoring case. This is what
-- makes re-running seed.sql additive (it inserts with ON CONFLICT DO NOTHING). Accent-folding
-- duplicates are caught when the seed is built (scripts/build-seed.mjs). Custom rows are exempt.
create unique index fragrances_reference_unique
  on public.fragrances (lower(house), lower(name), concentration)
  where created_by is null;

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger collection_items_set_updated_at
before update on public.collection_items
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.fragrances enable row level security;
alter table public.collection_items enable row level security;

-- Supabase's default privileges hand every API role full access to new tables;
-- take it all back, then grant only what the policies below need.
revoke all on public.fragrances from public, anon, authenticated;
revoke all on public.collection_items from public, anon, authenticated;
grant select, insert on public.fragrances to authenticated;
grant select, insert, update, delete on public.collection_items to authenticated;

-- Reference rows (created_by null) plus the caller's own custom rows.
create policy fragrances_select on public.fragrances
  for select to authenticated
  using (created_by is null or created_by = auth.uid());

-- Users may add only their own custom fragrances. There is deliberately no update or
-- delete policy (or privilege): reference rows are immutable to users.
create policy fragrances_insert on public.fragrances
  for insert to authenticated
  with check (created_by = auth.uid());

create policy collection_items_select on public.collection_items
  for select to authenticated
  using (user_id = auth.uid());

-- The exists() subquery runs under the caller's RLS, so a user cannot reference a
-- custom fragrance they cannot see (another user's).
create policy collection_items_insert on public.collection_items
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.fragrances f where f.id = fragrance_id)
  );

create policy collection_items_update on public.collection_items
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.fragrances f where f.id = fragrance_id)
  );

create policy collection_items_delete on public.collection_items
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

-- Must stay in step with normalizeForSearch in src/domain/search.ts (both are asserted against the
-- same literal, see supabase/tests/0002_search.test.sql). Steps, in order: unify apostrophes
-- (’ ‘ ` ´ ʼ; first, because NFKD would turn ´ into a space plus a combining mark), NFKD, strip
-- combining marks, fold the letters NFKD leaves alone (œ æ ø ß ł đ), unify “ ” to ",
-- lowercase, collapse whitespace, trim.
-- This deliberately does not use unaccent(): its rule table differs between Postgres versions and
-- from the app (it keeps kana voicing marks, maps © to (C), and so on).
-- Parity is exact for Latin text. Combining marks are stripped only in the blocks below (diacritics,
-- Arabic vowel marks, extended/supplement/symbol/half marks, and the kana voicing marks U+3099-309A,
-- so ガ folds to カ as in the app). The app strips every script's marks (\p{M}), so marks in other
-- scripts, such as Indic vowel signs, are kept here but removed there.
-- Immutable because every function used is. Needs a UTF8 database, as Supabase is.
create function public.normalize_for_search(s text) returns text
language sql immutable
set search_path = ''
as $$
  with
    apostrophes as (
      select pg_catalog.translate(s, '’‘`´ʼ', pg_catalog.repeat('''', 5)) as v
    ),
    decomposed as (
      select pg_catalog.regexp_replace(
        normalize(v, NFKD),
        E'[\\u0300-\\u036f\\u0610-\\u061a\\u064b-\\u065f\\u0670\\u1ab0-\\u1aff\\u1dc0-\\u1dff\\u20d0-\\u20ff\\ufe20-\\ufe2f\\u3099\\u309a]',
        '', 'g') as v
      from apostrophes
    ),
    folded as (
      select pg_catalog.translate(
        pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
          v, 'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae'), 'ß', 'ss'),
        '“”øØłŁđĐ', '""oolldd') as v
      from decomposed
    )
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(pg_catalog.lower(v), E'[[:space:]\\u00a0]+', ' ', 'g')
  )
  from folded
$$;

-- security invoker (the default, stated for clarity): RLS applies to the caller.
create function public.search_fragrances(q text, max_results int default 25)
returns setof public.fragrances
language sql stable security invoker
set search_path = ''
as $$
  with query as (select public.normalize_for_search(q) as nq)
  select f.*
  from public.fragrances f, query
  where query.nq <> ''
    and (
      pg_catalog.strpos(public.normalize_for_search(f.house || ' ' || f.name), query.nq) > 0
      or extensions.similarity(public.normalize_for_search(f.house || ' ' || f.name), query.nq) > 0.3
    )
  order by extensions.similarity(public.normalize_for_search(f.house || ' ' || f.name), query.nq) desc,
           f.house, f.name, f.concentration
  limit greatest(coalesce(max_results, 25), 0)
$$;

revoke execute on function public.normalize_for_search(text) from public, anon;
revoke execute on function public.search_fragrances(text, int) from public, anon;
grant execute on function public.normalize_for_search(text) to authenticated;
grant execute on function public.search_fragrances(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion (App Store guideline 5.1.1(v))
-- ---------------------------------------------------------------------------

-- Deletes the caller's auth.users row; ON DELETE CASCADE removes their collection_items
-- and custom fragrances.
create function public.delete_my_account() returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
