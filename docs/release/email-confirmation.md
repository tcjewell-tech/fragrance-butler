# Keep "Confirm Email" on in the hosted Supabase project

**Why this matters (security finding F6).** Fragrance Butler signs people in with a 6-digit code. If the hosted Supabase project has **Confirm Email** turned off, a stranger could create an account in advance using someone else's email address and a password of their choosing. When the real owner of that address later signs in with a code, they land in the stranger's account, and the stranger can still get in with the password. With **Confirm Email** on, nobody can use an account until the owner of the email address proves they can read that inbox, which shuts this down.

Supabase turns **Confirm Email** on by default for new hosted projects, so this is most likely already right. It takes a minute to check.

The repository's local setting (`enable_confirmations` in `supabase/config.toml`) is now on as well, so local testing behaves like the hosted project. That file does **not** change the hosted project; only the dashboard steps below do.

## Check it, and turn it on if needed

1. Sign in at supabase.com and open the Fragrance Butler project.
2. In the left sidebar, click **Authentication**.
3. Click **Sign In / Providers**.
4. In the list of providers, click **Email**. Its settings open.
5. Find the **Confirm Email** switch.
   - If it is **on**, you're done. Close the panel without changing anything.
   - If it is **off**, turn it on and click **Save**.

Leave the other Email settings as they are.

## Check sign-in still works

Turning **Confirm Email** on changes which email a brand-new user receives on their first sign-in: Supabase sends the **Confirm signup** email instead of the **Magic Link** one. Both must show the 6-digit code (`{{ .Token }}`), as set up in [`testflight.md`](testflight.md), section "Email sign-in (OTP) in Supabase Auth".

1. In the app, sign in with an email address that has **never** been used with Fragrance Butler (a spare address of your own).
2. The email that arrives should show a 6-digit code. Enter it; you should be signed in.
3. If the email has only a link and no code, edit the **Confirm signup** template (Authentication, then **Email Templates**) to include `{{ .Token }}`, exactly as for **Magic Link**.

You can then delete that test account under Settings, then Delete account in the app.

## Where these names come from

Checked on 17 November 2026 against Supabase's docs page "General configuration" (supabase.com/docs/guides/auth/general-configuration, last updated 19 October 2026), which names the setting **Confirm Email** and says it is in the email provider's settings under **Sign In / Providers**. These steps were written without access to your dashboard, so if a label on screen reads slightly differently (for example "Confirm email" in lower case), it is the same switch.
