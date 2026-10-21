begin;
select plan(13);

-- Tests insert their own rows and never depend on the seed contents.
insert into public.fragrances (id, house, name, concentration, release_year) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'Hermès', 'Terre d’Hermès', 'EDT', 2006);
insert into public.fragrances (id, house, name, concentration, release_year) values
  ('eeeeeeee-0000-4000-8000-000000000002', 'Dior', 'Sauvage', 'EDT', 2015);
insert into public.fragrances (house, name, concentration, release_year) values
  ('Zzqx Test House', 'Sauvage Zzqx', 'EDT', 2015),
  ('Zzqx Test House', 'Sauvage Zzqx', 'EDP', 2018),
  ('Zzqx Test House', 'Plain   Spacing', 'Other', null);

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test');
insert into public.fragrances (house, name, concentration, created_by) values
  ('Zzqx Test House', 'Private Custom Zzqx', 'EDP', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is(
  (select count(*)::int from public.search_fragrances('hermes terre d''hermes') where id = 'eeeeeeee-0000-4000-8000-000000000001'),
  1, 'accent- and apostrophe-insensitive match');

select is(
  (select count(*)::int from public.search_fragrances('HERMÈS TERRE D’HERMÈS') where id = 'eeeeeeee-0000-4000-8000-000000000001'),
  1, 'uppercase accent and curly apostrophe in the query');

select is(
  (select count(*)::int from public.search_fragrances('  terre   d''hermes  ') where id = 'eeeeeeee-0000-4000-8000-000000000001'),
  1, 'whitespace runs are collapsed and trimmed');

select is(
  (select count(*)::int from public.search_fragrances('sauvge') where id = 'eeeeeeee-0000-4000-8000-000000000002'),
  1, 'typo (sauvge) returns Dior Sauvage');

select is(
  (select count(*)::int from public.search_fragrances('zzqx sauvge') where house = 'Zzqx Test House' and name = 'Sauvage Zzqx'),
  2, 'typo (sauvge) still finds both concentrations via trigram similarity');

select is(
  (select count(*)::int from public.search_fragrances('plain spacing') where name = 'Plain   Spacing'),
  1, 'stored whitespace runs are collapsed too');

select is(public.normalize_for_search(E'  Hermès\u00a0 Terre ‘d´hermes`  '), 'hermes terre ''d''hermes''',
  'normalize_for_search matches normalizeForSearch (accents, quotes, nbsp, trim)');

select is((select count(*)::int from public.search_fragrances('')), 0, 'empty query returns 0 rows');
select is((select count(*)::int from public.search_fragrances('   ')), 0, 'whitespace-only query returns 0 rows');
select is((select count(*)::int from public.search_fragrances('zzqx', 1)), 1, 'max_results caps the result count');

select is(
  (select count(*)::int from public.search_fragrances('private custom zzqx') where name = 'Private Custom Zzqx'),
  1, 'own custom fragrance is searchable');

set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is(
  (select count(*)::int from public.search_fragrances('private custom zzqx') where name = 'Private Custom Zzqx'),
  0, 'search is security invoker: another user''s custom fragrance is hidden by RLS');

-- Ranking: an exact match comes before a looser one.
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select name from public.search_fragrances('hermes terre d''hermes') limit 1),
  'Terre d’Hermès', 'best match first (the seed may hold a tied duplicate, so compare the name)');

select * from finish();
rollback;
