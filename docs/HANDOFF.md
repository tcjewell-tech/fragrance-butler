# Handoff: Fragrance Butler

Repo: tcjewell-tech/fragrance-butler (Expo / React Native / TypeScript iOS app, Supabase backend).
Written 2026-11-12, after PR #2 merged (`main` at d77db1e). For a new local session picking up the work.

## First steps

1. Read this file, `docs/recommend-contract.md`, and the section "The butler's recommendations" in `docs/release/testflight.md`.
2. Start any new work from an up-to-date `main` (`git checkout main && git pull`). The earlier working branch,
   `claude/magical-heisenberg-dzf3du`, was merged and then restarted from `main` to carry this file only: don't build on it.

## What exists (all merged to main)

- Phase 1: collection app. Email sign-in with a 6-digit code, manual add and custom entry, browse, bottle detail,
  settings with account deletion, butler theme and copy, EAS config, TestFlight guide.
- The Ask tab and tray screen ("What shall I wear?"), hidden behind `EXPO_PUBLIC_FEATURE_ASK` (off by default).
- Server side for recommendations:
  - `supabase/migrations/0002_recommendations.sql`: table `recommendation_requests` (RLS: users read their own, only the
    service role writes; no column for outfit photos) and the database function `record_recommendation_selection`
    (records the choice, moves `wear_count` on a change of mind).
  - `supabase/functions/recommend/index.ts`, with its logic in `supabase/functions/_shared/recommend-core.ts`. It calls
    `claude-sonnet-5-5` with structured output restricted to labelled candidates from the user's own collection. The
    server-side refusal fallback is on.
  - `evals/recommend/scenarios.json` (24 scenarios, including the must-pass tuxedo pair: opera vs office party) and
    `npm run evals`, which writes a results file to score 1-5 by hand.
- CI: typecheck, lint, Jest, pgTAP, and `deno check` on the Edge Function.
- Checks at merge: 386 Jest tests and 94 pgTAP tests, all green.

## Not built yet

- Weather and location (the permission prompt is designed; no code), outfit photo analysis (an `analyze-outfit`
  function), Phase 2 capture (barcode and photo), the friend flow (Phase 4), Phase 5 learning and polish.

## Needs the owner (Tom) on his own accounts

1. Add the `ANTHROPIC_API_KEY` secret in Supabase. Never paste the key into chat, the app, `.env` or the repo.
2. `supabase db push`, then `supabase functions deploy recommend`.
3. Run `npm run evals` with the key (about $0.50) and score the results. The two tuxedo scenarios must pass. This has
   NOT been run against the real Claude API yet; the runner was only tested against a local stand-in.
4. Set `EXPO_PUBLIC_FEATURE_ASK=1` in EAS and rebuild.
5. Update the privacy policy and App Privacy answers: occasions are sent to Anthropic.

## Decisions already made

- Model: Sonnet 5.5. Effort "medium" is a starting guess to tune with the evals.
- Location is asked on the first "What shall I wear?" (contextual prompt, coarse location only).
- Recording the choice is a database function (RPC), not a separate Edge Function.
- Privacy rules (spec section 6): outfit photos and friend descriptions are never stored.

## Design system

Lives on claude.ai, not in this repo: https://claude.ai/artifact/A1v8JjgNd2HZZHri1sx54W
Tokens, components, screens (tray, Ask, friend flow, collection, permissions) and a brand book. Anything marked
"proposed" is a new idea, not yet built.

## Pending

- Tom has AI images to put in the design system or the app. Ask what they show, how many, whether dark-mode versions
  exist, and whether the generator allows commercial use. Avoid images of real branded bottles.

## Working notes

- Windows: `npm run test:db` is a bash script that needs Postgres 16 and pgTAP. Use WSL, or rely on CI.
  `npm run check:functions` needs Deno installed.
- Don't open a pull request unless Tom asks. Develop on a branch; never push to `main` directly.
- Tom wants every answer to end with a confidence level and the assumptions made, and to be asked clarifying
  questions that serve the end goal. He is not a developer: explain steps plainly.
