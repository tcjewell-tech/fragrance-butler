-- Fragrance Butler: recommendation requests (spec §4, RecommendationRequest) and the wear signal.

-- One row per "What shall I wear?". Written only by the `recommend` Edge Function (service role),
-- so users can read their own rows but never forge or edit one directly.
-- outfit_image_ref from the spec is deliberately absent: outfit photos are never stored (§6). Only
-- what was derived from one is kept (derived_formality, derived_mood), once analyze-outfit exists.
create table public.recommendation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  occasion_text text not null check (char_length(occasion_text) between 1 and 200),
  time_of_day text not null check (time_of_day in ('morning', 'afternoon', 'evening', 'night')),
  -- Bottles the user asked not to see again ("Show me others").
  excluded_item_ids uuid[] not null default '{}',
  weather_snapshot jsonb,
  derived_formality text,
  derived_mood text,
  -- The picks in the butler's order: [{"item_id", "fragrance_id", "rationale"}]. fragrance_id is
  -- kept so the history still means something after a bottle is removed from the collection.
  results jsonb not null check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) between 2 and 3),
  model text not null,
  -- The pick the user chose to wear. Set null if that bottle is later removed.
  user_selection uuid references public.collection_items on delete set null,
  selected_at timestamptz,
  created_at timestamptz not null default now()
);

create index recommendation_requests_user_id_created_at_idx
  on public.recommendation_requests (user_id, created_at desc);
create index recommendation_requests_user_selection_idx
  on public.recommendation_requests (user_selection) where user_selection is not null;

alter table public.recommendation_requests enable row level security;

revoke all on public.recommendation_requests from public, anon, authenticated;
grant select on public.recommendation_requests to authenticated;

create policy recommendation_requests_select on public.recommendation_requests
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Recording the choice
-- ---------------------------------------------------------------------------

-- Records which pick the caller chose to wear and keeps wear_count in step: choosing a bottle counts
-- one wear; changing one's mind on the same request moves that wear to the new bottle. Choosing the
-- same bottle again changes nothing.
-- security definer because users have no update privilege on recommendation_requests; every check
-- on ownership is made explicitly against auth.uid().
create function public.record_recommendation_selection(request_id uuid, item_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  previous uuid;
  offered boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select r.user_selection,
         exists (select 1 from pg_catalog.jsonb_array_elements(r.results) p where p ->> 'item_id' = item_id::text)
    into previous, offered
  from public.recommendation_requests r
  where r.id = request_id and r.user_id = uid
  for update;

  if not found then
    raise exception 'unknown recommendation request' using errcode = 'P0002';
  end if;
  if not offered then
    raise exception 'that bottle was not offered for this request' using errcode = '22023';
  end if;
  -- The bottle must still be in the caller's collection.
  if not exists (select 1 from public.collection_items c where c.id = item_id and c.user_id = uid) then
    raise exception 'that bottle is no longer in the collection' using errcode = 'P0002';
  end if;

  if previous is not distinct from item_id then
    return;
  end if;

  update public.recommendation_requests
    set user_selection = item_id, selected_at = pg_catalog.now()
    where id = request_id;

  if previous is not null then
    update public.collection_items
      set wear_count = greatest(wear_count - 1, 0)
      where id = previous and user_id = uid;
  end if;
  update public.collection_items
    set wear_count = wear_count + 1
    where id = item_id and user_id = uid;
end;
$$;

revoke execute on function public.record_recommendation_selection(uuid, uuid) from public, anon;
grant execute on function public.record_recommendation_selection(uuid, uuid) to authenticated;
