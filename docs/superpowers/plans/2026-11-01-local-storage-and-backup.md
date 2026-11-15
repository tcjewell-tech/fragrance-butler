# On-device Storage and Collection Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Fragrance Butler with no backend (collection stored on the phone), with a file-based backup, restore (merge) and a backup reminder.

**Architecture:** `createMemoryRepositories` gains persistence hooks and is wrapped by a new `createLocalRepositories` that saves to AsyncStorage. A build-time flag swaps the root layout to a local root with no sign-in. Backup is pure domain functions (`src/domain/backup.ts`) driven by a `BackupApi` whose device I/O (file write, share sheet, file picker) is injectable.

**Tech Stack:** Expo SDK 58, React Native 0.88, expo-router, TypeScript, zod 4, Jest (`jest-expo`) with Testing Library. New: `expo-file-system`, `expo-sharing`, `expo-document-picker`.

**Spec:** `docs/superpowers/specs/2026-11-01-local-storage-and-backup-design.md`

## Global Constraints

- Flag: `EXPO_PUBLIC_LOCAL_MODE === '1'`, off by default; the Supabase build must behave exactly as before. In local mode `askTab` is forced off.
- Backup file: name `fragrance-butler-backup.json`; `format` is `"fragrance-butler-backup"`; `version` is `1`; keys `exportedAt`, `items`, `customFragrances`. Catalog fragrances are not stored in it.
- AsyncStorage keys: `fragrance-butler:v1` (state) and `fragrance-butler:last-backup` (ISO string).
- Merge restore never deletes or overwrites; an item already present (same `id`) is left as the phone has it. Restored items keep `id`, `createdAt`, `wearCount` and take the local `userId`.
- Reminder: `BACKUP_REMINDER_THRESHOLD = 3` unbacked bottles; "Not now" hides it until the next app launch.
- Ids come from `newId()` in `src/lib/uuid.ts`; never `crypto.randomUUID()` in app code (Hermes has none).
- All user-facing text goes in `src/copy/butler.ts`, in the butler voice (deferential, concise, confident).
- Local mode must run with no `EXPO_PUBLIC_SUPABASE_*` variables set and never call the Supabase client.
- Tests live under `__tests__/` mirroring `src/`; imports use the `@/` alias. Before each commit run `npm run typecheck && npm run lint && npm test`.
- Commit messages end with the two attribution lines from the session's system reminder.

## Review Focus

1. Backing up an empty collection produces a valid file that restores as a no-op (Task 4, Task 6).
2. Restoring the same file twice, or a file containing two items with the same `id`, adds nothing the second time and no duplicates (Task 4).
3. A stored value that cannot be read is never overwritten by the next save (Task 5).
4. A backup item whose catalog fragrance no longer exists in the bundled catalog (the CSV was edited) is skipped and counted, not a crash (Task 4).
5. A cancelled share sheet or file picker, or a failed file write, changes no data and does not mark the collection as backed up (Task 6).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/config/features.ts` (modify) | `localMode` flag; `askTab` off in local mode |
| `src/data/persistedState.ts` (create) | `PersistedState` type + zod schema + `emptyState()` |
| `src/data/memory.ts` (modify) | `newId()`; `initial`/`onChange`; `snapshot()`, `applyRestore()` |
| `scripts/build-seed.mjs` (modify), `src/data/catalogSeed.ts` (generated) | Emit the bundled catalog |
| `src/data/bundledCatalog.ts` (create) | `catalogSeed` rows to `Fragrance[]` |
| `src/domain/backup.ts` (create) | `buildBackup`, `parseBackup`, `planRestore`, `BackupError` |
| `src/data/local.ts` (create) | `createLocalRepositories(storage)` |
| `src/data/backupApi.ts`, `src/data/BackupApiContext.tsx` (create) | `BackupApi`, device adapter, context |
| `src/shell/RootStack.tsx`, `LocalRoot.tsx`, `SupabaseRoot.tsx` (create); `app/_layout.tsx` (modify) | Split root layout |
| `app/settings.tsx` (modify) | Backup section in local mode |
| `src/ui/components/BackupReminder.tsx` (create); `app/(tabs)/index.tsx` (modify) | Reminder banner |
| `docs/local-mode.md` (create); `docs/release/testflight.md` (modify) | Docs |

---

### Task 1: Flag and dependencies

**Files:** Modify `src/config/features.ts`, `package.json`; Test `__tests__/config/features.test.ts`

**Interfaces:**
- Produces: `features.localMode: boolean`; `features.askTab` is `false` whenever `localMode` is true.

- [ ] **Step 1: Write failing tests** using `jest.isolateModules` to load `@/config/features` after setting `process.env`: `localMode is off by default`; `localMode is on when EXPO_PUBLIC_LOCAL_MODE=1`; `askTab is off in local mode even with EXPO_PUBLIC_FEATURE_ASK=1`; `askTab is on with only EXPO_PUBLIC_FEATURE_ASK=1`.
- [ ] **Step 2: Run** `npx jest __tests__/config/features.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `localMode` and the `askTab` condition in `src/config/features.ts`; update its doc comment.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Install** `npx expo install expo-file-system expo-sharing expo-document-picker`, then `npx expo-doctor`. Expected: no new failures from these packages (if the network blocks it, record that and continue). Note the installed `expo-file-system` API (read its `.d.ts` in `node_modules`); Task 6 uses it.
- [ ] **Step 6: Commit** `feat: local-mode flag and file/share/picker dependencies`.

