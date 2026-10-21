# Fragrance Butler

An iOS-first Expo (React Native, TypeScript) app for cataloguing your fragrance collection. The butler advises; you decide. Supabase is the source of truth, so the collection survives losing a device.

## Setup

Requires Node 22 and npm 10.

```bash
npm install
cp .env.example .env   # then fill in the Supabase URL and anon key
```

`.env` holds only public client configuration (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). It is git-ignored; never commit it.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server (`npm run ios` opens the iOS simulator) |
| `npm test` | Run the Jest suite (`jest-expo` preset) |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run lint` | Lint with `expo lint` |

Source imports can use the `@/*` alias, which maps to `src/*` (TypeScript and Jest both resolve it).

## Docs

The spec, roadmap and implementation plans live in `docs/`.
