begin;
select plan(24);

-- Fixtures (as the superuser running the test, which stands in for the recommend function).
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');

insert into public.fragrances (id, house, name, concentration) values
  ('11111111-1111-4111-8111-111111111111', 'Rec Test House', 'One', 'EDT'),
  ('11111111-1111-4111-8111-111111111112', 'Rec Test House', 'Two', 'EDP'),
  ('11111111-1111-4111-8111-111111111113', 'Rec Test House', 'Three', 'EDP');

insert into public.collection_items (id, user_id, fragrance_id, bottle_size_ml, concentration, capture_method, client_request_id) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 100, 'EDT', 'manual', 'c1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111112', 50, 'EDP', 'manual', 'c1000000-0000-4000-8000-000000000002'),
  ('a1000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111113', 50, 'EDP', 'manual', 'c1000000-0000-4000-8000-000000000003'),
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 100, 'EDT', 'manual', 'c1000000-0000-4000-8000-000000000004');

insert into public.recommendation_requests (id, user_id, occasion_text, time_of_day, results, model) values
  ('e1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Office Christmas party', 'evening',
   '[{"item_id": "a1000000-0000-4000-8000-000000000001", "fragrance_id": "11111111-1111-4111-8111-111111111111", "rationale": "Festive."},
     {"item_id": "a1000000-0000-4000-8000-000000000002", "fragrance_id": "11111111-1111-4111-8111-111111111112", "rationale": "Quieter."}]',
   'test-model'),
  ('e2000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Dinner', 'evening',
   '[{"item_id": "b1000000-0000-4000-8000-000000000001", "fragrance_id": "11111111-1111-4111-8111-111111111111", "rationale": "Yes."},
     {"item_id": "b1000000-0000-4000-8000-000000000001", "fragrance_id": "11111111-1111-4111-8111-111111111111", "rationale": "Also."}]',
   'test-model');

-- Table shape and privileges.
select is((select relrowsecurity from pg_class where oid = 'public.recommendation_requests'::regclass), true,
  'RLS enabled on recommendation_requests');
select is(has_table_privilege('anon', 'public.recommendation_requests', 'select'), false, 'anon cannot select requests');
select is(has_table_privilege('authenticated', 'public.recommendation_requests', 'select'), true, 'authenticated can select requests');
select is(has_table_privilege('authenticated', 'public.recommendation_requests', 'insert'), false, 'authenticated cannot insert requests');
select is(has_table_privilege('authenticated', 'public.recommendation_requests', 'update'), false, 'authenticated cannot update requests');
select is(has_table_privilege('authenticated', 'public.recommendation_requests', 'delete'), false, 'authenticated cannot delete requests');
select is(has_function_privilege('anon', 'public.record_recommendation_selection(uuid, uuid)', 'execute'), false,
  'anon cannot record a selection');
select hasnt_column('public', 'recommendation_requests', 'outfit_image_ref', 'no column for outfit photos (spec §6)');

select throws_ok($$
  insert into public.recommendation_requests (user_id, occasion_text, time_of_day, results, model)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Dinner', 'evening', '[{"item_id": "x"}]', 'm')
$$, '23514', null, 'fewer than two picks is rejected');
select throws_ok($$
  insert into public.recommendation_requests (user_id, occasion_text, time_of_day, results, model)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Dinner', 'teatime', '[{}, {}]', 'm')
$$, '23514', null, 'an unknown time of day is rejected');

-- As user A.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is((select count(*)::int from public.recommendation_requests), 1, 'A sees only their own request');

select lives_ok($$ select public.record_recommendation_selection('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001') $$,
  'A records a choice that was offered');
select is((select user_selection from public.recommendation_requests where id = 'e1000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000001'::uuid, 'the choice is stored');
select is((select wear_count from public.collection_items where id = 'a1000000-0000-4000-8000-000000000001'), 1,
  'choosing a bottle counts one wear');

select lives_ok($$ select public.record_recommendation_selection('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001') $$,
  'choosing the same bottle again is accepted');
select is((select wear_count from public.collection_items where id = 'a1000000-0000-4000-8000-000000000001'), 1,
  '...and does not count a second wear');

select lives_ok($$ select public.record_recommendation_selection('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002') $$,
  'A changes their mind');
select results_eq(
  $$ select wear_count from public.collection_items where id in ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002') order by id $$,
  $$ values (0), (1) $$,
  'the wear moves to the new choice');

select throws_ok($$ select public.record_recommendation_selection('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003') $$,
  '22023', null, 'a bottle that was not offered is rejected');
select throws_ok($$ select public.record_recommendation_selection('e2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001') $$,
  'P0002', null, 'A cannot record a choice on B''s request');
select is((select wear_count from public.collection_items where id = 'b1000000-0000-4000-8000-000000000001'), null::int,
  'B''s bottle is invisible to A (RLS)');

-- Removing the chosen bottle keeps the request but clears the choice.
select lives_ok($$ delete from public.collection_items where id = 'a1000000-0000-4000-8000-000000000002' $$, 'A removes the chosen bottle');
select is((select user_selection from public.recommendation_requests where id = 'e1000000-0000-4000-8000-000000000001'),
  null::uuid, 'the choice is cleared, the request is kept');

-- Signed out.
reset request.jwt.claim.sub;
select throws_ok($$ select public.record_recommendation_selection('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001') $$,
  '28000', null, 'signed out cannot record a choice');

select * from finish();
rollback;
