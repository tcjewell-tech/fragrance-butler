-- Catalog maintenance: reference rows are protected by the collections that use them,
-- cannot be duplicated, and re-running seed.sql is additive.
-- The re-seed step runs `\i supabase/seed.sql`, so run this from the repo root (npm run test:db does).
begin;
select plan(11);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');

insert into public.fragrances (id, house, name, concentration) values
  ('11111111-1111-4111-8111-111111111111', 'Cat Test House', 'Owned Reference', 'EDT');
insert into public.collection_items (id, user_id, fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id) values
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', 100, 'EDT', 'manual', 'c0000000-0000-4000-8000-0000000000a1');

-- A reference row someone owns cannot be deleted, and their bottle survives the attempt.
select throws_ok(
  $$ delete from public.fragrances where id = '11111111-1111-4111-8111-111111111111' $$,
  '23503', null, 'deleting a referenced reference fragrance is a foreign_key_violation');
select is((select count(*)::int from public.collection_items where id = '33333333-3333-4333-8333-333333333333'),
  1, 'the collection item survives the failed delete');
select is((select count(*)::int from public.fragrances where id = '11111111-1111-4111-8111-111111111111'),
  1, 'the reference fragrance survives the failed delete');

-- An unreferenced reference row can still be removed (the supported way to retire a catalog entry).
insert into public.fragrances (id, house, name, concentration) values
  ('22222222-2222-4222-8222-222222222222', 'Cat Test House', 'Unowned Reference', 'EDT');
select lives_ok(
  $$ delete from public.fragrances where id = '22222222-2222-4222-8222-222222222222' $$,
  'an unreferenced reference fragrance can be deleted');

-- Reference rows are unique on lower(house), lower(name), concentration.
select throws_ok(
  $$ insert into public.fragrances (house, name, concentration) values ('Cat Test House', 'Owned Reference', 'EDT') $$,
  '23505', null, 'an exact duplicate reference row conflicts');
select throws_ok(
  $$ insert into public.fragrances (house, name, concentration) values ('CAT TEST HOUSE', 'owned reference', 'EDT') $$,
  '23505', null, 'a case-only duplicate reference row conflicts');
select lives_ok(
  $$ insert into public.fragrances (house, name, concentration) values ('Cat Test House', 'Owned Reference', 'EDP') $$,
  'another concentration of the same fragrance is not a duplicate');
select lives_ok(
  $$ insert into public.fragrances (house, name, concentration, created_by) values
       ('Cat Test House', 'Owned Reference', 'EDT', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
       ('Cat Test House', 'Owned Reference', 'EDT', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  'custom entries are not subject to the reference-row index');

-- Re-seeding is additive. Remove one seeded row, run the seed file, and expect the original count back;
-- run it again and expect no change.
select count(*)::int as seeded from public.fragrances where created_by is null and house <> 'Cat Test House' \gset
select cmp_ok(:seeded, '>', 0, 'the seed has been loaded');
delete from public.fragrances
 where id = (select id from public.fragrances where created_by is null and house <> 'Cat Test House' order by id limit 1);
\i supabase/seed.sql
select is((select count(*)::int from public.fragrances where created_by is null and house <> 'Cat Test House'),
  :seeded, 'seed.sql restores the removed row and duplicates nothing');
\i supabase/seed.sql
select is((select count(*)::int from public.fragrances where created_by is null and house <> 'Cat Test House'),
  :seeded, 'running seed.sql again leaves the count unchanged');

select * from finish();
rollback;
