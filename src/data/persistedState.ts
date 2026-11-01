import { z } from 'zod';
import { CONCENTRATIONS, type CollectionItem, type Fragrance } from '@/domain/types';

/** Everything the on-device repositories keep between launches. */
export interface PersistedState {
  version: 1;
  customFragrances: Fragrance[];
  items: CollectionItem[];
  /** `clientRequestId` to item id, so a retried add stays idempotent after a restart. */
  requestIds: Record<string, string>;
}

const concentration = z.enum(CONCENTRATIONS);
const rating = z.number().int().min(1).max(5).nullable();

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

export const persistedStateSchema = z.object({
  version: z.literal(1),
  customFragrances: z.array(fragranceSchema),
  items: z.array(collectionItemSchema),
  requestIds: z.record(z.string(), z.string()),
}) satisfies z.ZodType<PersistedState>;

export function emptyState(): PersistedState {
  return { version: 1, customFragrances: [], items: [], requestIds: {} };
}
