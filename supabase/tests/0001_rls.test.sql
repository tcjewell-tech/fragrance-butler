begin;
select plan(31);

-- Fixtures (as the superuser running the test).
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');

insert into public.fragrances (id, house, name, concentration) values
  ('11111111-1111-4111-8111-111111111111', 'RLS Test House', 'Reference One', 'EDT');

-- RLS is switched on for both tables.
select is((select relrowsecurity from pg_class where oid = 'public.fragrances'::regclass), true, 'RLS enabled on fragrances');
select is((select relrowsecurity from pg_class where oid = 'public.collection_items'::regclass), true, 'RLS enabled on collection_items');

-- Table privileges: anon gets nothing; authenticated only what the policies need.
select is(has_table_privilege('anon', 'public.collection_items', 'select'), false, 'anon cannot select collection_items');
select is(has_table_privilege('anon', 'public.fragrances', 'select'), false, 'anon cannot select fragrances');
select is(has_table_privilege('authenticated', 'public.fragrances', 'update'), false, 'authenticated cannot update fragrances');
select is(has_table_privilege('authenticated', 'public.fragrances', 'delete'), false, 'authenticated cannot delete fragrances');
select is(has_table_privilege('authenticated', 'public.collection_items', 'delete'), true, 'authenticated can delete collection_items');

-- User A: a custom fragrance and a collection item.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select lives_ok($$
  insert into public.fragrances (id, house, name, concentration, created_by)
  values ('22222222-2222-4222-8222-222222222222', 'RLS Test House', 'A Custom', 'EDP', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
$$, 'A can insert a custom fragrance owned by A');

select lives_ok($$
  insert into public.collection_items (id, fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id)
  values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 100, 'EDT', 'manual', 'c0000000-0000-4000-8000-000000000001')
$$, 'A can insert a collection item (user_id defaults to auth.uid())');

select is((select user_id from public.collection_items where id = '33333333-3333-4333-8333-333333333333'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'user_id defaulted to A');

select throws_ok($$
  insert into public.collection_items (fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id)
  values ('11111111-1111-4111-8111-111111111111', 50, 'EDT', 'manual', 'c0000000-0000-4000-8000-000000000001')
$$, '23505', null, 'duplicate client_request_id raises unique_violation');

select throws_ok($$
  insert into public.fragrances (house, name, concentration, created_by)
  values ('RLS Test House', 'Sneaky Reference', 'EDT', null)
$$, '42501', null, 'A cannot insert a reference row (created_by null)');

select throws_ok($$
  insert into public.fragrances (house, name, concentration, created_by)
  values ('RLS Test House', 'Impersonated', 'EDT', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
$$, '42501', null, 'A cannot insert a custom fragrance owned by B');

select is((select count(*)::int from public.fragrances where id in
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')), 2,
  'A sees the reference row and own custom row');

-- User B.
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select is((select count(*)::int from public.collection_items), 0, 'B sees none of A''s collection items');
select is((select count(*)::int from public.fragrances where id = '22222222-2222-4222-8222-222222222222'), 0, 'B cannot see A''s custom fragrance');
select is((select count(*)::int from public.fragrances where id = '11111111-1111-4111-8111-111111111111'), 1, 'B can see reference rows');

select throws_ok($$
  insert into public.collection_items (user_id, fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 50, 'EDT', 'manual', 'c0000000-0000-4000-8000-000000000002')
$$, '42501', null, 'B cannot insert an item with user_id = A');

select throws_ok($$
  insert into public.collection_items (fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id)
  values ('22222222-2222-4222-8222-222222222222', 50, 'EDP', 'manual', 'c0000000-0000-4000-8000-000000000003')
$$, '42501', null, 'B cannot reference A''s custom fragrance (not visible to B)');

select lives_ok($$
  insert into public.collection_items (id, fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id)
  values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 50, 'EDT', 'manual', 'c0000000-0000-4000-8000-000000000004')
$$, 'B can insert own item referencing a reference row');

with u as (update public.collection_items set user_notes = 'hacked' where id = '33333333-3333-4333-8333-333333333333' returning 1)
select is((select count(*)::int from u), 0, 'B update of A''s item changes 0 rows');

with d as (delete from public.collection_items where id = '33333333-3333-4333-8333-333333333333' returning 1)
select is((select count(*)::int from d), 0, 'B delete of A''s item changes 0 rows');

select throws_ok($$
  update public.collection_items set user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where id = '44444444-4444-4444-8444-444444444444'
$$, '42501', null, 'B cannot hand own item over to A');

select throws_ok($$
  update public.fragrances set name = 'Changed' where id = '11111111-1111-4111-8111-111111111111'
$$, '42501', null, 'B cannot update a reference fragrance');

select throws_ok($$
  delete from public.fragrances where id = '11111111-1111-4111-8111-111111111111'
$$, '42501', null, 'B cannot delete a reference fragrance');

select throws_ok($$
  insert into public.collection_items (fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id)
  values ('11111111-1111-4111-8111-111111111111', 0, 'EDT', 'manual', 'c0000000-0000-4000-8000-000000000005')
$$, '23514', null, 'bottle_size_ml must be between 1 and 1000');

-- Anonymous callers get nothing.
set local role anon;
reset request.jwt.claim.sub;
select throws_ok($$ select * from public.collection_items $$, '42501', null, 'anon cannot read collection_items');
select throws_ok($$ select * from public.fragrances $$, '42501', null, 'anon cannot read fragrances');

-- Back to the superuser: A's item is untouched, and updated_at moves on update.
reset role;
select is((select user_notes from public.collection_items where id = '33333333-3333-4333-8333-333333333333'), null, 'A''s item untouched by B');
select is((select count(*)::int from public.fragrances where id = '11111111-1111-4111-8111-111111111111' and name = 'Reference One'), 1, 'reference row untouched');

update public.collection_items set created_at = now() - interval '1 day', updated_at = now() - interval '1 day'
  where id = '33333333-3333-4333-8333-333333333333';
update public.collection_items set user_notes = 'touched' where id = '33333333-3333-4333-8333-333333333333';
select cmp_ok((select updated_at from public.collection_items where id = '33333333-3333-4333-8333-333333333333'),
  '>', now() - interval '1 hour', 'updated_at trigger bumps updated_at');

select * from finish();
rollback;
