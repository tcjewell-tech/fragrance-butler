import { planRestore, type Backup } from '@/domain/backup';
import type { Fragrance } from '@/domain/types';
import { bundledCatalog } from './bundledCatalog';
import { RepositoryError } from './errors';
import { createMemoryRepositories, type MemoryRepositories } from './memory';
import { persistedStateSchema, type PersistedState } from './persistedState';

/** The slice of AsyncStorage the local repositories use. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const STATE_KEY = 'fragrance-butler:v1';

export type LocalRepositories = MemoryRepositories;

async function load(storage: KeyValueStorage): Promise<PersistedState | undefined> {
  let text: string | null;
  try {
    text = await storage.getItem(STATE_KEY);
  } catch (cause) {
    throw new RepositoryError('unknown', 'Could not read the collection', { cause });
  }
  if (text === null) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new RepositoryError('unknown', 'The stored collection is unreadable', { cause });
  }
  const result = persistedStateSchema.safeParse(json);
  if (!result.success) {
    throw new RepositoryError('unknown', 'The stored collection is unreadable', { cause: result.error });
  }
  return result.data;
}

/**
 * Repositories kept on the phone under one storage key. A stored value that cannot be read rejects
 * the load, and nothing is written, so the data is never silently replaced.
 */
/**
 * Replaces the stored collection with a backup's bottles: the way out when the stored value cannot be read.
 * It overwrites whatever is under STATE_KEY, so call it only with a backup the user picked and parseBackup accepted.
 */
export async function replaceWithBackup(
  storage: KeyValueStorage,
  backup: Backup,
  seed: Fragrance[] = bundledCatalog(),
): Promise<LocalRepositories> {
  const fresh = createMemoryRepositories(seed);
  await fresh.applyRestore(planRestore(backup, { fragranceIds: new Set(seed.map((f) => f.id)), itemIds: new Set() }));
  await storage.setItem(STATE_KEY, JSON.stringify(fresh.snapshot()));
  return createLocalRepositories(storage, seed);
}

export async function createLocalRepositories(
  storage: KeyValueStorage,
  seed: Fragrance[] = bundledCatalog(),
): Promise<LocalRepositories> {
  const initial = await load(storage);
  return createMemoryRepositories(seed, {
    initial,
    onChange: (state) => storage.setItem(STATE_KEY, JSON.stringify(state)),
  });
}
