# Fragrance Butler Phase 1 (Collection Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An iOS app where a signed-in user can search a reference catalog or create a custom entry, confirm concentration and bottle size, save the bottle to a cloud-synced collection, and browse and view that collection.

**Architecture:** An Expo (React Native, TypeScript) app with expo-router screens. Screens talk to `CatalogRepository` and `CollectionRepository` interfaces, supplied through React context. There are two implementations of each: an in-memory one used by tests and a Supabase one used by the app. Supabase Postgres holds `fragrances` and `collection_items`, with row-level security (RLS). Search runs in a Postgres function so that accents and punctuation are ignored.

**Tech Stack:** Expo SDK (latest stable at scaffold time, pinned in `package.json`), TypeScript strict, expo-router, `@supabase/supabase-js`, zod, Jest (`jest-expo`), `@testing-library/react-native`, Supabase CLI + pgTAP, EAS Build.

**Spec:** `docs/spec/Fragrance_Butler_Spec_v1.1.0.pdf` (§3.1 Path C + shared confirmation step, §4, §5 Storage, §6, §8 Phase 1). Context: `docs/superpowers/plans/2026-10-21-fragrance-butler-roadmap.md`.

## Global Constraints

- Concentrations: exactly `EDT`, `EDP`, `Parfum`, `Extrait`, `Other` (§3.2).
- Preset bottle sizes: `30, 50, 100, 150, 200` ml (§3.1). A custom whole-number size from 1–1000 ml is also allowed (assumption: the spec says "e.g.").
- `capture_method` ∈ `barcode | image | manual`. Phase 1 writes only `manual` (§4).
- `CollectionItem` fields follow spec §4: `item_id, user_id, fragrance_id, bottle_size_ml, concentration, acquisition_date, capture_method, user_notes, favorite_flag, wear_count`.
- `Fragrance` fields follow spec §4: `house, name, concentration, note_pyramid (top/heart/base), olfactory_family, longevity, projection, season_affinity, time_affinity, marketed_gender, release_year, reference_images`.
- Copy voice: "deferential, concise, and confident. The butler advises; the user decides." It never lectures (§2.1). All user-facing text lives in `src/copy/butler.ts`.
- iOS first. No Android-specific work in Phase 1 (§5).
- Non-goals: no purchasing or prices, no social features, no ratings, no remaining-volume tracking (§2.3).
- No third-party API keys in the app bundle. The only public key the app holds is the Supabase anon key.
- The collection must survive losing the device: Supabase is the source of truth (§5 Storage).

## Review Focus

1. **Another user's collection or custom fragrances must never be visible.** → RLS pgTAP tests in Task 3.
2. **Double-tapping Save must not create two bottles.** → `client_request_id` makes saving idempotent, plus a test that the Save button is disabled while saving (Tasks 3, 5, 7).
3. **Searches that differ only in accents or punctuation must still match**: "hermes terre d'hermes" finds "Hermès Terre d’Hermès" (curly apostrophe). → pgTAP search test (Task 3) + `normalizeForSearch` unit test (Task 2).
4. **If saving fails because the network drops, the user sees a calm error and their choices are kept.** → confirm-screen failure test (Task 7).
5. **A custom entry with a blank house or name, or extra spaces, is rejected or cleaned up**, not saved as a junk row. → validation tests (Task 2), custom-screen test (Task 7).

---

## File Structure

```
app/                              expo-router screens
  _layout.tsx                     providers (repositories, session), auth gate
  sign-in.tsx                     email OTP sign-in
  (tabs)/_layout.tsx              tabs: Collection, Add
  (tabs)/index.tsx                collection list
  (tabs)/add.tsx                  catalog search (Path C)
  add/confirm.tsx                 shared confirmation step
  add/custom.tsx                  custom entry form
  item/[id].tsx                   bottle detail
src/domain/types.ts               Fragrance, CollectionItem, enums, constants
src/domain/validation.ts          zod schemas + parse helpers
src/domain/search.ts              normalizeForSearch, groupVariants
src/domain/collectionView.ts      sortCollection
src/data/repositories.ts          CatalogRepository, CollectionRepository interfaces
src/data/memory.ts                in-memory implementations (tests + dev)
src/data/supabase.ts              Supabase implementations + row mappers
src/data/RepositoryContext.tsx    provider + useRepositories()
src/copy/butler.ts                all user-facing copy
src/ui/theme.ts                   colour/type/spacing tokens
src/ui/components/*.tsx           Button, Chip, FragranceRow, EmptyState, ErrorBanner
supabase/migrations/0001_init.sql
supabase/seed.sql
supabase/tests/0001_rls.test.sql
supabase/tests/0002_search.test.sql
__tests__/…                       mirrors src/ and app/
```

