import type {
  CollectionEntry,
  CollectionItem,
  CollectionItemPatch,
  CustomFragranceInput,
  Fragrance,
  FragranceGroup,
  NewCollectionItem,
} from '@/domain/types';

export interface CatalogRepository {
  /** Substring match on house + name, grouped by concentration variants. `[]` for a blank query. */
  search(query: string): Promise<FragranceGroup[]>;
  getById(id: string): Promise<Fragrance | null>;
  /** Creates a fragrance the user owns (`isCustom: true`). Rejects with ValidationError on bad input. */
  createCustom(input: CustomFragranceInput): Promise<Fragrance>;
}

export interface CollectionRepository {
  /** Newest bottle first. */
  list(): Promise<CollectionEntry[]>;
  get(itemId: string): Promise<CollectionEntry | null>;
  /**
   * Idempotent on `clientRequestId`: repeating a request returns the existing item unchanged.
   * Rejects on invalid input or a fragrance that is not in the catalog.
   */
  add(input: NewCollectionItem): Promise<CollectionItem>;
  /** Rejects on an invalid patch or an unknown item. */
  update(itemId: string, patch: CollectionItemPatch): Promise<CollectionItem>;
  /** Resolves without error when the item does not exist. */
  remove(itemId: string): Promise<void>;
}

export interface Repositories {
  catalog: CatalogRepository;
  collection: CollectionRepository;
}
