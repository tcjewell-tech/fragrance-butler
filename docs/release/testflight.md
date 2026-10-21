# Releasing Fragrance Butler to TestFlight

This guide takes you from a fresh checkout to friends and family testing the app on their iPhones. It assumes no developer background. Allow an afternoon for the first run, plus a day or two of waiting on Apple.

Everything below needs your own Expo and Apple Developer accounts. The repository is already configured (`app.json`, `eas.json`); you only run the commands.

## 0. Before your first build

Three checks, all before the first `eas build`: the bundle identifier, the icon and splash screen, and Expo's own project checks.

### The bundle identifier

`app.json` sets `ios.bundleIdentifier` to `com.tcjewell.fragrancebutler`. This is a placeholder.

- If you want a different one, change it **now**, before the first build.
- It is permanent. Once the app record exists in App Store Connect, the bundle identifier cannot be changed. Changing it later means a new app.

The app name ("Fragrance Butler"), slug (`fragrance-butler`) and URL scheme (`fragrancebutler`) are also set in `app.json`. The app is iPhone-only (`supportsTablet: false`), so Apple will not ask for iPad screenshots. It requests no device permissions (no camera, no location).

### Icon and splash screen (required before Beta App Review)

The repository still carries Expo's template artwork, and Apple can reject a build that ships a placeholder icon. The icon is yours to supply, so do this before you submit for Beta App Review (section 7):

1. **Icon:** provide a **1024×1024 PNG with no transparency** (no alpha channel, no rounded corners; iOS rounds them) and save it over `assets/images/icon.png`. The path is already set in `app.json`.
2. **Splash screen:** the background already uses the app's parchment colour (and the dark ink colour in dark mode). Replace `assets/images/splash-icon.png` with your own mark, or remove the Expo logo by deleting the `image` and `imageWidth` lines from the `expo-splash-screen` entry in `app.json`, which leaves a plain parchment splash.
3. Commit the changes.

### Check the project with Expo's tools

Run these two commands from the repository folder and fix anything they report before the first build:

```bash
npx expo-doctor
npx expo install --check
```

`expo-doctor` looks for configuration problems; `expo install --check` lists dependencies whose versions do not match the installed Expo SDK (and offers to fix them). Both need to reach Expo's servers, which was not possible in the environment where the app was written, so neither has ever been run.

## 1. Prerequisites

You need all of these before building.

### Accounts and tools

- **Apple Developer Program membership** (paid, annual). Enrol at developer.apple.com/programs. Approval can take a day or two.
- **Expo account** (free). Sign up at expo.dev.
- **Node 22 and npm**, and this repository installed with `npm install`.
- **Supabase CLI** (for the database steps). Install from supabase.com/docs/guides/cli.

### Supabase project (the hosted database)

1. Create a project at supabase.com. Note the database password you choose.
2. In the project, go to Project Settings, then API. Keep two values handy: the **Project URL** and the **anon public key**. (The anon key is designed to be public. Never use the `service_role` key in the app.)
3. From the repository folder, link and apply the database schema:

   ```bash
   supabase login
   supabase link --project-ref <your project ref>
   supabase db push
   ```

   `supabase link` asks for the database password. `supabase db push` applies everything in `supabase/migrations` (the tables, security rules, search and account deletion).

### Email sign-in (OTP) in Supabase Auth

The app signs people in with a **6-digit code** emailed to them. Supabase sends a magic link by default, so you must change the email template.

1. In Supabase, go to Authentication, then Providers, and check **Email** is enabled.
2. Go to Authentication, then Email Templates, then **Magic Link** (and also **Confirm signup**, which new users receive on first sign-in).
3. Edit each template so the body shows the code, for example:

   ```html
   <h2>Your Fragrance Butler code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```

   `{{ .Token }}` is the 6-digit code. Do not rely on `{{ .ConfirmationURL }}` alone; the app has no link handling and the sign-in screen expects a code.
