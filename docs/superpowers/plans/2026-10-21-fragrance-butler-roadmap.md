# Fragrance Butler: Architecture & Roadmap

**Spec:** `docs/spec/Fragrance_Butler_Spec_v1.1.0.pdf` (v1.1.0, 30 Aug 2026, Draft)
**Status:** Proposed for review, 2026-10-21

This document covers all five phases of the spec. Each phase gets its own detailed implementation plan when it starts. The first one is in this folder: `2026-10-21-fragrance-butler-phase-1.md`. Phases 2–5 are only outlined here because they depend on open items (§7) that need answers first.

---

## 1. Proposed technology decisions

The spec leaves these choices to the implementation. Each one is a recommendation for you to confirm or override.

| Layer (spec §5) | Recommendation | Why | Main alternative |
|---|---|---|---|
| Cross-platform framework (closes the spec's open item #4) | **React Native + Expo, TypeScript** | Expo has camera and barcode scanning built in (`expo-camera`), so Phase 2 needs no native code. EAS Build produces iOS builds without a local Mac. The same code produces the Android build later. Over-the-air updates make it fast to iterate on the butler's copy and the tray design. | Flutter. Its rendering is a little more polished, but Dart has a smaller ecosystem for the AI and Supabase work here. |
| Backend, auth & cloud sync | **Supabase** (Postgres, Auth, Storage, Edge Functions) | Real relational tables match the spec's §4 data model. Row-level security keeps each user's collection private. Edge Functions keep the AI and weather API keys off the phone. Cloud storage keeps the collection safe if the phone is lost (§5 Storage). | Firebase. Its document database fits the relational model less well. |
| Recommendations, outfit analysis, bottle OCR | **Claude API, called from Supabase Edge Functions** | Claude's vision covers the outfit's formality and mood (§3.3) and reading bottle labels (§3.1 Path B). Its reasoning over structured metadata produces the butler-voice rationale (§5). The model is set by an environment variable so it can change without an app release. | OpenAI or Gemini behind the same Edge Function interface. |
| Weather | **Open-Meteo** (no API key needed), called with coarse location | Satisfies §6: coarse location only, with no account or key to manage. | Apple WeatherKit. It needs an Apple developer key and iOS-specific setup. |
| Barcode → product | **Starts as an open item.** Candidates: UPCitemdb, Barcode Lookup, or a barcode→fragrance table we build ourselves as users scan | Spec §7 #1. Must be resolved before Phase 2. | — |
| Fragrance reference data | **Phase 1:** a small hand-curated seed catalog (house, name, concentration, year only). **Phase 2:** a licensed source | Spec §7 #1 already names a self-built seed database as the fallback. Fragrantica's terms do not allow scraping without permission, so it should not be used until there is written permission or a license. | Licensed providers, to be evaluated in Phase 2 |
| Testing | Jest (`jest-expo`) + React Native Testing Library for the app; pgTAP via `supabase test db` for database rules | Each module stays independently testable, as §3 requires. | — |

## 2. System shape

```
┌──────────── iOS app (Expo / React Native) ────────────┐
│ screens (expo-router) → feature hooks → repositories  │
│        ↑ butler copy + theme ("tray" is the hero UI)  │
└───────────────┬───────────────────────────┬───────────┘
                │ supabase-js (RLS)         │ HTTPS (auth JWT)
        ┌───────▼────────┐        ┌─────────▼──────────────────┐
        │ Postgres       │        │ Edge Functions             │
        │ fragrances     │        │  identify-bottle  (Ph 2)   │
        │ collection_    │        │  lookup-barcode   (Ph 2)   │
        │   items        │        │  enrich-fragrance (Ph 2)   │
        │ recommendation_│        │  recommend        (Ph 3)   │
        │   requests(Ph3)│        │  analyze-outfit   (Ph 3)   │
        │ friend_profiles│        │  recommend-friend (Ph 4)   │
        │   (Ph 5)       │        └──┬──────────┬──────────┬───┘
        └────────────────┘           │Claude API│Open-Meteo│ref data
                                     └──────────┴──────────┘
```

Rules that apply in every phase:
- **The app never holds third-party API keys.** All calls to the AI, weather and reference-data services go through Edge Functions.
- **Outfit photos are never saved** (§6). They are uploaded to the function's memory, analyzed and discarded. Only `derived_formality` and `derived_mood` are stored.
- **Friend descriptions are never saved by default** (§6). `recommend-friend` takes the text in the request and logs nothing. Saving a friend profile is an opt-in feature in Phase 5.
- **Recommendations come only from candidates the app supplies.** The Edge Function sends the model a list of candidate fragrances from the database and accepts only answers that use IDs from that list. This means the butler can never recommend a bottle that doesn't exist (§5: "metadata provides the constraint set").

## 3. Phase outline

| Phase | Spec scope | Exit criteria (from spec §8) | Key engineering decisions | Blocking open items |
|---|---|---|---|---|
| **1. Collection foundation** (detailed plan written) | Data model, storage, manual entry, browse and detail views | A user can build and view a collection entirely by hand | Expo scaffold, Supabase schema and row-level security, seed catalog, search, the shared confirmation step, browse and detail screens, butler copy and theme | None |
| **2. Capture & enrichment** | Barcode scan, metadata enrichment, image recognition with confirm-or-correct | A user can add a fragrance by scanning a box or photographing a bottle, with metadata filled in automatically | `expo-camera` barcode scanning (UPC-A, EAN-13); `identify-bottle` = Claude reads the label text, then a fuzzy match against the catalog returns ranked candidates with confidence scores. If the top confidence is below a threshold, the app says "My best guess is…". **Recommendation:** ship Path B as an *assist to manual entry* until a photo-accuracy test proves it works (§7 #2). | §7 #1 (data source), #2 (accuracy), #3 (image corpus) |
| **3. Personal recommendations** | Occasion, weather and time, outfit photo, tray UI | Ask what to wear → 2–3 reasoned options from your own collection | `recommend` function: the full collection plus occasion, weather, time of day and outfit go in; structured JSON with 2–3 picks and one-sentence rationales comes out. Occasion and outfit are separate inputs. The **tuxedo at the opera vs. tuxedo at the office party** case is a must-pass test. An evaluation set of fixed scenario/collection pairs that you score (§7 #5). Each request is logged to `recommendation_requests`, including which option the user picked, from day one (§4 wear-tracking note). | §7 #5 (how to evaluate), #6 (cold start) |
| **4. Friend recommendations** | Description input, collection-weighting toggle, share card | Describe a friend → shareable recommendations | `recommend-friend`: the toggle switches between the reference catalog and a ranking where your own collection is **boosted** (never the only source, §3.4). Marketed gender is a soft signal only. Descriptions that mix contexts get a split suggestion (the "Samantha" example is a must-pass test). Share card = an image of the card shared through the native share sheet. | Depends on a broad reference catalog from Phase 2 |
| **5. Learning & polish** | Wear-tracking feedback loop, saved friend profiles, voice and tray refinement | Recommendations measurably improve from usage history | Selection history feeds the ranking prompt. Compared against the Phase 3 evaluation set. | — |

**Cold-start suggestion (§7 #6), for Phase 3:** new users could start with the friend recommender, which works from the reference catalog without a collection. Phase 1 already makes bulk adding fast: after saving one bottle you return to search with your query kept, so you can add the next one straight away.

## 4. Spec open items: proposed handling

| # | Item | Proposal |
|---|---|---|
| 1 | Reference data source | Phase 1 uses only the seed catalog. Before Phase 2, contact Fragrantica (or a comparable provider) about licensing and price out at least one licensed alternative. If neither works, the fallback is a seed catalog that grows from users' custom entries. |
| 2 | Bottle recognition accuracy | Before building the Phase 2 UI, run a ~1-day test: 50 real photos from your own collection → Claude label reading + catalog match. Measure how often the right answer is first, and how often it is in the top 3. Make the go/no-go call on Path B as a primary capture path from that number. |
| 3 | Reference image corpus | Avoid needing a labeled image set at first by matching on the label text Claude reads, not on the bottle's appearance. Matching on silhouette, cap and color comes later, if the test shows label text isn't enough. |
| 4 | Platform | Closed in the spec. This plan proposes **Expo / React Native**. |
| 5 | Recommendation evaluation | Put 20–30 fixed scenario/collection pairs in `evals/`, each scored 1–5 by you. Run them on every change to the prompt or model. |
| 6 | Cold start | See above. |
