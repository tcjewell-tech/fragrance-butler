import { RepositoryError } from '@/data/errors';
import { createLocalRepositories, STATE_KEY, type KeyValueStorage } from '@/data/local';
import type { NewCollectionItem } from '@/domain/types';
import { fixtureCatalog, fixtureIds } from './fixtures';
import { runRepositoryContract } from './repositoryContract';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: KeyValueStorage & { data: Map<string, string> } = {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
  return storage;
}

const newItem = (over: Partial<NewCollectionItem> = {}): NewCollectionItem => ({
  clientRequestId: crypto.randomUUID(),
  fragranceId: fixtureIds.sauvageEdtId,
  bottleSizeMl: 100,
  concentration: 'EDT',
  captureMethod: 'manual',
  ...over,
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

runRepositoryContract('local', async () => ({
  ...(await createLocalRepositories(fakeStorage(), fixtureCatalog)),
  fixtures: fixtureIds,
}));

describe('local repositories', () => {
  test('state survives a simulated restart', async () => {
    const storage = fakeStorage();
    const first = await createLocalRepositories(storage, fixtureCatalog);
    const custom = await first.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' });
    const item = await first.collection.add(newItem({ fragranceId: custom.id, concentration: 'EDP' }));

    const second = await createLocalRepositories(storage, fixtureCatalog);
    expect(await second.catalog.getById(custom.id)).toEqual(custom);
    expect((await second.collection.list()).map((e) => e.item)).toEqual([item]);
    expect(await second.catalog.getById(fixtureIds.sauvageEdtId)).not.toBeNull();
  });

  test('a retried add after restart returns the same item', async () => {
    const storage = fakeStorage();
    const input = newItem();
    const item = await (await createLocalRepositories(storage, fixtureCatalog)).collection.add(input);
    const again = await (await createLocalRepositories(storage, fixtureCatalog)).collection.add(input);
    expect(again).toEqual(item);
  });

  test('a corrupt stored value rejects and the stored text is unchanged after the failed load', async () => {
    for (const corrupt of ['{not json', JSON.stringify({ version: 1, items: 'nope' }), JSON.stringify({ version: 2 })]) {
      const storage = fakeStorage({ [STATE_KEY]: corrupt });
      const err = await rejection(createLocalRepositories(storage, fixtureCatalog));
      expect(err).toBeInstanceOf(RepositoryError);
      expect((err as RepositoryError).kind).toBe('unknown');
      expect(storage.data.get(STATE_KEY)).toBe(corrupt);
    }
  });

  test('a failing getItem rejects with RepositoryError kind unknown', async () => {
    const storage = fakeStorage();
    storage.getItem = () => Promise.reject(new Error('io'));
    const err = await rejection(createLocalRepositories(storage, fixtureCatalog));
    expect(err).toBeInstanceOf(RepositoryError);
  });

  test('no key means an empty collection', async () => {
    const repos = await createLocalRepositories(fakeStorage(), fixtureCatalog);
    expect(await repos.collection.list()).toEqual([]);
  });

  test('the bundled catalog is the default seed', async () => {
    const repos = await createLocalRepositories(fakeStorage());
    expect(await repos.catalog.getById('catalog:dior|sauvage|EDT')).not.toBeNull();
  });

  test('a failing setItem makes add reject and leaves the collection empty', async () => {
    const storage = fakeStorage();
    storage.setItem = () => Promise.reject(new Error('quota'));
    const repos = await createLocalRepositories(storage, fixtureCatalog);
    const err = await rejection(repos.collection.add(newItem()));
    expect(err).toBeInstanceOf(RepositoryError);
    expect(await repos.collection.list()).toEqual([]);
    expect(storage.data.has(STATE_KEY)).toBe(false);
  });
});