---

### Task 2: Persistable in-memory repositories

**Files:** Create `src/data/persistedState.ts`; Modify `src/data/memory.ts`; Test `__tests__/data/memoryPersistence.test.ts` (existing `memory.test.ts` must pass unchanged)

**Interfaces:**
- Produces in `persistedState.ts`:
  - `interface PersistedState { version: 1; customFragrances: Fragrance[]; items: CollectionItem[]; requestIds: Record<string, string> }` (`requestIds` maps `clientRequestId` to item id)
  - `persistedStateSchema` (zod), `emptyState(): PersistedState`
- Produces in `memory.ts`:
  - `type MemoryRepositories = Repositories & { snapshot(): PersistedState; applyRestore(plan: RestorePlan): Promise<void> }`
  - `createMemoryRepositories(seed?: Fragrance[], options?: { initial?: PersistedState; onChange?: (state: PersistedState) => void | Promise<void> }): MemoryRepositories`
- Consumes: `RestorePlan` from Task 4. To avoid ordering trouble, declare the `RestorePlan` interface in `src/domain/backup.ts` first as a type-only stub in this task: `{ addFragrances: Fragrance[]; addItems: CollectionItem[]; alreadyPresent: number; skipped: number }`. Task 4 adds the functions.

- [ ] **Step 1: Write failing tests** in `memoryPersistence.test.ts`: `initial state is loaded (custom fragrances, items, request ids)`; `a repeated add with a remembered clientRequestId returns the existing item`; `onChange fires once per createCustom, add, update, remove and recordSelection with the new snapshot`; `onChange does not fire for a rejected call (invalid input)`; `when onChange rejects the mutation is rolled back and the call rejects with RepositoryError kind unknown`; `two concurrent adds both persist and snapshots arrive in call order`; `applyRestore adds fragrances and items with the local user id and keeps id, createdAt and wearCount, then fires onChange once`.
- [ ] **Step 2: Run** `npx jest __tests__/data`. Expected: new tests FAIL, existing PASS.
- [ ] **Step 3: Implement.** Replace `crypto.randomUUID()` with `newId()`. Route every state-changing method through one internal `commit` that applies the mutation, awaits `onChange(snapshot())`, and on rejection restores the previous state and throws `new RepositoryError('unknown', ..., { cause })`. Mutations run serially via a promise chain. Methods with no `options` behave as today.
- [ ] **Step 4: Run** `npx jest __tests__/data` and `npm run typecheck`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(data): persistable in-memory repositories`.

---

### Task 3: Bundled catalog generator

**Files:** Modify `scripts/build-seed.mjs`, `scripts/build-seed.d.mts`, `package.json` (no change if `seed:build` already runs the script); Create `src/data/bundledCatalog.ts`, generated `src/data/catalogSeed.ts`; Test `__tests__/scripts/buildCatalog.test.ts`, `__tests__/data/bundledCatalog.test.ts`

**Interfaces:**
- Produces in `build-seed.mjs`: `catalogId(house: string, name: string, concentration: string): string` returning `` `catalog:${normalizeKey(house)}|${normalizeKey(name)}|${concentration}` ``; `buildCatalogModule(csvText: string): string` returning TypeScript source for `src/data/catalogSeed.ts`.
- Produces: `catalogSeed: readonly { id: string; house: string; name: string; concentration: Concentration; releaseYear: number | null }[]`; `bundledCatalog(): Fragrance[]` (empty note pyramid, `isCustom: false`, other fields null/empty, as `createCustom` does but with the catalog id).

- [ ] **Step 1: Write failing tests**: `catalogId ignores case and accents` (`Hermès`/`hermes` give the same id); `buildCatalogModule is deterministic`; `buildCatalogModule reuses the CSV validation errors` (blank house throws `row N: ...`); `catalogSeed.ts is in sync with catalog.csv` (compare file text with `buildCatalogModule(readFileSync(csv))`); `bundledCatalog returns one fragrance per row with unique ids`.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement** both functions, reusing `parseCsv` and the validation in `buildSeedSql` (extract a shared row parser rather than duplicating it). Make the direct-run block write both `supabase/seed.sql` and `src/data/catalogSeed.ts`. Update `build-seed.d.mts`.
- [ ] **Step 4: Run** `npm run seed:build`, then the tests. Expected: PASS; `git diff` shows only the new generated file (seed.sql unchanged).
- [ ] **Step 5: Commit** `feat(data): bundled catalog generated from the seed CSV`.

---

### Task 4: Backup domain

**Files:** Create/Modify `src/domain/backup.ts`; Test `__tests__/domain/backup.test.ts`

**Interfaces:**
- Produces:
  - `const BACKUP_FORMAT = 'fragrance-butler-backup'`, `const BACKUP_VERSION = 1`
  - `interface Backup { format: typeof BACKUP_FORMAT; version: 1; exportedAt: string; items: CollectionItem[]; customFragrances: Fragrance[] }`
  - `class BackupError extends Error { kind: 'not-json' | 'wrong-format' | 'too-new' | 'invalid' }`
  - `buildBackup(entries: CollectionEntry[], now: Date): Backup` (custom fragrances only, only those used by the items)
  - `parseBackup(text: string): Backup`
  - `interface RestorePlan { addFragrances: Fragrance[]; addItems: CollectionItem[]; alreadyPresent: number; skipped: number }`
  - `planRestore(backup: Backup, current: { fragranceIds: ReadonlySet<string>; itemIds: ReadonlySet<string> }): RestorePlan` where `fragranceIds` holds bundled catalog ids plus the phone's custom ids.

- [ ] **Step 1: Write failing tests**: round trip `parseBackup(JSON.stringify(buildBackup(...)))` equals the input including a custom fragrance named `Maison Margiela, Replica “Jazz Club” — café ☕`; `an empty collection builds a valid backup that plans to add nothing`; `parseBackup throws kind not-json for text that is not JSON`; `...wrong-format for another JSON document`; `...too-new for version 2`; `...invalid for an item with a negative wearCount, an unknown concentration or a missing field`; `planRestore adds items whose id is absent`; `planRestore counts items already present and leaves them out of addItems`; `planRestore skips an item whose fragrance is not in current ids or the backup's custom fragrances and counts it in skipped`; `planRestore adds a custom fragrance only when its id is absent`; `two items with the same id in one file are added once`; `applying the plan twice (second plan computed from the updated ids) adds nothing`.
- [ ] **Step 2: Run** `npx jest __tests__/domain/backup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with zod schemas for `Fragrance` and `CollectionItem` (reuse enums from `src/domain/types.ts`; `version` uses `z.number()` first so a larger version reports `too-new`, not `invalid`). Pure functions, no I/O.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): collection backup format, parse and merge plan`.

