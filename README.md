# Fragrance Butler

An iOS-first Expo (React Native, TypeScript) app for cataloguing your fragrance collection. The butler advises; you decide. Supabase is the source of truth, so the collection survives losing a device.

## Setup

Requires Node 22 and npm 10.

```bash
npm install
cp .env.example .env   # then fill in the Supabase URL and anon key
```

`.env` holds only public client configuration (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). It is git-ignored; never commit it.

Set `EXPO_PUBLIC_FEATURE_ASK=1` to show the Ask tab and the tray. Leave it off until the `recommend` and `record-selection` Edge Functions are deployed; their contract is in `docs/recommend-contract.md`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server (`npm run ios` opens the iOS simulator) |
| `npm test` | Run the Jest suite (`jest-expo` preset) |
| `npm run test:integration` | Run the repository contract against a real Supabase stack (skipped unless `SUPABASE_TEST_URL` is set; see below) |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run lint` | Lint with `expo lint` |

### Integration tests

`npm run test:integration` runs `__tests__/data/supabase.integration.test.ts` in plain Node (its own Jest config, `jest.integration.config.js`; the default `npm test` skips it). It needs a local stack from `supabase start` with the migration and seed applied (`supabase db reset`) and a confirmed test user with a password. Use a dedicated user: its collection is emptied before every test.

```bash
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_ANON_KEY=<anon key from `supabase status`> \
SUPABASE_TEST_EMAIL=<test user email> \
SUPABASE_TEST_PASSWORD=<test user password> \
npm run test:integration
```

Without `SUPABASE_TEST_URL` the suite is skipped.

Source imports can use the `@/*` alias, which maps to `src/*` (TypeScript and Jest both resolve it).

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. There are two jobs:

- **App:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`.
- **Database:** installs Postgres 16 and pgTAP, then runs `npm run test:db`.

The Supabase integration suite (`npm run test:integration`) is not run in CI, because it needs a real Supabase project.

## Releasing

Building for TestFlight and the App Store needs your own Expo and Apple Developer accounts. Follow [`docs/release/testflight.md`](docs/release/testflight.md), then work through the [Phase 1 exit checklist](docs/phase-1-exit-checklist.md) on a real iPhone.

## Docs

The spec, roadmap and implementation plans live in `docs/`.
