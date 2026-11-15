import { groupVariants, normalizeForSearch } from '@/domain/search';
import type { CollectionEntry, CollectionItem, CollectionItemPatch, Fragrance } from '@/domain/types';
import {
  parseCollectionItemPatch,
  parseCustomFragrance,
  parseNewCollectionItem,
} from '@/domain/validation';
import { parseOccasion, parseRecommendation } from '@/domain/recommendation';
import type { RestorePlan } from '@/domain/backup';
import { newId } from '@/lib/uuid';
import { RepositoryError } from './errors';
import type { PersistedState } from './persistedState';
import type { CatalogRepository, CollectionRepository, RecommendationRepository, Repositories } from './repositories';

const LOCAL_USER_ID = 'local-user';

const copyFragrance = (f: Fragrance): Fragrance => ({
  ...f,
  notePyramid: { top: [...f.notePyramid.top], heart: [...f.notePyramid.heart], base: [...f.notePyramid.base] },
  seasonAffinity: [...f.seasonAffinity],
  timeAffinity: [...f.timeAffinity],
  referenceImages: [...f.referenceImages],
});

const copyItem = (i: CollectionItem): CollectionItem => ({ ...i });

export type MemoryRepositories = Repositories & {
  /** The state worth keeping: custom fragrances, items and remembered request ids. */
  snapshot(): PersistedState;
  /** Adds a restore plan's fragrances and items (id, createdAt and wearCount kept) as one change. */
  applyRestore(plan: RestorePlan): Promise<void>;
};

export interface MemoryRepositoryOptions {
  initial?: PersistedState;
  /** Awaited after every change. If it rejects, the change is undone and the call rejects. */
  onChange?: (state: PersistedState) => void | Promise<void>;
}

/**
 * In-memory repositories for tests, dev and (with `onChange`) on-device storage. They mirror the
 * database's behaviour (validation, idempotent add, unknown-id handling) so the shared contract
 * suite holds for both. Search is substring-only; the database additionally does fuzzy matching.
 */
