begin;
select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');

insert into public.fragrances (id, house, name, concentration) values
  ('11111111-1111-4111-8111-111111111111', 'Del Test House', 'Reference', 'EDT');

-- Two users each build a small collection.
set local role authenticated;

set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into public.fragrances (id, house, name, concentration, created_by)
  values ('22222222-2222-4222-8222-222222222222', 'Del Test House', 'A Custom', 'EDP', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.collection_items (fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id) values
  ('11111111-1111-4111-8111-111111111111', 100, 'EDT', 'manual', 'c0000000-0000-4000-8000-00000000000a'),
  ('22222222-2222-4222-8222-222222222222', 50, 'EDP', 'manual', 'c0000000-0000-4000-8000-00000000000b');

set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
insert into public.collection_items (fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id) values
  ('11111111-1111-4111-8111-111111111111', 30, 'EDT', 'manual', 'c0000000-0000-4000-8000-00000000000c');

-- Anonymous and sub-less callers cannot delete anything.
set local role anon;
reset request.jwt.claim.sub;
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'anon cannot execute delete_my_account');

set local role authenticated;
select throws_ok($$ select public.delete_my_account() $$, '28000', null, 'authenticated without a sub is rejected');

reset role;
select is((select count(*)::int from auth.users), 2, 'no user was deleted by the failed calls');

-- Function hardening.
select is((select prosecdef from pg_proc where oid = 'public.delete_my_account()'::regprocedure), true, 'delete_my_account is security definer');
select is((select proconfig from pg_proc where oid = 'public.delete_my_account()'::regprocedure), array['search_path=""'], 'delete_my_account pins search_path to empty');
select is(has_function_privilege('anon', 'public.delete_my_account()', 'execute'), false, 'anon has no execute');
select is(has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'), true, 'authenticated has execute');

-- A deletes their own account.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select lives_ok($$ select public.delete_my_account() $$, 'A can delete own account');

-- Inspect as service_role (bypasses RLS).
reset role;
set local role service_role;
select is((select count(*)::int from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'A''s auth.users row is gone');
select is((select count(*)::int from public.collection_items where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'A''s collection items are gone');
select is((select count(*)::int from public.fragrances where created_by = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'A''s custom fragrances are gone');
select is((select count(*)::int from public.collection_items where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1, 'B''s items are untouched');
select is((select count(*)::int from public.fragrances where id = '11111111-1111-4111-8111-111111111111'), 1, 'reference fragrances are untouched');

select * from finish();
rollback;
