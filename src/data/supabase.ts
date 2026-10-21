import type { SupabaseClient } from '@supabase/supabase-js';
import { groupVariants, normalizeForSearch } from '@/domain/search';
import type {
  CaptureMethod,
  CollectionEntry,
  CollectionItem,
  CollectionItemPatch,
  Concentration,
  Fragrance,
  MarketedGender,
} from '@/domain/types';
import {
  parseCollectionItemPatch,
  parseCustomFragrance,
  parseNewCollectionItem,
} from '@/domain/validation';
import { RepositoryError, toRepositoryError } from './errors';
import type { CatalogRepository, CollectionRepository, Repositories } from './repositories';

export { RepositoryError } from './errors';
export type { RepositoryErrorKind } from './errors';

/** Row shapes of the `fragrances` and `collection_items` tables (see supabase/migrations). */
export interface FragranceRow {
  id: string;
  house: string;
  name: string;
  concentration: string;
  note_pyramid: { top?: unknown; heart?: unknown; base?: unknown } | null;
  olfactory_family: string | null;
  longevity: number | null;
  projection: number | null;
  season_affinity: string[] | null;
  time_affinity: string[] | null;
  marketed_gender: string | null;
  release_year: number | null;
  reference_images: string[] | null;
  created_by: string | null;
  created_at?: string;
}

export interface CollectionItemRow {
  id: string;
  user_id: string;
  fragrance_id: string;
  bottle_size_ml: number;
  concentration: string;
  acquisition_date: string | null;
  capture_method: string;
  user_notes: string | null;
  favorite_flag: boolean;
  wear_count: number;
  created_at: string;
}

type CollectionEntryRow = CollectionItemRow & { fragrances: FragranceRow | null };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function rowToFragrance(row: FragranceRow): Fragrance {
  return {
    id: row.id,
    house: row.house,
    name: row.name,
    concentration: row.concentration as Concentration,
    notePyramid: {
      top: strings(row.note_pyramid?.top),
      heart: strings(row.note_pyramid?.heart),
      base: strings(row.note_pyramid?.base),
    },
    olfactoryFamily: row.olfactory_family ?? null,
    longevity: row.longevity ?? null,
    projection: row.projection ?? null,
    seasonAffinity: strings(row.season_affinity),
    timeAffinity: strings(row.time_affinity),
    marketedGender: (row.marketed_gender as MarketedGender | null) ?? null,
    releaseYear: row.release_year ?? null,
    referenceImages: strings(row.reference_images),
    isCustom: row.created_by != null,
  };
}

/**
 * Postgres sends microsecond timestamps with an offset. Normalise to millisecond ISO-8601 UTC so the
 * strings sort lexicographically (sortCollection compares them). The fraction is cut to 3 digits
 * first because not every JS engine parses longer ones.
 */
function toIsoUtc(timestamp: string): string {
  const ms = Date.parse(timestamp.replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(ms)) throw new Error(`Unparseable timestamp: ${timestamp}`);
  return new Date(ms).toISOString();
}

export function rowToCollectionItem(row: CollectionItemRow): CollectionItem {
  return {
    id: row.id,
    userId: row.user_id,
    fragranceId: row.fragrance_id,
    bottleSizeMl: row.bottle_size_ml,
    concentration: row.concentration as Concentration,
    acquisitionDate: row.acquisition_date ?? null,
    captureMethod: row.capture_method as CaptureMethod,
    userNotes: row.user_notes ?? null,
    favorite: row.favorite_flag,
    wearCount: row.wear_count,
    createdAt: toIsoUtc(row.created_at),
  };
}

const SEARCH_LIMIT = 50;
const ENTRY_COLUMNS = '*, fragrances(*)';

interface Result<T> {
  data: T | null;
  error: unknown;
  status?: number;
}

/** Awaits a query and returns its data, throwing a RepositoryError for any failure (including a thrown fetch error). */
async function run<T>(query: PromiseLike<Result<T>>): Promise<T | null> {
  let result: Result<T>;
  try {
    result = await query;
  } catch (err) {
    throw toRepositoryError(err);
  }
  if (result.error) throw toRepositoryError(result.error, result.status);
  return result.data;
}

function toEntry(row: CollectionEntryRow): CollectionEntry {
  if (!row.fragrances) {
    throw new RepositoryError('unknown', `Fragrance ${row.fragrance_id} is missing for item ${row.id}`);
  }
  return { item: rowToCollectionItem(row), fragrance: rowToFragrance(row.fragrances) };
}

async function currentUserId(client: SupabaseClient): Promise<string> {
  let result;
  try {
    result = await client.auth.getSession();
  } catch (err) {
    throw toRepositoryError(err);
  }
  if (result.error) throw toRepositoryError(result.error);
  const id = result.data.session?.user.id;
  if (!id) throw new RepositoryError('auth', 'Not signed in');
  return id;
}

