import { groupVariants, normalizeForSearch } from '@/domain/search';
import type { CollectionEntry, CollectionItem, CollectionItemPatch, Fragrance } from '@/domain/types';
import {
  parseCollectionItemPatch,
  parseCustomFragrance,
  parseNewCollectionItem,
} from '@/domain/validation';
import { parseOccasion, parseRecommendation } from '@/domain/recommendation';
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

/**
 * In-memory repositories for tests and dev. They mirror the database's behaviour (validation,
 * idempotent add, unknown-id handling) so the shared contract suite holds for both. Search is
 * substring-only; the database additionally does fuzzy matching.
 */
export function createMemoryRepositories(seed: Fragrance[] = []): Repositories {
  const fragrances = new Map<string, Fragrance>(seed.map((f) => [f.id, copyFragrance(f)]));
  const items = new Map<string, CollectionItem>();
  const itemIdByRequestId = new Map<string, string>();
  let lastCreatedMs = 0;

  // Strictly increasing so bottles added within one millisecond still sort deterministically.
  const nextTimestamp = (): string => {
    lastCreatedMs = Math.max(Date.now(), lastCreatedMs + 1);
    return new Date(lastCreatedMs).toISOString();
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

    async createCustom(input) {
      const parsed = parseCustomFragrance(input);
      const fragrance: Fragrance = {
        id: crypto.randomUUID(),
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
      fragrances.set(fragrance.id, fragrance);
      return copyFragrance(fragrance);
    },
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

    async add(rawInput) {
      const input = parseNewCollectionItem(rawInput);
      const existingId = itemIdByRequestId.get(input.clientRequestId);
      const existing = existingId ? items.get(existingId) : undefined;
      if (existing) return copyItem(existing);
      if (!fragrances.has(input.fragranceId)) {
        throw new Error(`Unknown fragrance ${input.fragranceId}`);
      }
      const item: CollectionItem = {
        id: crypto.randomUUID(),
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
    },

    async update(itemId, rawPatch: CollectionItemPatch) {
      const patch = parseCollectionItemPatch(rawPatch);
      const existing = items.get(itemId);
      if (!existing) throw new Error(`Unknown collection item ${itemId}`);
      const updated: CollectionItem = { ...existing, ...patch };
      items.set(itemId, updated);
      return copyItem(updated);
    },

    async remove(itemId) {
      items.delete(itemId);
    },
  };

  // Stands in for the `recommend` Edge Function: the first bottles not excluded, in collection order.
  const requests = new Map<string, { itemIds: string[]; selection: string | null }>();

  const recommendations: RecommendationRepository = {
    async recommend(input) {
      const occasion = parseOccasion(input.occasion);
      const excluded = new Set(input.excludeItemIds ?? []);
      const candidates = (await collection.list()).filter((e) => !excluded.has(e.item.id));
      if (candidates.length < 2) throw new Error('Not enough bottles to choose from');
      const requestId = crypto.randomUUID();
      const picks = candidates.slice(0, 3).map((e) => ({
        itemId: e.item.id,
        rationale: `A sound choice for ${occasion.toLowerCase()} this ${input.timeOfDay}.`,
      }));
      requests.set(requestId, { itemIds: picks.map((p) => p.itemId), selection: null });
      return parseRecommendation({ requestId, picks });
    },

    async recordSelection(requestId, itemId) {
      const request = requests.get(requestId);
      if (!request) throw new Error(`Unknown recommendation request ${requestId}`);
      if (!request.itemIds.includes(itemId)) throw new Error(`Item ${itemId} was not offered in ${requestId}`);
      request.selection = itemId;
    },
  };

  return { catalog, collection, recommendations };
}
