import { buildBackup, parseBackup, planRestore } from '@/domain/backup';
import type { KeyValueStorage, LocalRepositories } from './local';

export const LAST_BACKUP_KEY = 'fragrance-butler:last-backup';
export const BACKUP_REMINDER_THRESHOLD = 3;
export const BACKUP_FILENAME = 'fragrance-butler-backup.json';

/** The phone's file and share I/O, injectable so the backup logic is testable. */
export interface BackupDevice {
  /** Writes a file to the cache directory and returns its URI. */
  writeFile(name: string, text: string): Promise<string>;
  /** Opens the share sheet. Resolves false when sharing could not start. */
  share(uri: string): Promise<boolean>;
  /** Lets the user pick a file. Resolves null on cancel, otherwise the file's text. */
  pickFile(): Promise<string | null>;
}

export interface RestoreSummary {
  added: number;
  alreadyPresent: number;
  skipped: number;
}

export interface BackupApi {
  /** Writes and shares a backup. True when the share sheet opened; only then is the backup time stamped. */
  backUp(): Promise<boolean>;
  /** Merges a picked backup into the collection. Null when the user cancelled. Rejects with BackupError on a bad file. */
  restore(): Promise<RestoreSummary | null>;
  /**
   * Changes since the last backup: each bottle created since then (all of them if there has never been one),
   * plus one if any bottle was edited, worn or deleted since then.
   */
  unbackedCount(): Promise<number>;
}

export function createBackupApi({
  repositories,
  storage,
  device,
  now = () => new Date(),
}: {
  repositories: LocalRepositories;
  storage: KeyValueStorage;
  device: BackupDevice;
  now?: () => Date;
}): BackupApi {
  return {
    async backUp() {
      const backup = buildBackup(await repositories.collection.list(), now());
      const uri = await device.writeFile(BACKUP_FILENAME, JSON.stringify(backup, null, 2));
      if (!(await device.share(uri))) return false;
      // The time of the snapshot, so bottles added while the share sheet was open still count as unbacked.
      await storage.setItem(LAST_BACKUP_KEY, backup.exportedAt);
      return true;
    },

    async restore() {
      const text = await device.pickFile();
      if (text === null) return null;
      const backup = parseBackup(text);
      const state = repositories.snapshot();
      // Resolve through the catalog so the check holds for whatever catalog the repositories were seeded with.
      const fragranceIds = new Set<string>();
      for (const id of new Set(backup.items.map((i) => i.fragranceId))) {
        if (await repositories.catalog.getById(id)) fragranceIds.add(id);
      }
      const plan = planRestore(backup, { fragranceIds, itemIds: new Set(state.items.map((i) => i.id)) });
      if (plan.addItems.length > 0 || plan.addFragrances.length > 0) await repositories.applyRestore(plan);
      return { added: plan.addItems.length, alreadyPresent: plan.alreadyPresent, skipped: plan.skipped };
    },

    async unbackedCount() {
      const last = await storage.getItem(LAST_BACKUP_KEY);
      const { items, lastModifiedAt } = repositories.snapshot();
      const created = last === null ? items.length : items.filter((i) => i.createdAt > last).length;
      // shortcut: one timestamp covers all edits and deletions, so together they count as one change; keep a count if the reminder needs more.
      const modified = lastModifiedAt !== undefined && (last === null || lastModifiedAt > last) ? 1 : 0;
      return created + modified;
    },
  };
}
