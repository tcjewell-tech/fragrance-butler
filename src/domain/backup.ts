import { z } from 'zod';
import { CONCENTRATIONS, type CollectionEntry, type CollectionItem, type Fragrance } from './types';

export const BACKUP_FORMAT = 'fragrance-butler-backup';
export const BACKUP_VERSION = 1;

/** A backup file: the user's bottles and the custom fragrances they use. Catalog fragrances are not stored. */
export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  items: CollectionItem[];
  customFragrances: Fragrance[];
}

export type BackupErrorKind = 'not-json' | 'wrong-format' | 'too-new' | 'invalid';

/** Why a file could not be read as a backup. `kind` picks the message shown to the user. */
export class BackupError extends Error {
  readonly kind: BackupErrorKind;

  constructor(kind: BackupErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BackupError';
    this.kind = kind;
  }
}

/** What a restore adds to the phone, and what it leaves out. Built by `planRestore`. */
export interface RestorePlan {
  addFragrances: Fragrance[];
  addItems: CollectionItem[];
  alreadyPresent: number;
  skipped: number;
}

const concentration = z.enum(CONCENTRATIONS);
const rating = z.number().int().min(1).max(5).nullable();

/** A stored fragrance, as kept on the phone and in backups. */
export const fragranceSchema = z.object({
  id: z.string().min(1),
  house: z.string().min(1),
  name: z.string().min(1),
  concentration,
  notePyramid: z.object({ top: z.array(z.string()), heart: z.array(z.string()), base: z.array(z.string()) }),
  olfactoryFamily: z.string().nullable(),
  longevity: rating,
  projection: rating,
  seasonAffinity: z.array(z.string()),
  timeAffinity: z.array(z.string()),
  marketedGender: z.enum(['feminine', 'masculine', 'unisex']).nullable(),
  releaseYear: z.number().int().nullable(),
  referenceImages: z.array(z.string()),
  isCustom: z.boolean(),
}) satisfies z.ZodType<Fragrance>;

/** A stored collection item, as kept on the phone and in backups. */
export const collectionItemSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  fragranceId: z.string().min(1),
  bottleSizeMl: z.number().int().min(1).max(1000),
  concentration,
  acquisitionDate: z.string().nullable(),
  captureMethod: z.enum(['barcode', 'image', 'manual']),
  userNotes: z.string().nullable(),
  favorite: z.boolean(),
  wearCount: z.number().int().min(0),
  createdAt: z.string().min(1),
}) satisfies z.ZodType<CollectionItem>;

// Checked first, so a newer file reports too-new rather than whatever its new fields break.
const headerSchema = z.object({ format: z.literal(BACKUP_FORMAT), version: z.number() });

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().min(1),
  items: z.array(collectionItemSchema),
  customFragrances: z.array(fragranceSchema),
}) satisfies z.ZodType<Backup>;

/** The collection's items plus the custom fragrances they use. */
export function buildBackup(entries: CollectionEntry[], now: Date): Backup {
  const customs = new Map<string, Fragrance>();
  for (const { fragrance } of entries) {
    if (fragrance.isCustom) customs.set(fragrance.id, fragrance);
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    items: entries.map((e) => e.item),
    customFragrances: [...customs.values()],
  };
}

/** Parses and validates a backup file's text. Throws BackupError. */
export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new BackupError('not-json', 'Not a JSON file', { cause });
  }
  const header = headerSchema.safeParse(json);
  if (!header.success) {
    const format = (json as { format?: unknown } | null)?.format;
    if (format !== BACKUP_FORMAT) throw new BackupError('wrong-format', 'Not a Fragrance Butler backup');
    throw new BackupError('invalid', 'The backup version is missing or malformed', { cause: header.error });
  }
  if (header.data.version > BACKUP_VERSION) {
    throw new BackupError('too-new', `Backup version ${header.data.version} is newer than this app understands`);
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) throw new BackupError('invalid', 'The backup is damaged', { cause: result.error });
  return result.data;
}

/**
 * The merge: adds what the phone lacks and never overwrites. An item already on the phone (or earlier
 * in the same file) is counted as present; one whose fragrance cannot be found is skipped and counted.
 * `fragranceIds` holds the bundled catalog's ids plus the phone's custom ids.
 */
export function planRestore(
  backup: Backup,
  current: { fragranceIds: ReadonlySet<string>; itemIds: ReadonlySet<string> },
): RestorePlan {
  const backupCustoms = new Map(backup.customFragrances.map((f) => [f.id, f]));
  const seenItems = new Set(current.itemIds);
  const addFragrances = new Map<string, Fragrance>();
  const addItems: CollectionItem[] = [];
  let alreadyPresent = 0;
  let skipped = 0;

  for (const item of backup.items) {
    if (seenItems.has(item.id)) {
      alreadyPresent++;
      continue;
    }
    const custom = backupCustoms.get(item.fragranceId);
    if (!current.fragranceIds.has(item.fragranceId) && !custom) {
      skipped++;
      continue;
    }
    if (custom && !current.fragranceIds.has(custom.id)) addFragrances.set(custom.id, custom);
    seenItems.add(item.id);
    addItems.push(item);
  }
  return { addFragrances: [...addFragrances.values()], addItems, alreadyPresent, skipped };
}
