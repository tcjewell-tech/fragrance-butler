# Releasing Fragrance Butler to TestFlight

This guide takes you from a fresh checkout to friends and family testing the app on their iPhones. It assumes no developer background. Allow an afternoon for the first run, plus a day or two of waiting on Apple.

Everything below needs your own Expo and Apple Developer accounts. The repository is already configured (`app.json`, `eas.json`); you only run the commands.

## 0. Before your first build: check the bundle identifier

`app.json` sets `ios.bundleIdentifier` to `com.tcjewell.fragrancebutler`. This is a placeholder.

- If you want a different one, change it **now**, before the first build.
- It is permanent. Once the app record exists in App Store Connect, the bundle identifier cannot be changed. Changing it later means a new app.

The app name ("Fragrance Butler"), slug (`fragrance-butler`) and URL scheme (`fragrancebutler`) are also set in `app.json`. The app is iPhone-only (`supportsTablet: false`), so Apple will not ask for iPad screenshots. It requests no device permissions (no camera, no location).

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
5. **Email limits.** Supabase's built-in email sender is heavily rate-limited (a few emails per hour) and meant for testing. For friends and family, set up your own SMTP provider under Authentication, then SMTP Settings (Resend, Postmark, SendGrid and similar all work). Do this before inviting testers, or sign-in codes will stop arriving.

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

**Run the seed once.** The catalog table has no duplicate guard, so running it twice doubles every entry. If you did that by mistake and nobody has signed up yet, run `delete from public.fragrances where created_by is null;` in the SQL Editor and seed again. Do not do this once testers have saved bottles, because their collection entries would be removed along with the catalog rows.

### Run the integration tests once against a real database

The normal tests use an in-memory fake. Before your first release, run the contract suite once against real Supabase. Pick one:

- **Local with Docker:** run `supabase start`, then `supabase db reset` (applies migrations and seed). `supabase status` prints the local URL and anon key.
- **A second, throwaway hosted project:** create one, run `supabase link` and `supabase db push` against it. Do not use your real project: the suite empties the test user's collection.

Create a dedicated test user with a password (Supabase Studio, Authentication, Add user, tick "Auto Confirm"), then:

```bash
SUPABASE_TEST_URL=<project URL> \
SUPABASE_TEST_ANON_KEY=<anon key> \
SUPABASE_TEST_EMAIL=<test user email> \
SUPABASE_TEST_PASSWORD=<test user password> \
npm run test:integration
```

All tests should pass. If you are on a different project than before, run `supabase link` again afterwards to point back at the real one.

## 2. Give the build your Supabase settings

The app reads two public settings, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Your local `.env` file is **not** uploaded to the build server, so they must be set in EAS. Without them the build installs but cannot sign in.

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

Answer "Yes, we collect data", then declare exactly two data types:

| Data type | Category | Linked to the user? | Used for tracking? | Purpose |
| --- | --- | --- | --- | --- |
| Email Address | Contact Info | Yes | No | App Functionality |
| Other User Content (the collection and notes) | User Content | Yes | No | App Functionality |

Nothing else is collected: no analytics, no advertising, no location, no device identifiers. The app contains no tracking, so you do not need an App Tracking Transparency prompt. If you later add analytics or a crash reporter, update this table first.

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

Beta App Review (external TestFlight) and, later, App Review must be able to sign in. Sign-in is by emailed code, and Apple cannot read your inbox, so you have to arrange it. Options:

1. **A dedicated reviewer mailbox you control (recommended).** Create a new address such as `fragrancebutler.review@yourdomain.com` (or a free Gmail or iCloud address). Give Apple that address in the review notes and keep the mailbox open on your phone during review, so you can read out the code when Apple asks. Codes expire, so reply promptly.
2. **A password-based demo account.** This would need a password sign-in path added to the app. Do not add one just for review.

Go with option 1. Pre-fill the account with a few bottles by signing in yourself first, so reviewers see a real collection. In App Store Connect, TestFlight, Test Information, fill in:

- **Sign-in required:** yes.
- **Demo account:** the reviewer address. In the notes, write: "Sign-in is by a 6-digit code sent to this address. The developer monitors this mailbox and will provide the code within minutes of a request. Contact: your email and phone number."
- **Notes:** "Account deletion is at Settings, then Delete account."

Keep this mailbox alive for the lifetime of the app, because every future App Store review needs it.

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

- **"Supabase is not configured" or sign-in fails immediately on a built app:** the EAS environment variables (section 2) are missing or were set on a different environment from the profile you built with.
- **No sign-in code arrives:** check spam; check Supabase email rate limits; set up your own SMTP provider (section 1).
- **Email contains a link and no code:** the template still lacks `{{ .Token }}` (section 1). Check both Magic Link and Confirm signup.
- **Build fails with a bundle identifier error:** the identifier must be unique across Apple. Choose another in `app.json`.
- **When to go to the App Store proper:** once Beta App Review passes and your friends and family are happy, create the App Store version in App Store Connect, add screenshots (iPhone only), pick the build, and submit for review.

When you have a working build in testers' hands, work through [`docs/phase-1-exit-checklist.md`](../phase-1-exit-checklist.md) on a real iPhone.