4. In the Email provider settings, leave the OTP length at **6** (the default). The app only accepts 6 digits.
5. **Set up your own email sender (required).** Supabase's built-in email sender only delivers to pre-authorised addresses, meaning members of your Supabase organisation or team. Friends, family and Apple's reviewer would receive no sign-in codes at all, so nobody could sign in. Sign up with any transactional email provider (Resend, Postmark and Amazon SES all work) and enter its SMTP details under Authentication, then SMTP settings. Do this before you invite anyone or complete section 6. Afterwards, raise the email rate limit under Authentication, then Rate Limits, because the default is low (a few emails per hour).

### Check the database works (run the integration tests once)

The normal tests use a stand-in for the database. Before your first release, run the database tests once against a real Supabase stack. **Do this before you replace the placeholder catalog** (next section). The tests look up three specific fragrances, which are in the placeholder catalog and probably not in yours:

- Dior Sauvage EDT
- Dior Sauvage EDP
- Hermès Terre d’Hermès EDT

If any of the three is missing, the tests stop at the start with "Seed catalog is missing ...". Pick one way to run them:

- **Local with Docker:** run `supabase start`, then `supabase db reset`. This applies the migrations and loads `supabase/seed.sql` (still the placeholder). `supabase status` prints the local URL and anon key.
- **A second, throwaway hosted project:** create one, then run `supabase link --project-ref <throwaway ref>` and `supabase db push --include-seed` (the `--include-seed` part loads the placeholder catalog). Do not use your real project: the tests empty the test user's collection.

Create a dedicated test user with a password (Supabase Studio, Authentication, Add user, tick "Auto Confirm"), then:

```bash
SUPABASE_TEST_URL=<project URL> \
SUPABASE_TEST_ANON_KEY=<anon key> \
SUPABASE_TEST_EMAIL=<test user email> \
SUPABASE_TEST_PASSWORD=<test user password> \
npm run test:integration
```

All tests should pass.

**While you have the throwaway project, also check account deletion on hosted Supabase.** The automated tests prove it against plain Postgres only, and hosted Supabase protects its `auth` schema in its own ways:

1. Sign in to the app (pointed at the throwaway project) as a **second** test user, not the integration-test user.
2. Add a bottle, so the user has a row to lose.
3. Open Settings, then Delete account, and confirm. (Or call `rpc('delete_my_account')` from a small script signed in as that user.)
4. In Supabase Studio, confirm the user is gone from Authentication, Users, and that their rows are gone from `collection_items` (and any custom fragrances from `fragrances`).

If the call fails with a permission error, do not ship: the fallback is an Edge Function that checks the caller's session and calls `auth.admin.deleteUser(user.id)` with the service-role key (kept as a function secret, never in the app), and the app's Delete account then calls that function instead of `rpc('delete_my_account')`.

If you used a throwaway project, run `supabase link --project-ref <your real ref>` afterwards to point back at the real one.

### The starter catalog (your collection)

The app's search is backed by a catalog table. The repository ships with a **placeholder** of about nine fragrances (`supabase/seed/catalog.csv`, first line `# PLACEHOLDER`). Replace it with your own collection:

1. Open `supabase/seed/catalog.csv` and replace its contents. Remove the `# PLACEHOLDER` line. Keep the header row exactly:

   ```csv
   house,name,concentration,release_year
   Dior,Sauvage,EDP,2018
   ```

   - `concentration` must be one of `EDT`, `EDP`, `Parfum`, `Extrait`, `Other`.
   - `release_year` may be left empty.
   - Put quotes around any value containing a comma, for example `"Maison Margiela, Replica"`.
2. Generate the SQL file from it:

   ```bash
   npm run seed:build
   ```

   This rewrites `supabase/seed.sql` and stops with a clear message if a row is invalid. Commit both files.
3. Load it into the hosted database. Simplest route: open Supabase, go to SQL Editor, paste the whole contents of `supabase/seed.sql`, and click Run. (Alternative from the terminal: `supabase db push --include-seed`.)

**Re-seeding is safe and additive.** The seed file skips any catalog entry that already exists (same house, name and concentration, ignoring capital letters), so running it again never creates duplicates and never touches anyone's collection. To add fragrances later:

1. Add the new rows to `supabase/seed/catalog.csv` (keep the existing rows; there is no need to remove them).
2. Run `npm run seed:build`. It also stops you if two rows are the same fragrance once accents are ignored (for example `Hermes` and `Hermès`).
3. Commit both files, then load `supabase/seed.sql` again exactly as in step 3 above.

Removing a row from the CSV does **not** remove it from the database. Nothing needs to be deleted for normal catalog growth. If you truly must retire an entry, delete it in the SQL Editor (`delete from public.fragrances where created_by is null and house = '...' and name = '...' and concentration = '...';`). The database refuses to delete an entry that anyone has in their collection and shows a foreign key error. That is intended: it protects testers' collections, and nothing is lost when it happens.

## 2. Give the build your Supabase settings

The app reads two public settings, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Your local `.env` file is **not** uploaded to the build server, so they must be set in EAS. Without them the app **crashes on launch** (it cannot create its connection to Supabase).

```bash
npx eas-cli login
npx eas-cli init            # creates the project on your Expo account (first time only)
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "<project URL>" --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>" --visibility plaintext
```

Repeat with `--environment preview` and `--environment development` if you will use those profiles too. Alternatively, set them under `env` inside a profile in `eas.json`. Either way, never commit real values to the repository.

`npx eas-cli init` writes the Expo project ID into `app.json`. Commit that change.

## 3. Build

```bash
npx eas-cli build -p ios --profile production
```

The first run asks you to sign in to your Apple account and lets EAS create the signing certificate and provisioning profile for you. Accept the defaults. The build takes roughly 15 to 30 minutes and runs on Expo's servers. `autoIncrement` raises the build number each time, so you never set it by hand.

Other profiles (optional):

- `preview`: an internal build you install directly on registered test devices.
- `development`: a development client for working on the app with live reload.

## 4. Submit to App Store Connect

```bash
npx eas-cli submit -p ios
```

Pick the build you just made. The first time, EAS asks you to sign in to Apple and create the app record in App Store Connect (name "Fragrance Butler"). Processing then takes 10 to 30 minutes; you receive an email, and the build appears under TestFlight.

When Apple asks the **export compliance** question, the answer is already supplied by the app (`ITSAppUsesNonExemptEncryption: false`): the app uses only standard HTTPS.

## 5. App Privacy, privacy policy and account deletion

Complete these in App Store Connect before Beta App Review. All of it is under App Privacy and App Information.

### App Privacy answers

Answer "Yes, we collect data", then declare these data types:

| Data type | Category | Linked to the user? | Used for tracking? | Purpose |
| --- | --- | --- | --- | --- |
| Email Address | Contact Info | Yes | No | App Functionality |
| Other User Content (the collection and notes) | User Content | Yes | No | App Functionality |
| User ID | Identifiers | Yes | No | App Functionality |

The User ID is the account identifier Supabase assigns to each signed-in user. Nothing else is collected: no analytics, no advertising, no location. The app contains no tracking, so you do not need an App Tracking Transparency prompt. If you later add analytics or a crash reporter, update this table first.

### Privacy policy URL (required)

Apple requires a public privacy policy URL, even for TestFlight external testing. You must host it yourself (a page on a personal site, a public GitHub Pages page or a Notion public page all work). At a minimum it should say:

- **What is stored:** the email address used to sign in, and the collection the user creates (fragrances, bottle sizes, notes, favourites).
- **Where:** in a Supabase-hosted database. Name Supabase as the service provider and state the region of your project.
- **How it is used:** only to run the app. No selling, sharing or advertising use. No tracking.
- **Deletion:** users can delete their account and all their data in the app (Settings, then Delete account). Deletion is permanent.
- **Contact:** an email address people can write to.

Enter the URL in App Store Connect under App Information, and under TestFlight, Test Information.

### Account deletion (guideline 5.1.1(v))

Apps that let people create an account must let them delete it inside the app. Fragrance Butler does: **Settings, then Delete account**, then confirm. It permanently removes the account, the collection and any custom entries. Mention this path in the review notes (below) so the reviewer can find it.