export function createMemoryRepositories(
  seed: Fragrance[] = [],
  { initial, onChange }: MemoryRepositoryOptions = {},
): MemoryRepositories {
  const fragrances = new Map<string, Fragrance>(seed.map((f) => [f.id, copyFragrance(f)]));
  const customIds = new Set<string>();
  const items = new Map<string, CollectionItem>();
  const itemIdByRequestId = new Map<string, string>(Object.entries(initial?.requestIds ?? {}));
  for (const f of initial?.customFragrances ?? []) {
    fragrances.set(f.id, copyFragrance(f));
    customIds.add(f.id);
  }
  for (const i of initial?.items ?? []) items.set(i.id, copyItem(i));
  let lastCreatedMs = Math.max(0, ...[...items.values()].map((i) => Date.parse(i.createdAt) || 0));

  // Strictly increasing so bottles added within one millisecond still sort deterministically.
  const nextTimestamp = (): string => {
    lastCreatedMs = Math.max(Date.now(), lastCreatedMs + 1);
    return new Date(lastCreatedMs).toISOString();
  };

  const snapshot = (): PersistedState => ({
    version: 1,
    customFragrances: [...customIds].map((id) => copyFragrance(fragrances.get(id)!)),
    items: [...items.values()].map(copyItem),
    requestIds: Object.fromEntries(itemIdByRequestId),
  });

  // Changes run one at a time, so saves land in call order.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const refill = <K, V>(target: Map<K, V>, from: Map<K, V>) => {
    target.clear();
    from.forEach((v, k) => target.set(k, v));
  };

  // Applies a change, then saves it; a failed save puts the previous state back.
  const commit = async <T>(change: () => T): Promise<T> => {
    const before = {
      fragrances: new Map(fragrances),
      customIds: new Set(customIds),
      items: new Map(items),
      requestIds: new Map(itemIdByRequestId),
      lastCreatedMs,
    };
    const result = change();
    if (!onChange) return result;
    try {
      await onChange(snapshot());
    } catch (cause) {
      refill(fragrances, before.fragrances);
      refill(items, before.items);
      refill(itemIdByRequestId, before.requestIds);
      customIds.clear();
      before.customIds.forEach((id) => customIds.add(id));
      lastCreatedMs = before.lastCreatedMs;
      throw new RepositoryError('unknown', 'Could not save the collection', { cause });
    }
    return result;
  };

  const catalog: CatalogRepository = {
    async search(query) {
      const q = normalizeForSearch(query);
      if (q === '') return [];
      const matches = [...fragrances.values()].filter((f) =>
        normalizeForSearch(`${f.house} ${f.name}`).includes(q),
      );
      return groupVariants(matches.map(copyFragrance));
    },

    async getById(id) {
      const f = fragrances.get(id);
      return f ? copyFragrance(f) : null;
    },

    createCustom: (input) =>
      serial(async () => {
        const parsed = parseCustomFragrance(input);
        const fragrance: Fragrance = {
          id: newId(),
          house: parsed.house,
          name: parsed.name,
          concentration: parsed.concentration,
          notePyramid: { top: [], heart: [], base: [] },
          olfactoryFamily: null,
          longevity: null,
          projection: null,
          seasonAffinity: [],
          timeAffinity: [],
          marketedGender: null,
          releaseYear: parsed.releaseYear ?? null,
          referenceImages: [],
          isCustom: true,
        };
        return commit(() => {
          fragrances.set(fragrance.id, fragrance);
          customIds.add(fragrance.id);
          return copyFragrance(fragrance);
        });
      }),
  };

  const toEntry = (item: CollectionItem): CollectionEntry => {
    const fragrance = fragrances.get(item.fragranceId);
    if (!fragrance) throw new Error(`Fragrance ${item.fragranceId} missing for item ${item.id}`);
    return { item: copyItem(item), fragrance: copyFragrance(fragrance) };
  };

  const collection: CollectionRepository = {
    async list() {
      return [...items.values()]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .map(toEntry);
    },

    async get(itemId) {
      const item = items.get(itemId);
      return item ? toEntry(item) : null;
    },

    add: (rawInput) =>
      serial(async () => {
        const input = parseNewCollectionItem(rawInput);
        const existingId = itemIdByRequestId.get(input.clientRequestId);
        const existing = existingId ? items.get(existingId) : undefined;
        if (existing) return copyItem(existing);
        if (!fragrances.has(input.fragranceId)) {
          throw new Error(`Unknown fragrance ${input.fragranceId}`);
        }
        return commit(() => {
          const item: CollectionItem = {
            id: newId(),
            userId: LOCAL_USER_ID,
            fragranceId: input.fragranceId,
            bottleSizeMl: input.bottleSizeMl,
            concentration: input.concentration,
            acquisitionDate: input.acquisitionDate ?? null,
            captureMethod: input.captureMethod,
            userNotes: input.userNotes ?? null,
            favorite: false,
            wearCount: 0,
            createdAt: nextTimestamp(),
          };
          items.set(item.id, item);
          itemIdByRequestId.set(input.clientRequestId, item.id);
          return copyItem(item);
        });
      }),

    update: (itemId, rawPatch: CollectionItemPatch) =>
      serial(async () => {
        const patch = parseCollectionItemPatch(rawPatch);
        const existing = items.get(itemId);
        if (!existing) throw new Error(`Unknown collection item ${itemId}`);
        const updated: CollectionItem = { ...existing, ...patch };
        return commit(() => {
          items.set(itemId, updated);
          return copyItem(updated);
        });
      }),

    remove: (itemId) => serial(() => commit(() => void items.delete(itemId))),
  };

  // Stands in for the `recommend` Edge Function: the first bottles not excluded, in collection order.
  const requests = new Map<string, { itemIds: string[]; selection: string | null }>();

  const recommendations: RecommendationRepository = {
    async recommend(input) {
      const occasion = parseOccasion(input.occasion);
      const excluded = new Set(input.excludeItemIds ?? []);
      const candidates = (await collection.list()).filter((e) => !excluded.has(e.item.id));
      if (candidates.length < 2) throw new Error('Not enough bottles to choose from');
      const requestId = newId();
      const picks = candidates.slice(0, 3).map((e) => ({
        itemId: e.item.id,
        rationale: `A sound choice for ${occasion.toLowerCase()} this ${input.timeOfDay}.`,
      }));
      requests.set(requestId, { itemIds: picks.map((p) => p.itemId), selection: null });
      return parseRecommendation({ requestId, picks });
    },

    recordSelection: (requestId, itemId) =>
      serial(async () => {
        const request = requests.get(requestId);
        if (!request) throw new Error(`Unknown recommendation request ${requestId}`);
        if (!request.itemIds.includes(itemId)) throw new Error(`Item ${itemId} was not offered in ${requestId}`);
        const chosen = items.get(itemId);
        if (!chosen) throw new Error(`Item ${itemId} is no longer in the collection`);
        if (request.selection === itemId) return;
        // As record_recommendation_selection does: the wear moves with a change of mind.
        const previous = request.selection ? items.get(request.selection) : undefined;
        await commit(() => {
          if (previous) items.set(previous.id, { ...previous, wearCount: Math.max(previous.wearCount - 1, 0) });
          items.set(itemId, { ...chosen, wearCount: chosen.wearCount + 1 });
        });
        request.selection = itemId;
      }),
  };

  const applyRestore = (plan: RestorePlan): Promise<void> =>
    serial(() =>
      commit(() => {
        for (const f of plan.addFragrances) {
          if (fragrances.has(f.id)) continue;
          fragrances.set(f.id, copyFragrance(f));
          customIds.add(f.id);
        }
        for (const i of plan.addItems) {
          if (!items.has(i.id)) items.set(i.id, { ...i, userId: LOCAL_USER_ID });
        }
      }),
    );

  return { catalog, collection, recommendations, snapshot, applyRestore };
}
