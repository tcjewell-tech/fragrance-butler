# The `recommend` contract (Phase 3)

The app's Ask tab and tray call two Supabase Edge Functions through `supabase.functions.invoke`. Neither function exists yet. Until they do, the Ask tab stays behind `EXPO_PUBLIC_FEATURE_ASK` (off by default; see `src/config/features.ts`). The client side lives in `src/data/supabase.ts` (`recommendations`), and the shapes are validated in `src/domain/recommendation.ts`.

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
- With fewer than two eligible bottles, reply with a non-2xx status. The app checks the count itself before asking, so this is a safeguard.

The app rejects a reply that breaks these rules (`parseRecommendation`), and drops any pick it can't find in the collection. If fewer than two picks remain, the tray shows its failure message.

## `record-selection`

Request body:

```json
{ "requestId": "<uuid>", "itemId": "<collection item id>" }
```

- This sets `user_selection` on that request: the wear-tracking signal (spec §4), recorded from v1. Calling it again for the same request replaces the choice.
- `itemId` must be one of that request's picks. Reply with a non-2xx status otherwise.
- Any 2xx reply counts as success. The body is ignored.

## Errors

- Unreachable function (`FunctionsFetchError` or `FunctionsRelayError`): `RepositoryError('network')`.
- 401 or 403: `RepositoryError('auth')`.
- Any other non-2xx status: `RepositoryError('unknown')`.