## 6. A demo account for Apple's reviewers

Beta App Review (external TestFlight) and, later, App Review must be able to sign in. Sign-in is by emailed code, and Apple's reviewers will not wait for you to pass on a code. If they cannot get in, the usual result is a rejection under guideline 2.1 ("unable to sign in"). So give them a mailbox they can open themselves.

**Recommended: a dedicated throwaway mailbox, used only for review.**

1. Create a new email account used for nothing else, for example a free Gmail or Outlook address. **Turn off two-step verification (2FA) on it**, otherwise the reviewer cannot get into the mailbox.
2. Check the sender works (section 1, "Set up your own email sender"). Sign in to the app once with this address and add a few bottles, so the reviewer sees a real collection.
   **Then pre-test the mailbox login itself from a different network and device** (for example your phone on mobile data, not your home Wi-Fi), exactly as the reviewer will: open the provider's webmail, sign in with the username and password you will give Apple, and read the newest email. Providers often challenge a login from a new location (a verification code, "was this you?"), which would lock Apple's reviewer out. Complete any such challenge now, and if the provider keeps asking, pick one with lighter sign-in checks.
3. In App Store Connect, enter the mailbox details in the **Sign-in required** username and password fields. These fields exist in both places, so fill them in for each:
   - TestFlight, Test Information (used by Beta App Review).
   - The App Store version page, App Review Information (used by App Review, later).
4. In the notes box next to them, write: "Sign-in is by a 6-digit code. Open the app, enter the email address above and tap Send code. Then open that mailbox (webmail, with the username and password above) and read the newest email from Fragrance Butler. Enter the 6-digit code in the app. Account deletion is at Settings, then Delete account. Contact: your email and phone number."
5. Keep the mailbox alive for the lifetime of the app, because every future App Store review needs it. Do not use it for anything personal.

**Fallback only: relay the code yourself.** Give Apple an address that only you can read and say in the notes that you will supply the code on request. This is unreliable (codes expire, and reviewers rarely wait), so use it only if the shared mailbox is not possible.

**Not available today:** a password sign-in path, which would need a change to the app. A reviewer-only fixed code is a possible future improvement, but Supabase supports fixed test OTPs for phone numbers only, not email, so it would need extra work.

## 7. Add friends and family (external testers) and Beta App Review

External testers can install the app without being on your Apple Developer team.

1. In App Store Connect, open the app, then TestFlight.
2. Wait until the build shows "Ready to Submit" or "Ready to Test" (processing finished).
3. Under External Testing, click **+** next to Groups and create a group, for example "Friends and Family".
4. Add the build to the group. Fill in Test Information first (email, privacy policy URL, demo account from section 6, a short description of what to test).
5. Submit the build for **Beta App Review**. The first build of a version typically takes up to a day. Later builds of the same version are usually approved much faster or automatically.
6. After approval, add testers by email address, or turn on a **public link** for the group and send people the link. Testers install Apple's free TestFlight app from the App Store, then open your invitation.

Builds expire after 90 days in TestFlight; upload a new one before then.

## 8. Troubleshooting

- **The app crashes on launch, or you see "Supabase is not configured":** `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` is missing from the build. Check the EAS environment variables (section 2) were set on the same environment as the profile you built with, then rebuild. It does not wait until sign-in to fail.
- **No sign-in code arrives:** check spam; check Supabase email rate limits; set up your own SMTP provider (section 1).
- **Email contains a link and no code:** the template still lacks `{{ .Token }}` (section 1). Check both Magic Link and Confirm signup.
- **Build fails with a bundle identifier error:** the identifier must be unique across Apple. Choose another in `app.json`.
- **When to go to the App Store proper:** once Beta App Review passes and your friends and family are happy, create the App Store version in App Store Connect, add screenshots (iPhone only), pick the build, and submit for review.

When you have a working build in testers' hands, work through [`docs/phase-1-exit-checklist.md`](../phase-1-exit-checklist.md) on a real iPhone.
