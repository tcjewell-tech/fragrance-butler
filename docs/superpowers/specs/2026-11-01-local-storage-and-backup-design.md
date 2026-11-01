# On-device storage and collection backup (design)

Date: 2026-11-01. Status: design approved in conversation; written spec awaiting review.

## Purpose

Let Fragrance Butler run with no backend, so nothing is paid for until the app has proven itself. The collection lives on the phone. Because on-device data is lost with the phone or the app, the app can export a backup file and restore from one.

Supabase stays the default build. Local mode is opt-in at build time. Nothing in the Supabase path is removed.

## Scope

In scope:

- A build-time flag, `EXPO_PUBLIC_LOCAL_MODE=1`, that swaps the data layer to on-device storage and removes the sign-in step.
- Local repositories implementing the existing `Repositories` interface, persisted in AsyncStorage.
- A bundled starter catalog generated from `supabase/seed/catalog.csv`.
- "Back up collection" and "Restore from backup" in Settings, using a JSON file.

- A backup reminder on the Collection tab once 3 or more bottles have been added since the last backup (or ever, if never backed up).

Out of scope: sync between devices, automatic or scheduled backups, encryption, an "erase all data" action, and the Ask feature in local mode.

## Assumptions

- One user per install; no multi-device sync.
- The Ask tab needs the `recommend` Edge Function and Claude, so local mode forces it off regardless of `EXPO_PUBLIC_FEATURE_ASK`.
- The new Expo packages (`expo-file-system`, `expo-sharing`, `expo-document-picker`) work with the installed SDK. Verify with `npx expo install` and `npx expo-doctor` before relying on them.

## Design

### 1. Flag

`src/config/features.ts` gains `localMode: process.env.EXPO_PUBLIC_LOCAL_MODE === '1'`, and `askTab` becomes `!localMode && EXPO_PUBLIC_FEATURE_ASK === '1'`. Off by default.

### 2. Local repositories

`createMemoryRepositories` (`src/data/memory.ts`) already implements validation, idempotent add and unknown-id handling, and the existing tests (`__tests__/data/memory.test.ts`) pin that behaviour. Local repositories reuse it rather than duplicate it:

- `createMemoryRepositories` gains an optional second argument `{ initial?: PersistedState; onChange?: (state: PersistedState) => void }`. `PersistedState` holds the custom fragrances, the collection items and the `clientRequestId` to item id map (so a retried add stays idempotent after a restart).
- `onChange` (which may return a promise) runs after every mutation that changes state (`createCustom`, `add`, `update`, `remove`, `recordSelection`), and the repository method waits for it. If it rejects, the mutation is rolled back and the method rejects with `RepositoryError('unknown')`, so a failed save never looks like a success. Mutations are applied one at a time. Existing callers pass nothing and behave as before.
- New `src/data/local.ts` exports `createLocalRepositories(storage)`. It reads one AsyncStorage key (`fragrance-butler:v1`), validates it with zod, builds the repositories seeded with the bundled catalog plus the saved custom fragrances, and writes the state back through `onChange`. Writes are serialised so two quick changes cannot land out of order.
- A missing key means an empty collection. A present but unreadable value is not overwritten: the app surfaces a `RepositoryError('unknown')` so the data is not silently lost.
- The `userId` on items is the constant local user id the memory repositories already use.
- `memory.ts` calls `crypto.randomUUID()`, which Hermes does not have (see `src/lib/uuid.ts`). It switches to `newId()` from `src/lib/uuid.ts`; this is required, not optional.

### 3. Bundled catalog

`scripts/build-seed.mjs` (`npm run seed:build`) also writes `src/data/catalogSeed.ts` from `catalog.csv`, with the same validation it already applies. Each entry gets a stable id derived from the normalised house, name and concentration (accents and case ignored, the same normalisation `build-seed.mjs` uses to detect duplicates), prefixed `catalog:`. Stable ids mean items in a backup still resolve after a reinstall. Consequence: changing the spelling of a CSV row changes its id. The release docs note this.

### 4. Sign-in and routing

In `app/_layout.tsx`, when `features.localMode` is on:

- Repositories come from `createLocalRepositories(AsyncStorage)`; `createSupabaseRepositories` and the Supabase auto-refresh effect are not used.
- The `Stack.Protected` guards treat the user as signed in, so the sign-in screen is unreachable.
- Settings hides Sign out and Delete account (no account exists) and shows the backup section.

