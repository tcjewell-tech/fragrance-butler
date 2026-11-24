import { z } from 'zod';
import { collectionItemSchema, fragranceSchema } from '@/domain/backup';
import type { CollectionItem, Fragrance } from '@/domain/types';

/** Everything the on-device repositories keep between launches. */
export interface PersistedState {
  version: 1;
  customFragrances: Fragrance[];
  items: CollectionItem[];
  /** `clientRequestId` to item id, so a retried add stays idempotent after a restart. */
  requestIds: Record<string, string>;
  /** When a bottle was last edited, worn or deleted (ISO time). Absent until the first such change. */
  lastModifiedAt?: string;
}

export const persistedStateSchema = z.object({
  version: z.literal(1),
  customFragrances: z.array(fragranceSchema),
  items: z.array(collectionItemSchema),
  requestIds: z.record(z.string(), z.string()),
  // Optional, so state saved before it existed still loads.
  lastModifiedAt: z.string().optional(),
}) satisfies z.ZodType<PersistedState>;

export function emptyState(): PersistedState {
  return { version: 1, customFragrances: [], items: [], requestIds: {} };
}