const PATCH_COLUMNS = {
  bottleSizeMl: 'bottle_size_ml',
  acquisitionDate: 'acquisition_date',
  userNotes: 'user_notes',
  favorite: 'favorite_flag',
} as const satisfies Record<keyof CollectionItemPatch, string>;

/** Repositories backed by Supabase. The client must be signed in; RLS scopes every row to the caller. */
export function createSupabaseRepositories(client: SupabaseClient): Repositories {
  const catalog: CatalogRepository = {
    async search(query) {
      if (normalizeForSearch(query) === '') return [];
      const rows = await run<FragranceRow[]>(
        client.rpc('search_fragrances', { q: query, max_results: SEARCH_LIMIT }) as PromiseLike<Result<FragranceRow[]>>,
      );
      return groupVariants((rows ?? []).map(rowToFragrance));
    },

    async getById(id) {
      const row = await run<FragranceRow>(
        client.from('fragrances').select('*').eq('id', id).maybeSingle() as PromiseLike<Result<FragranceRow>>,
      );
      return row ? rowToFragrance(row) : null;
    },

    async createCustom(rawInput) {
      const input = parseCustomFragrance(rawInput);
      const userId = await currentUserId(client);
      const row = await run<FragranceRow>(
        client
          .from('fragrances')
          .insert({
            house: input.house,
            name: input.name,
            concentration: input.concentration,
            release_year: input.releaseYear ?? null,
            created_by: userId,
          })
          .select()
          .single() as PromiseLike<Result<FragranceRow>>,
      );
      if (!row) throw new RepositoryError('unknown', 'Custom fragrance was not returned after insert');
      return rowToFragrance(row);
    },
  };

  const selectItemByRequestId = (clientRequestId: string) =>
    run<CollectionItemRow>(
      client
        .from('collection_items')
        .select('*')
        .eq('client_request_id', clientRequestId)
        .maybeSingle() as PromiseLike<Result<CollectionItemRow>>,
    );

  const collection: CollectionRepository = {
    async list() {
      const rows = await run<CollectionEntryRow[]>(
        client
          .from('collection_items')
          .select(ENTRY_COLUMNS)
          .order('created_at', { ascending: false }) as unknown as PromiseLike<Result<CollectionEntryRow[]>>,
      );
      return (rows ?? []).map(toEntry);
    },

    async get(itemId) {
      const row = await run<CollectionEntryRow>(
        client
          .from('collection_items')
          .select(ENTRY_COLUMNS)
          .eq('id', itemId)
          .maybeSingle() as unknown as PromiseLike<Result<CollectionEntryRow>>,
      );
      return row ? toEntry(row) : null;
    },

    async add(rawInput) {
      const input = parseNewCollectionItem(rawInput);
      // ON CONFLICT DO NOTHING keeps this race-safe: concurrent or repeated requests with the same
      // client_request_id insert once, and every caller then reads that one row. user_id is left to
      // the column default (auth.uid()).
      await run(
        client.from('collection_items').upsert(
          {
            client_request_id: input.clientRequestId,
            fragrance_id: input.fragranceId,
            bottle_size_ml: input.bottleSizeMl,
            concentration: input.concentration,
            capture_method: input.captureMethod,
            acquisition_date: input.acquisitionDate ?? null,
            user_notes: input.userNotes ?? null,
          },
          { onConflict: 'client_request_id', ignoreDuplicates: true },
        ) as unknown as PromiseLike<Result<unknown>>,
      );
      const row = await selectItemByRequestId(input.clientRequestId);
      if (!row) throw new RepositoryError('unknown', 'The bottle could not be read back after adding it');
      return rowToCollectionItem(row);
    },

    async update(itemId, rawPatch) {
      const patch = parseCollectionItemPatch(rawPatch);
      const columns: Record<string, unknown> = {};
      for (const key of Object.keys(patch) as (keyof CollectionItemPatch)[]) {
        columns[PATCH_COLUMNS[key]] = patch[key];
      }
      if (Object.keys(columns).length === 0) {
        const existing = await collection.get(itemId);
        if (!existing) throw new RepositoryError('unknown', `Unknown collection item ${itemId}`);
        return existing.item;
      }
      const row = await run<CollectionItemRow>(
        client
          .from('collection_items')
          .update(columns)
          .eq('id', itemId)
          .select()
          .maybeSingle() as PromiseLike<Result<CollectionItemRow>>,
      );
      if (!row) throw new RepositoryError('unknown', `Unknown collection item ${itemId}`);
      return rowToCollectionItem(row);
    },

    async remove(itemId) {
      await run(client.from('collection_items').delete().eq('id', itemId) as unknown as PromiseLike<Result<unknown>>);
    },
  };

  return { catalog, collection };
}