`src/data/supabaseClient.ts` is already lazy: importing it never throws, and the client is created on first use. So the requirement is that a local build never *uses* it: the root layout splits into a local root and a Supabase root, and only the Supabase root calls `useSession`, the auto-refresh effect and `createSupabaseRepositories`. A local build runs with no Supabase variables set.

### 5. Backup file

`src/domain/backup.ts` holds pure functions with no I/O:

```json
{
  "format": "fragrance-butler-backup",
  "version": 1,
  "exportedAt": "2026-11-01T12:00:00.000Z",
  "items": [ /* CollectionItem */ ],
  "customFragrances": [ /* Fragrance with isCustom: true */ ]
}
```

- `buildBackup(entries, now)`: items plus the custom fragrances they use. Catalog fragrances are not stored; they are resolved from the bundled catalog by id.
- `parseBackup(text)`: JSON parse plus zod validation. Rejects a wrong `format`, a `version` greater than 1, malformed JSON and malformed entries, with a typed error per cause.
- `planRestore(backup, current)`: the merge, returning what to add and what to skip.

Merge rules:

1. Custom fragrances are added when their id is not present; existing ones are untouched.
2. An item is added when its id is not already in the collection. An item already present is left exactly as it is on the phone, so the phone's newer edits win.
3. An item whose fragrance is neither in the bundled catalog nor in the backup's custom fragrances is skipped and counted.
4. Nothing is ever deleted or overwritten. A bottle deleted on the phone after the backup comes back; that is the accepted trade-off of merging. Restoring the same file twice changes nothing.
5. Restored items keep their original `id`, `createdAt` and `wearCount`, and take the local `userId`.

The repositories expose a restore path (a `collection.restore(...)`-style method, or an equivalent internal helper) that applies a plan through one persisted write, since `add` generates new ids and cannot be used.

### 6. Settings UI

Two buttons under a "Backup" section, visible only in local mode, in the butler's voice (copy goes in `src/copy/butler.ts`).

- **Back up collection:** builds the backup, writes `fragrance-butler-backup.json` to the cache directory with `expo-file-system`, and opens the iOS share sheet with `expo-sharing`. An empty collection still produces a valid file.
- **Restore from backup:** opens `expo-document-picker` (JSON), reads the file, runs `parseBackup` then `planRestore`, applies it, and shows a summary such as "Added 12 bottles, 3 were already here." If bottles were skipped for a missing fragrance, the summary says how many.
- An invalid, unreadable or too-new file shows a plain message and changes nothing. A cancelled share sheet or picker is not an error.

### 7. Backup reminder

A banner at the top of the Collection tab, local mode only: "You have N bottles not yet backed up" with a "Back up" button that opens Settings and a "Not now" button that hides it until the app is next opened. It shows when the number of items created after the last backup is 3 or more (`BACKUP_REMINDER_THRESHOLD = 3`; if never backed up, every item counts). The last-backup time is stored under its own key, `fragrance-butler:last-backup`, and is written only after the share sheet opens without error (the share sheet cannot report whether the user actually saved the file). Restoring a backup does not touch it, so a freshly restored phone may show the banner once; backing up clears it.

## Testing

- `createMemoryRepositories` with `initial`/`onChange`: `onChange` fires once per mutation with the expected state; `initial` round-trips; existing memory tests still pass unchanged.
- `createLocalRepositories` with a fake in-memory storage adapter: persists across a simulated restart; idempotent add survives a restart; a corrupt stored value is not overwritten; writes stay ordered.
- `backup.ts` unit tests: build/parse round trip; rejects bad format, newer version, malformed JSON and malformed entries; merge adds missing items, leaves present items untouched, skips items with an unresolvable fragrance, brings back custom fragrances, and is idempotent when applied twice.
- Catalog seed: `seed:build` output is deterministic and ids are stable across runs.
- UI: Settings shows the backup section only in local mode and hides account actions; the share and picker calls are mocked. The reminder shows at 3 unbacked bottles, not at 2, and "Not now" hides it.
- A local-mode smoke check that the app starts with no Supabase variables set.

## Documentation

`docs/release/testflight.md` gains a short note: in local mode, sections 1 (Supabase, email sign-in, integration tests), 2 (Supabase EAS variables) and 6 (demo mailbox) do not apply, nothing is collected, and the App Privacy answers become "Data not collected". A new `docs/local-mode.md` records the backup file format and the merge rules.

## Open items for the plan

- Whether the three Expo packages install cleanly at the pinned SDK, and the exact `expo-file-system` API at that version (read the installed package's types).
