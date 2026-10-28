import { z } from 'zod';
import {
  CONCENTRATIONS,
  type CollectionItemPatch,
  type CustomFragranceInput,
  type NewCollectionItem,
} from './types';

export class ValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const concentration = z.enum(CONCENTRATIONS);

const isoDate = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Expected a valid date (YYYY-MM-DD)');

const notes = z
  .string()
  .trim()
  .max(2000)
  .transform((s) => (s === '' ? null : s));

const bottleSizeMl = z.number().int().min(1).max(1000);

const newCollectionItemSchema = z.object({
  clientRequestId: z.uuid(),
  fragranceId: z.string().min(1),
  bottleSizeMl,
  concentration,
  captureMethod: z.enum(['barcode', 'image', 'manual']),
  acquisitionDate: isoDate.nullish().transform((v) => v ?? null),
  userNotes: notes.nullish().transform((v) => v ?? null),
});

// Absent keys stay absent (no transform runs on them); explicit null clears the field.
const collectionItemPatchSchema = z.object({
  bottleSizeMl: bottleSizeMl.optional(),
  acquisitionDate: isoDate.nullable().optional(),
  userNotes: notes.nullable().optional(),
  favorite: z.boolean().optional(),
});

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const customText = z.string().transform(tidy).pipe(z.string().min(1, 'Required').max(120));

function customFragranceSchema() {
  const maxYear = new Date().getFullYear() + 1;
  return z.object({
    house: customText,
    name: customText,
    concentration,
    releaseYear: z
      .number()
      .int()
      .min(1700)
      .max(maxYear)
      .nullish()
      .transform((v) => v ?? null),
  });
}

function parseWith<T>(schema: z.ZodType<T>, x: unknown): T {
  const result = schema.safeParse(x);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new ValidationError(issue.path.join('.') || 'input', issue.message);
}

export function parseNewCollectionItem(x: unknown): NewCollectionItem {
  return parseWith(newCollectionItemSchema, x);
}

export function parseCustomFragrance(x: unknown): CustomFragranceInput {
  return parseWith(customFragranceSchema(), x);
}

/** Validates a partial update. Unknown keys are dropped; keys with undefined values are omitted. */
export function parseCollectionItemPatch(x: unknown): CollectionItemPatch {
  const parsed = parseWith(collectionItemPatchSchema, x);
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)) as CollectionItemPatch;
}

/** True for a whole number of millilitres from 1 to 1000: the same rule `parseNewCollectionItem` applies. */
export function isValidBottleSizeMl(x: unknown): boolean {
  return bottleSizeMl.safeParse(x).success;
}
