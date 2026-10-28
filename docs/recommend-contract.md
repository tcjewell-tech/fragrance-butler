# The `recommend` contract (Phase 3)

The app's Ask tab and tray call the `recommend` Edge Function through `supabase.functions.invoke`, and record the user's choice with the `record_recommendation_selection` database function through `supabase.rpc`. The Ask tab stays behind `EXPO_PUBLIC_FEATURE_ASK` (off by default; see `src/config/features.ts`) until the evals pass (`npm run evals`, see `evals/recommend/`). The client side lives in `src/data/supabase.ts` (`recommendations`), and the shapes are validated in `src/domain/recommendation.ts`.

- Function: `supabase/functions/recommend/index.ts`, with its logic in `supabase/functions/_shared/recommend-core.ts`. It calls Claude Sonnet 5.5 with structured output that can name only the candidates it was given.
- Table and selection: `supabase/migrations/0002_recommendations.sql`.

## `recommend`

Request body:

```json
{ "occasion": "Office Christmas party", "timeOfDay": "evening", "excludeItemIds": ["<collection item id>"] }
```

- `occasion`: the user's own words, with whitespace tidied, 1–200 characters.
- `timeOfDay`: one of `morning`, `afternoon`, `evening` or `night`, from the device clock.
- `excludeItemIds`: collection items not to offer again ("Show me others"). It may be empty.

Response (200):

```json
{ "requestId": "<uuid>", "picks": [{ "itemId": "<collection item id>", "rationale": "Warm enough for a festive room, restrained enough for the tuxedo." }] }
```

- `picks` holds 2 or 3 entries, in the butler's order, with no repeated `itemId`.
- Every `itemId` must be one of **the caller's own** `collection_items` (RLS), and none may be in `excludeItemIds`. The roadmap rule applies: the model chooses only from candidates the function supplies.
- `rationale` is one sentence of 1–280 characters in the butler's voice. It says *why* the bottle suits the moment and never describes the perfume.
- The function logs the request to `recommendation_requests` (spec §4) and returns its id as `requestId`.
- With fewer than two eligible bottles, it replies 422. The app checks the count itself before asking, so this is a safeguard.
- Other replies: 400 for a bad request, 401 when not signed in, 502 when Claude could not be reached or gave no usable answer, 500 otherwise. The body is `{ "error": "..." }`.

The app rejects a reply that breaks these rules (`parseRecommendation`), and drops any pick it can't find in the collection. If fewer than two picks remain, the tray shows its failure message.

## Recording the choice: `record_recommendation_selection`

A database function, called with `supabase.rpc('record_recommendation_selection', { request_id, item_id })`.

- This sets `user_selection` on that request: the wear-tracking signal (spec §4), recorded from v1. Calling it again for the same request replaces the choice.
- It also keeps `wear_count` in step: choosing a bottle counts one wear, and changing one's mind moves that wear to the new bottle.
- `item_id` must be one of that request's picks and still in the caller's collection, and the request must be the caller's own. Otherwise it raises an error and changes nothing.

## Errors

- Unreachable function (`FunctionsFetchError` or `FunctionsRelayError`): `RepositoryError('network')`.
- A failed `record_recommendation_selection` call is mapped like any other database error.
- 401 or 403: `RepositoryError('auth')`.
- Any other non-2xx status: `RepositoryError('unknown')`.
