# Local mode (collection kept on the phone)

Local mode runs Fragrance Butler with no backend: no Supabase, no sign-in, nothing to pay for. The collection lives on the phone, and Settings can write a backup file and restore from one.

## It is the default

Local mode is what you get with no settings at all: `npx expo start`, or any EAS build. No `EXPO_PUBLIC_SUPABASE_*` variable is needed, and the app never creates a Supabase client.

The Supabase build (cloud data, email sign-in) is opt-in: set `EXPO_PUBLIC_CLOUD=1` plus the two `EXPO_PUBLIC_SUPABASE_*` values. Its code is unchanged and still tested. Before shipping it, follow [release/email-confirmation.md](release/email-confirmation.md) on the hosted project. (`EXPO_PUBLIC_LOCAL_MODE` from earlier builds is no longer read.)

## Settings: where your collection is kept

Settings opens with **Where your collection is kept**: **On this phone** is selected, and **In my account** is shown but disabled with a note that it is coming in a later update. Nothing is stored for this choice yet.

## Deferred to the cloud-sync branch

- Making **In my account** work: sign-in from Settings (not at launch), then uploading the bottles already on the phone into the account, and keeping both in step.
- The Ask tab and tray (need the `recommend` and `record-selection` Edge Functions).
- Sign out and Delete account, which only exist with an account.
- Security finding F6 (Confirm Email): only applies once a hosted Supabase project exists. Local mode has no accounts, so there is nothing to confirm.

## What it turns off

- **Sign-in.** The app opens straight onto the collection.
- **Sign out and Delete account.** Settings shows a Backup section instead. There is no account to delete; removing the app removes the data.
- **The Ask tab and the tray**, whatever `EXPO_PUBLIC_FEATURE_ASK` says. They need the `recommend` Edge Function.

## Where the data lives

AsyncStorage, under two keys:

- `fragrance-butler:v1`: the custom fragrances, the bottles, the request ids that keep a retried "Add" from adding twice (forgotten when their bottle is removed), and `lastModifiedAt`, when a bottle was last edited, worn or removed (absent until the first such change).
- `fragrance-butler:last-backup`: when the last backup was made (ISO time).

If the stored collection cannot be read, the app says so and leaves it untouched. That screen offers two ways out:

- **Save a copy of the unreadable data** writes the stored text, exactly as it is, to `fragrance-butler-raw-recovery.txt` and opens the share sheet, so it can be rescued by hand.
- **Restore from backup** opens the file picker. Only a file that reads as a valid backup replaces the unreadable collection; then the app opens as usual. Anything else, or a cancelled picker, changes nothing.

## The catalog

The searchable catalog is bundled into the app, generated from `supabase/seed/catalog.csv` by `npm run seed:build` (it writes `src/data/catalogSeed.ts` alongside `supabase/seed.sql`). Edit the CSV, run the command, commit both files and rebuild.

Each catalog entry's id comes from its house, name and concentration, ignoring capital letters and accents: `catalog:dior|sauvage|EDT`. Backups refer to catalog fragrances by this id. So **changing the spelling of a CSV row changes its id**, and a backup made before the change cannot find that fragrance: restoring skips those bottles and says how many. Adding rows is always safe; avoid renaming or removing rows people already own.

## Backup file

Settings, then **Back up collection**, writes `fragrance-butler-backup.json` and opens the share sheet (save it to Files, iCloud Drive, or send it to yourself). An empty collection still produces a valid file.

```json
{
  "format": "fragrance-butler-backup",
  "version": 1,
  "exportedAt": "2026-11-01T12:00:00.000Z",
  "items": [ /* the bottles, exactly as stored */ ],
  "customFragrances": [ /* the custom entries those bottles use */ ]
}
```

Catalog fragrances are not stored in the file; they are found again in the bundled catalog by id. A file with another `format`, a `version` above 1, broken JSON or damaged entries is refused with a plain message, and nothing changes.

## Restoring (merge)

Settings, then **Restore from backup**, opens the file picker. Restoring merges; it never deletes or overwrites:

1. A bottle is added when its id is not already on the phone. One already there is left exactly as the phone has it.
2. Custom fragrances are added when missing; existing ones are untouched.
3. A bottle whose fragrance is in neither the bundled catalog nor the file's custom entries is skipped and counted.
4. Restored bottles keep their id, date added and wear count.
5. Restoring the same file twice changes nothing the second time. A bottle deleted on the phone after the backup comes back; that is the trade-off of merging.

The summary reads, for example, "Added 12 bottles; 3 were already here."

## Backup reminder

The reminder counts changes since the last backup: each bottle added (every bottle, if there has never been a backup), plus one if any bottle was edited, worn or removed. Edits and removals share one timestamp, so together they count as one. Once the count reaches 3, the Collection tab shows "You have N changes not yet backed up." **Back up** opens Settings; **Not now** hides it until the app is next opened.

The share sheet cannot tell whether the file was actually saved, so opening it counts as a backup. Restoring does not count: a freshly restored phone that has never made a backup may show the reminder once. Backing up clears it.