---

### Task 1: Project scaffold and toolchain

**Files:**
- Create: an Expo TypeScript project at the repo root (`npx create-expo-app@latest . --template default`). Then remove the example screens.
- Create: `jest.config.js` (preset `jest-expo`), `__tests__/smoke.test.ts`, `.env.example` (`EXPO_PUBLIC_SUPABASE_URL=`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=`), `.gitignore` additions (`.env`), `README.md` setup section.
- Modify: `tsconfig.json` → `"strict": true`, path alias `@/*` → `src/*`.

**Interfaces:**
- Produces: `npm test`, `npm run typecheck` (`tsc --noEmit`) and `npm run lint` (`expo lint`) scripts, which every later task uses.

- [ ] **Step 1:** Scaffold. Install `@supabase/supabase-js zod @testing-library/react-native jest-expo @react-native-async-storage/async-storage react-native-url-polyfill`.
- [ ] **Step 2:** Write `__tests__/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run `npm test`. Expected: 1 passed.
- [ ] **Step 3:** Run `npm run typecheck && npm run lint`. Expected: no errors.
- [ ] **Step 4:** Commit `chore: scaffold Expo TypeScript app with Jest`.

---

### Task 2: Domain types, validation, search helpers

**Files:**
- Create: `src/domain/types.ts`, `src/domain/validation.ts`, `src/domain/search.ts`, `src/domain/collectionView.ts`
- Test: `__tests__/domain/validation.test.ts`, `__tests__/domain/search.test.ts`, `__tests__/domain/collectionView.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export const CONCENTRATIONS = ['EDT', 'EDP', 'Parfum', 'Extrait', 'Other'] as const;
  export type Concentration = (typeof CONCENTRATIONS)[number];
  export const PRESET_BOTTLE_SIZES_ML = [30, 50, 100, 150, 200] as const;
  export type CaptureMethod = 'barcode' | 'image' | 'manual';
  export type MarketedGender = 'feminine' | 'masculine' | 'unisex';
  export interface NotePyramid { top: string[]; heart: string[]; base: string[] }
  export interface Fragrance {
    id: string; house: string; name: string; concentration: Concentration;
    notePyramid: NotePyramid; olfactoryFamily: string | null;
    longevity: number | null; projection: number | null;          // 1–5
    seasonAffinity: string[]; timeAffinity: string[];
    marketedGender: MarketedGender | null; releaseYear: number | null;
    referenceImages: string[]; isCustom: boolean;
  }
  export interface FragranceGroup { house: string; name: string; variants: Fragrance[] }
  export interface CollectionItem {
    id: string; userId: string; fragranceId: string; bottleSizeMl: number;
    concentration: Concentration; acquisitionDate: string | null; // ISO date
    captureMethod: CaptureMethod; userNotes: string | null;
    favorite: boolean; wearCount: number; createdAt: string;
  }
  export interface CollectionEntry { item: CollectionItem; fragrance: Fragrance }
  export interface NewCollectionItem {
    clientRequestId: string; fragranceId: string; bottleSizeMl: number;
    concentration: Concentration; captureMethod: CaptureMethod;
    acquisitionDate?: string | null; userNotes?: string | null;
  }
  export type CollectionItemPatch = Partial<Pick<CollectionItem,
    'bottleSizeMl' | 'acquisitionDate' | 'userNotes' | 'favorite'>>;
  export interface CustomFragranceInput { house: string; name: string; concentration: Concentration; releaseYear?: number | null }
  ```
- Produces (`validation.ts`): `parseNewCollectionItem(x: unknown): NewCollectionItem` and `parseCustomFragrance(x: unknown): CustomFragranceInput`. Both throw `ValidationError { field: string; message: string }`.
- Produces (`search.ts`): `normalizeForSearch(s: string): string`, `groupVariants(fs: Fragrance[]): FragranceGroup[]`.
- Produces (`collectionView.ts`): `type SortMode = 'house' | 'recent' | 'favorites'`, `sortCollection(entries: CollectionEntry[], mode: SortMode): CollectionEntry[]`.

- [ ] **Step 1: Write failing tests**

```ts
// validation.test.ts
test('accepts preset and custom sizes', () => {
  expect(parseNewCollectionItem(valid({ bottleSizeMl: 100 })).bottleSizeMl).toBe(100);
  expect(parseNewCollectionItem(valid({ bottleSizeMl: 75 })).bottleSizeMl).toBe(75);
});
test.each([0, -5, 12.5, 1001])('rejects size %p', (s) =>
  expect(() => parseNewCollectionItem(valid({ bottleSizeMl: s }))).toThrow(ValidationError));
test('rejects unknown concentration', () =>
  expect(() => parseNewCollectionItem(valid({ concentration: 'Cologne' }))).toThrow(ValidationError));
test('trims custom house/name and rejects blank', () => {
  expect(parseCustomFragrance({ house: '  Le Labo ', name: ' Santal 33 ', concentration: 'EDP' }))
    .toEqual({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP', releaseYear: null });
  expect(() => parseCustomFragrance({ house: '   ', name: 'X', concentration: 'EDP' })).toThrow(ValidationError);
});
test('rejects custom names over 120 chars', () =>
  expect(() => parseCustomFragrance({ house: 'A', name: 'x'.repeat(121), concentration: 'EDT' })).toThrow());

// search.test.ts
test('normalizes accents, curly apostrophes, case, whitespace', () =>
  expect(normalizeForSearch('  Hermès  Terre d’Hermès ')).toBe("hermes terre d'hermes"));
test('groups concentration variants of the same house+name', () => {
  const g = groupVariants([f('Dior', 'Sauvage', 'EDT'), f('Dior', 'Sauvage', 'EDP'), f('Chanel', 'Bleu', 'EDP')]);
  expect(g).toHaveLength(2);
  expect(g.find(x => x.name === 'Sauvage')!.variants.map(v => v.concentration)).toEqual(['EDT', 'EDP']);
});

// collectionView.test.ts
test('house sort is alphabetical by house then name, accent-insensitive', …);
test('recent sort is newest createdAt first', …);
test('favorites sort puts favorites first, then house order', …);
```

- [ ] **Step 2:** Run `npm test -- __tests__/domain`. Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement the four modules. `normalizeForSearch`: NFD → strip combining marks (`\p{M}`) → replace `[’‘`´]` with `'` → lowercase → collapse whitespace → trim. `groupVariants` keeps the first-seen order, with the key `normalizeForSearch(house)+'|'+normalizeForSearch(name)`, and orders variants by their position in `CONCENTRATIONS`.
- [ ] **Step 4:** Run `npm test -- __tests__/domain`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(domain): fragrance types, validation, search normalization`.

---

### Task 3: Supabase schema, RLS, search function, seed catalog

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/0001_init.sql`, `supabase/seed.sql`, `supabase/tests/0001_rls.test.sql`, `supabase/tests/0002_search.test.sql`

**Interfaces:**
- Produces tables:
  - `fragrances(id uuid pk default gen_random_uuid(), house text not null, name text not null, concentration text not null check (concentration in ('EDT','EDP','Parfum','Extrait','Other')), note_pyramid jsonb not null default '{"top":[],"heart":[],"base":[]}', olfactory_family text, longevity smallint check (longevity between 1 and 5), projection smallint check (projection between 1 and 5), season_affinity text[] not null default '{}', time_affinity text[] not null default '{}', marketed_gender text check (marketed_gender in ('feminine','masculine','unisex')), release_year int, reference_images text[] not null default '{}', created_by uuid references auth.users on delete cascade, created_at timestamptz not null default now())`. `created_by is null` ⇒ reference entry; otherwise a custom entry.
  - `collection_items(id uuid pk default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, fragrance_id uuid not null references fragrances, bottle_size_ml int not null check (bottle_size_ml between 1 and 1000), concentration text not null (same check), acquisition_date date, capture_method text not null check (capture_method in ('barcode','image','manual')), user_notes text, favorite_flag boolean not null default false, wear_count int not null default 0 check (wear_count >= 0), client_request_id uuid not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`.
- Produces RPC: `search_fragrances(q text, max_results int default 25) returns setof fragrances`. It is `security invoker`, so RLS applies. It matches `unaccent(lower(replace(house||' '||name, '’', '''')))` against the query normalized the same way, using `ilike '%'||q||'%'` OR `pg_trgm` similarity > 0.3, and orders by similarity descending.
- Produces RLS policies:
  - `fragrances`: users can read rows where `created_by is null or created_by = auth.uid()`. Users can insert only rows where `created_by = auth.uid()`. Users cannot update or delete reference rows.
  - `collection_items`: all operations are limited to rows where `user_id = auth.uid()`.
- Produces seed data: about 40 well-known reference rows (house, name, concentration, release_year only, with at least 3 fragrances that come in several concentrations). No notes or descriptions copied from third-party databases (spec §7 #1).

- [ ] **Step 1: Write failing pgTAP tests**
  - `0001_rls.test.sql`: create users A and B → A inserts a collection item and a custom fragrance → as B: `is((select count(*) from collection_items), 0)`, B cannot see A's custom fragrance, B can see reference rows, an insert by B with `user_id = A` fails, and an update by B of a reference fragrance changes 0 rows.
  - Same file: inserting the same `client_request_id` twice raises `unique_violation`.
  - `0002_search.test.sql`: seeding `Hermès / Terre d’Hermès / EDT`, then `search_fragrances('hermes terre d''hermes')` returns it. `search_fragrances('sauvge')` (typo) returns `Dior Sauvage`. An empty `q` returns 0 rows.
- [ ] **Step 2:** Run `supabase start && supabase test db`. Expected: FAIL (relations missing).
- [ ] **Step 3:** Write `0001_init.sql` (extensions `unaccent`, `pg_trgm`, the tables above, an `updated_at` trigger, RLS, the RPC) and `seed.sql`.
- [ ] **Step 4:** Run `supabase db reset && supabase test db`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(db): fragrances + collection_items schema with RLS and accent-insensitive search`.

---

### Task 4: Repository interfaces and in-memory implementation

**Files:**
- Create: `src/data/repositories.ts`, `src/data/memory.ts`, `src/data/RepositoryContext.tsx`
- Test: `__tests__/data/repositoryContract.ts` (a shared test suite), `__tests__/data/memory.test.ts`

**Interfaces:**
- Consumes: Task 2 types, `normalizeForSearch`, `groupVariants`.
- Produces:
  ```ts
  export interface CatalogRepository {
    search(query: string): Promise<FragranceGroup[]>;          // [] for blank query
    getById(id: string): Promise<Fragrance | null>;
    createCustom(input: CustomFragranceInput): Promise<Fragrance>; // isCustom: true
  }
  export interface CollectionRepository {
    list(): Promise<CollectionEntry[]>;
    get(itemId: string): Promise<CollectionEntry | null>;
    add(input: NewCollectionItem): Promise<CollectionItem>;    // idempotent on clientRequestId
    update(itemId: string, patch: CollectionItemPatch): Promise<CollectionItem>;
    remove(itemId: string): Promise<void>;
  }
  export function createMemoryRepositories(seed?: Fragrance[]): { catalog: CatalogRepository; collection: CollectionRepository };
  export function RepositoryProvider(props: { value: { catalog: CatalogRepository; collection: CollectionRepository }; children: React.ReactNode }): JSX.Element;
  export function useRepositories(): { catalog: CatalogRepository; collection: CollectionRepository };
  ```

- [ ] **Step 1: Write the contract suite** `runRepositoryContract(name, factory)`. Assertions:
  - `add` then `list` returns 1 entry, with `entry.fragrance.id === fragranceId`.
  - Calling `add` twice with the same `clientRequestId` → `list()` has length 1, and both calls return the same `id`.
  - Two adds of the same fragrance with *different* request IDs (e.g. 50 ml and 100 ml) → length 2.
  - `update(id, { favorite: true })` persists. `remove` deletes. `get(unknownId)` → `null`.
  - `search('')` → `[]`. `search('hermes')` groups variants.
  - `createCustom` → `isCustom === true` and the result appears in `search`.
- [ ] **Step 2:** In `memory.test.ts`, call `runRepositoryContract('memory', () => createMemoryRepositories(fixtureCatalog))`. Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `memory.ts` and `RepositoryContext.tsx`. `useRepositories` throws if there is no provider.
- [ ] **Step 4:** Run `npm test -- __tests__/data`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(data): repository interfaces with in-memory implementation`.

---

### Task 5: Supabase repositories and auth session

**Files:**
- Create: `src/data/supabase.ts`, `src/data/session.ts`
- Test: `__tests__/data/mappers.test.ts`, `__tests__/data/supabase.integration.test.ts` (runs only when `SUPABASE_TEST_URL` is set)

**Interfaces:**
- Consumes: Task 3 schema and RPC; Task 4 interfaces and contract suite.
- Produces: `createSupabaseRepositories(client: SupabaseClient): { catalog; collection }`, `rowToFragrance(row): Fragrance`, `rowToCollectionItem(row): CollectionItem`, `supabaseClient` (singleton, sessions saved with AsyncStorage), `useSession(): { session: Session | null; loading: boolean }`, `signInWithEmailOtp(email: string): Promise<void>`, `verifyEmailOtp(email: string, token: string): Promise<void>`, `signOut(): Promise<void>`.

- [ ] **Step 1: Write failing tests:** a mapper test that converts a snake_case row into the expected camelCase object (`favorite_flag → favorite`, `created_by != null → isCustom: true`, `note_pyramid` missing a key → empty array). The integration test runs `runRepositoryContract('supabase', …)` against local Supabase as a signed-in test user.
- [ ] **Step 2:** Run `npm test -- __tests__/data/mappers`. Expected: FAIL.
- [ ] **Step 3:** Implement. `add` uses `upsert(..., { onConflict: 'client_request_id', ignoreDuplicates: true })` and then selects by `client_request_id`, which makes it idempotent. `search` calls `rpc('search_fragrances')` → `groupVariants`. `list` selects `collection_items` with `fragrances(*)` included. Database errors are rethrown as `RepositoryError { kind: 'network' | 'auth' | 'unknown' }`.
- [ ] **Step 4:** Run `npm test -- __tests__/data/mappers` (PASS). Then run `SUPABASE_TEST_URL=… npm test -- supabase.integration` against `supabase start`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(data): Supabase repositories and email OTP session`.

---

### Task 6: Theme, butler copy, shared components, navigation shell, sign-in

**Files:**
- Create: `src/ui/theme.ts`, `src/copy/butler.ts`, `src/ui/components/{Button,Chip,FragranceRow,EmptyState,ErrorBanner}.tsx`, `app/_layout.tsx`, `app/sign-in.tsx`, `app/(tabs)/_layout.tsx`
- Test: `__tests__/app/signIn.test.tsx`, `__tests__/ui/Button.test.tsx`

**Interfaces:**
- Produces `butler` copy (exact strings):
  ```ts
  export const butler = {
    emptyCollection: { title: 'Your collection awaits.', body: 'Shall we add the first bottle?', cta: 'Add a bottle' },
    searchPlaceholder: 'House or fragrance name',
    noResults: (q: string) => `I don’t know “${q}”. Shall I add it as a custom entry?`,
    addCustomCta: 'Add as custom entry',
    confirmTitle: 'Confirm the bottle',
    chooseConcentration: 'Which concentration?',
    chooseSize: 'Bottle size',
    save: 'Add to collection',
    saving: 'Adding…',
    saved: 'Added to your collection.',
    saveFailed: 'I couldn’t save that just now. Your selection is kept. Try again when ready.',
    loadFailed: 'I couldn’t reach your collection. Pull to try again.',
    removeConfirm: 'Remove this bottle from your collection?',
    signInTitle: 'Good day.', signInBody: 'Your email, and I’ll send a sign-in code.',
  } as const;
  ```
- Produces `Button` props `{ label: string; onPress(): void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'quiet' }`. While `loading` it is disabled and shows `butler.saving`.
- Produces `theme` tokens: colours `ink`, `parchment`, `brass`, `muted`, `danger` (each with a dark-mode variant); serif display font + system body font; spacing scale `4/8/12/16/24/32`.
- `app/_layout.tsx`: provides `RepositoryProvider` (Supabase in the app) and redirects to `/sign-in` when there is no session.

- [ ] **Step 1: Write failing tests:** pressing a `Button` with `loading` does not call `onPress`. On the sign-in screen, entering an email and pressing "Send code" calls `signInWithEmailOtp` with the trimmed email. An invalid email shows an inline error and makes no call.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ui): butler theme, copy, components, auth-gated navigation`.

---

### Task 7: Manual entry (search → confirm → save) and custom entry

**Files:**
- Create: `app/(tabs)/add.tsx`, `app/add/confirm.tsx`, `app/add/custom.tsx`, `src/features/add/useSaveBottle.ts`
- Test: `__tests__/app/addFlow.test.tsx`

**Interfaces:**
- Consumes: `useRepositories`, `butler`, `Button`, `Chip`, `FragranceRow`, `PRESET_BOTTLE_SIZES_ML`, `parseNewCollectionItem`, `parseCustomFragrance`.
- Produces: the route `add/confirm?house=…&name=…&ids=<comma-separated variant ids>` and `useSaveBottle(): { save(input: Omit<NewCollectionItem,'clientRequestId'>): Promise<void>; status: 'idle' | 'saving' | 'error' }`. The hook creates one `clientRequestId` (with `crypto.randomUUID()`) for each confirm-screen visit and reuses it on retry.

- [ ] **Step 1: Write failing tests** (memory repositories with fixtures):
  - Typing "sauvage" (debounced 250 ms) shows a single row "Dior · Sauvage".
  - Typing "zzz" shows `butler.noResults('zzz')` and the `addCustomCta` button.
  - On the confirm screen, the concentration picker is **hidden** for a single-variant group and **shown** for a multi-variant one. No size is pre-selected, and Save is disabled until a size is chosen.
  - Choosing a custom size of "75" saves `bottleSizeMl: 75`.
  - Pressing Save twice quickly → `collection.list()` has length 1.
  - If `collection.add` rejects → `butler.saveFailed` is shown, the chosen variant and size stay selected, and pressing Retry succeeds with the same `clientRequestId`.
  - Success → the "Added" toast shows and the app goes back to search **with the query kept** (fast bulk entry, roadmap cold-start note).
  - On the custom screen, a blank house shows a field error. A valid entry calls `catalog.createCustom` and then opens the confirm screen with the new id.
- [ ] **Step 2:** Run `npm test -- addFlow`. Expected: FAIL.
- [ ] **Step 3:** Implement the screens and `useSaveBottle`. All three entry points (search result, custom entry, and later barcode/image) lead to `add/confirm`, which is the spec's shared confirmation step.
- [ ] **Step 4:** Run `npm test -- addFlow`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(add): manual search, custom entry, shared confirmation step`.

---

### Task 8: Collection browse and bottle detail

**Files:**
- Create: `app/(tabs)/index.tsx`, `app/item/[id].tsx`
- Test: `__tests__/app/collection.test.tsx`

**Interfaces:**
- Consumes: `collection.list/get/update/remove`, `sortCollection`, `butler`, `EmptyState`, `ErrorBanner`.

- [ ] **Step 1: Write failing tests:**
  - An empty collection shows `butler.emptyCollection`, and its CTA opens the Add tab.
  - Three bottles are listed in house order by default. Switching to "Recent" reorders them, and switching to "Favorites" puts favorites first.
  - Each row shows house, name, concentration and `"{n} ml"`. Two bottles of the same fragrance appear as two rows.
  - On the detail screen, house, name, concentration, size, notes (or "Notes not yet known" when the pyramid is empty), and the favorite toggle are shown. Toggling favorite calls `update(id, { favorite: true })`. Editing and saving `userNotes` persists. Remove → confirm dialog → `remove` → go back.
  - If `list` rejects, `butler.loadFailed` is shown, and pull-to-refresh tries again.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement using a `FlatList` (it renders only visible rows, so large collections scroll smoothly). The list reloads whenever the Collection tab gets focus.
- [ ] **Step 4:** Run `npm test && npm run typecheck && npm run lint`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(collection): browse with sorting and bottle detail view`.

---

### Task 9: iOS build and Phase 1 exit check

**Files:**
- Create: `eas.json` (profiles `development`, `preview`), `docs/phase-1-exit-checklist.md`
- Modify: `app.json` (iOS `bundleIdentifier`, app name "Fragrance Butler")

- [ ] **Step 1:** Run `eas build --platform ios --profile preview`. Expected: the build succeeds and installs through TestFlight or an internal-distribution link.
- [ ] **Step 2:** Do a manual exit check on a real iPhone. Record the results in the checklist:
  - Sign in.
  - Add 5 bottles by search, 1 as a custom entry, and 1 duplicate in a different size.
  - Force-quit the app → the collection is still there.
  - Sign in on a second device or simulator → the same collection appears (cloud sync).
  - Airplane mode → the save error appears with the selection kept. Back online → retry succeeds.
- [ ] **Step 3:** Commit `chore: EAS iOS build config and Phase 1 exit checklist`.

**Phase 1 exit criteria (spec §8):** "A user can build and view a collection entirely by hand." This is met when Task 9 Step 2 passes.