---

### Task 5: Local repositories

**Files:** Create `src/data/local.ts`; Modify `butler.ts` copy (key `storageUnreadable`); Test `__tests__/data/local.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4.
- Produces:
  - `interface KeyValueStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }` (AsyncStorage satisfies it)
  - `const STATE_KEY = 'fragrance-butler:v1'`
  - `type LocalRepositories = MemoryRepositories` (same shape, including `snapshot()` and `applyRestore()`)
  - `createLocalRepositories(storage: KeyValueStorage): Promise<LocalRepositories>`. Rejects with `RepositoryError('unknown')` when a stored value exists but fails `persistedStateSchema`.

- [ ] **Step 1: Write failing tests** with a `Map`-backed fake storage: run `runRepositoryContract('local', ...)` from `__tests__/data/repositoryContract.ts` over `createLocalRepositories` seeded via the fixtures (the factory must give an empty collection; pass a fresh fake storage and the fixture catalog through an optional second parameter `seed?: Fragrance[]` defaulting to `bundledCatalog()`); `state survives a simulated restart` (add a bottle and a custom fragrance, create new repositories from the same storage, both are there); `a retried add after restart returns the same item`; `a corrupt stored value rejects and the stored text is unchanged after the failed load`; `no key means an empty collection`; `a failing setItem makes add reject and leaves the collection empty`.
- [ ] **Step 2: Run** `npx jest __tests__/data/local.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Load, validate, build with `createMemoryRepositories(seed, { initial, onChange })` where `onChange` calls `storage.setItem(STATE_KEY, JSON.stringify(state))`. Add the copy string.
- [ ] **Step 4: Run** the test and the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(data): on-device repositories persisted in AsyncStorage`.

---

### Task 6: Backup API and device adapter

**Files:** Create `src/data/backupApi.ts`, `src/data/BackupApiContext.tsx`; Test `__tests__/data/backupApi.test.ts`

**Interfaces:**
- Consumes: `LocalRepositories`, `KeyValueStorage`, `buildBackup`, `parseBackup`, `planRestore`, `bundledCatalog`.
- Produces:
  - `interface BackupDevice { writeFile(name: string, text: string): Promise<string>; share(uri: string): Promise<boolean>; pickFile(): Promise<string | null> }` (`share` resolves false if the user cancelled; `pickFile` resolves null on cancel and the file's text otherwise)
  - `interface RestoreSummary { added: number; alreadyPresent: number; skipped: number }`
  - `interface BackupApi { backUp(): Promise<boolean>; restore(): Promise<RestoreSummary | null>; unbackedCount(): Promise<number> }`
  - `createBackupApi(deps: { repositories: LocalRepositories; storage: KeyValueStorage; device: BackupDevice; now?: () => Date }): BackupApi`
  - `const LAST_BACKUP_KEY = 'fragrance-butler:last-backup'`, `const BACKUP_REMINDER_THRESHOLD = 3`, `const BACKUP_FILENAME = 'fragrance-butler-backup.json'`
  - `expoBackupDevice: BackupDevice` (expo-file-system cache directory, expo-sharing, expo-document-picker with `type: 'application/json'`, `copyToCacheDirectory: true`)
  - In the context file: `BackupApiProvider`, `useBackupApi(): BackupApi | null` (null when no provider, i.e. the Supabase build)

- [ ] **Step 1: Write failing tests** with a fake device: `backUp writes the named file with a valid backup and shares it, then stamps last-backup`; `backUp on an empty collection still writes a valid file`; `a cancelled share sheet returns false and does not stamp last-backup`; `a failing writeFile rejects and does not stamp last-backup`; `restore of a valid file merges and returns added/alreadyPresent/skipped counts`; `restoring the same file twice returns added 0 the second time`; `restore returns null when the picker is cancelled and changes nothing`; `restore of a bad file rejects with BackupError and changes nothing`; `restore does not change last-backup`; `unbackedCount counts items created after last-backup, or all items when never backed up`.
- [ ] **Step 2: Run** `npx jest __tests__/data/backupApi.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `createBackupApi`, the context, and `expoBackupDevice` (not unit-tested; keep it a thin wrapper over the three packages, using the API found in Task 1 Step 5).
- [ ] **Step 4: Run** the tests, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(data): backup and restore API with injectable device I/O`.

---

### Task 7: Local root layout

**Files:** Create `src/shell/RootStack.tsx`, `src/shell/LocalRoot.tsx`, `src/shell/SupabaseRoot.tsx`; Modify `app/_layout.tsx`; Test `__tests__/shell/LocalRoot.test.tsx`

**Interfaces:**
- Produces: `RootStack({ signedIn }: { signedIn: boolean })` (the existing `Stack` with its `Stack.Protected` guards, moved out of the layout unchanged); `LocalRoot()` loads `createLocalRepositories(AsyncStorage)`, shows a plain parchment view while loading, `ErrorBanner` with `butler.storageUnreadable` if loading fails, otherwise provides `RepositoryProvider`, `BackupApiProvider` (using `expoBackupDevice`) and `<RootStack signedIn />`; `SupabaseRoot()` contains today's layout logic (`useSession`, auto-refresh effect, `createSupabaseRepositories`); `RootLayout` renders `features.localMode ? <LocalRoot /> : <SupabaseRoot />`.

- [ ] **Step 1: Write failing tests** mocking `expo-router`'s `Stack` as a passthrough: `LocalRoot renders the app without any Supabase environment variable and never touches the Supabase client` (spy on `getSupabaseClient`); `LocalRoot shows the unreadable-storage message and does not render the app when the stored state is corrupt`.
- [ ] **Step 2: Run** `npx jest __tests__/shell`. Expected: FAIL.
- [ ] **Step 3: Implement** the three components and the thin `RootLayout`. Keep the Supabase behaviour byte-for-byte equivalent (same hooks, same guards).
- [ ] **Step 4: Run** the full suite and `npm run typecheck`. Then bundle both modes: `npx expo export --platform web` and `EXPO_PUBLIC_LOCAL_MODE=1 npx expo export --platform web`. Expected: both succeed (record it if the sandbox blocks the export).
- [ ] **Step 5: Commit** `feat(app): local root layout with no sign-in`.

---

### Task 8: Settings backup section

**Files:** Modify `app/settings.tsx`, `src/copy/butler.ts`; Test `__tests__/app/settings.test.tsx` (extend)

**Interfaces:**
- Consumes: `useBackupApi()`. When it returns non-null the screen shows the backup section and hides Sign out and Delete account; when null, it is unchanged.
- Copy keys to add: `backupSection`, `backUpCta`, `backUpDone`, `backUpFailed`, `restoreCta`, `restoreDone(summary)` ("Added 12 bottles; 3 were already here."), `restoreSkipped(n)`, `restoreBadFile`, `restoreFailed`.

- [ ] **Step 1: Write failing tests** with a fake `BackupApi`: `without a backup API the account actions show and the backup section does not` (existing tests stay green); `with a backup API the backup buttons show and Sign out and Delete account do not`; `Back up collection calls backUp once even if pressed twice quickly`; `a failing backUp shows backUpFailed`; `Restore shows the summary, including the skipped count when it is above zero`; `Restore shows restoreBadFile when the API rejects with BackupError`; `a cancelled picker (null) shows nothing`.
- [ ] **Step 2: Run** `npx jest __tests__/app/settings.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the section, using the in-flight-ref pattern already in the file for one call per press.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(settings): back up and restore the collection`.

---

### Task 9: Backup reminder

**Files:** Create `src/ui/components/BackupReminder.tsx`; Modify `app/(tabs)/index.tsx`, `src/copy/butler.ts`; Test `__tests__/ui/BackupReminder.test.tsx`

**Interfaces:**
- Produces: `BackupReminder({ count, onBackUp, onDismiss }: { count: number; onBackUp(): void; onDismiss(): void })` renders nothing when `count < BACKUP_REMINDER_THRESHOLD`. Copy: `backupReminder(n)` ("You have 4 bottles not yet backed up."), `backupReminderCta` ("Back up"), `backupReminderDismiss` ("Not now").
- The Collection screen, when `useBackupApi()` is non-null, reads `unbackedCount()` on focus, renders the banner above the list, routes `onBackUp` to `/settings`, and keeps the dismissed flag in component state (resets on next launch).

- [ ] **Step 1: Write failing tests**: component: `renders nothing at 2`, `renders the count at 3`, `Back up and Not now call their handlers`; screen (extend `collection.test.tsx` with a fake `BackupApi`): `shows the banner at 3 unbacked bottles`, `does not show it at 2`, `Not now hides it`, `does not show it when there is no backup API`.
- [ ] **Step 2: Run** `npx jest __tests__/ui/BackupReminder.test.tsx __tests__/app/collection.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the component and the screen wiring.
- [ ] **Step 4: Run** the two files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(collection): remind to back up after 3 unbacked bottles`.

---

### Task 10: Documentation and final verification

**Files:** Create `docs/local-mode.md`; Modify `docs/release/testflight.md`, `.env.example`

- [ ] **Step 1: Write `docs/local-mode.md`**: how to turn it on (`EXPO_PUBLIC_LOCAL_MODE=1`), what it disables, the backup file format and merge rules, the catalog-id caveat (renaming a CSV row changes its id), and that restoring may show the reminder once.
- [ ] **Step 2: Edit `docs/release/testflight.md`**: add a short "Local mode" note near the top (sections 1 Supabase/email sign-in/integration tests, 2 EAS Supabase variables and 6 demo mailbox do not apply; set `EXPO_PUBLIC_LOCAL_MODE=1` as an EAS env var; App Privacy answers become "Data not collected" because nothing leaves the device). Add the flag to `.env.example`.
- [ ] **Step 3: Verify the whole branch:** `npm run typecheck && npm run lint && npm test`. Expected: all pass. Run `npx expo-doctor` and `npx expo install --check` and record the results.
- [ ] **Step 4: Re-read the spec's Testing section** and confirm each bullet has a passing test; list any gap in the commit message instead of hiding it.
- [ ] **Step 5: Commit** `docs: local mode and TestFlight notes`, then `git push -u origin claude/epic-planck-5vniep`.
