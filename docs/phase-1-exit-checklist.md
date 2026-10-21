# Phase 1 exit checklist

**Exit criterion (spec section 8):** a user can build and view a collection entirely by hand.

Phase 1 is done when every row below passes on a **real iPhone** running the TestFlight build. Fill in the Result column (Pass / Fail) and add anything odd you saw in Notes.

- Tester: ____________________
- iPhone model and iOS version: ____________________
- Build number: ____________________
- Date: ____________________

## 1. Build and install

- [ ] **Before the first build:** `npx expo-doctor` and `npx expo install --check` both ran and everything they reported is fixed. (They need Expo's servers and never ran in the build environment.)
- [ ] **Icon and splash:** `assets/images/icon.png` is your own 1024×1024 PNG with no transparency, and the splash image is replaced or the Expo logo removed (see the TestFlight guide, section 0). Required before Beta App Review.
- [ ] `npx eas-cli build -p ios --profile production` finished.
- [ ] `npx eas-cli submit -p ios` finished and the build appears in TestFlight.
- [ ] The build installs from TestFlight and opens.

Steps are in [`docs/release/testflight.md`](release/testflight.md).

## 2. Core flow

| Done | Check | Result | Notes |
| --- | --- | --- | --- |
| [ ] | Sign in: enter your email, receive the 6-digit code, enter it, land on the collection. | | |
| [ ] | Add 5 bottles by search (Add tab, search, pick a result, confirm, save). Each appears in the collection. | | |
| [ ] | Add 1 bottle as a custom entry (a fragrance not in the catalog). It appears in the collection. | | |
| [ ] | Add 1 duplicate of an existing bottle in a **different size**. Both bottles appear in the collection. | | |
| [ ] | Force-quit the app (swipe it away from the app switcher) and reopen it. Still signed in, and all 7 bottles are still there. | | |
| [ ] | Cloud sync: sign in on a **second device or simulator** with the same email. The same 7 bottles appear. | | |
| [ ] | In this order: open the confirm screen and pick a size **while online**. Then turn airplane mode **on**. Then press Save. The calm save error appears and your selection is kept. | | |
| [ ] | Turn airplane mode **off**, then press **Try again** on the error. The save succeeds and the bottle appears. | | |

## 3. Device-only checks

These cannot be verified in the automated tests. Each needs a real iPhone.

- [ ] **Top safe area:** the Add tab's content sits correctly under the status bar (not hidden by the clock or notch/Dynamic Island).
- [ ] **Keyboard:** on a bottle's detail screen, tapping the notes field and typing keeps the field visible; the keyboard does not cover it.
- [ ] **VoiceOver:** with VoiceOver on, saving a bottle speaks "Added to your collection."
- [ ] **Search keeps the query:** after saving a bottle and returning to the Add tab, the search text and results are still there.
- [ ] **Dark mode:** with the iPhone in dark appearance, every screen (sign-in, collection, Add, confirm, custom entry, bottle detail, settings) is readable, with no dark text on dark backgrounds.
- [ ] **Large Dynamic Type:** with text size at the largest accessibility setting, the sign-in buttons remain on screen and reachable (scroll if needed, but nothing is cut off or unreachable).

Notes:

## 4. Account and release housekeeping

- [ ] Settings, Sign out returns to the sign-in screen; signing in again brings the collection back.
- [ ] Settings, Delete account asks for confirmation, then removes the account and returns to sign-in. (Use a throwaway account, not your own collection.)
- [ ] Account deletion verified on **hosted** Supabase (the throwaway project from the TestFlight guide, section 1): a second test user added a bottle, used Settings, Delete account, and the user and their rows are gone in Supabase Studio. If it failed with a permission error, the Edge Function fallback is in place.
- [ ] The reviewer mailbox was signed in to from a different network or device, so the provider's new-location check cannot block Apple's reviewer.
- [ ] App Privacy answers, privacy policy URL and reviewer demo account are filled in App Store Connect (see the TestFlight guide, sections 5 and 6).
- [ ] Beta App Review approved; at least one friend or family member has installed the build from TestFlight.

## Sign-off

- [ ] Every row above passes. Phase 1 is complete.

Overall notes:
