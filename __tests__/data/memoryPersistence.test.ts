import { RepositoryError } from '@/data/errors';
import { createMemoryRepositories } from '@/data/memory';
import { emptyState, persistedStateSchema, type PersistedState } from '@/data/persistedState';
import type { CollectionItem, Fragrance, NewCollectionItem } from '@/domain/types';
import { fixtureCatalog, fixtureIds } from './fixtures';

const REQ_1 = '00000000-0000-4000-8000-000000000001';
const REQ_A = '00000000-0000-4000-8000-00000000000a';
const REQ_LOST = '00000000-0000-4000-8000-0000000000ff';

const custom: Fragrance = {
  ...fixtureCatalog[0],
  id: 'custom-santal',
  house: 'Le Labo',
  name: 'Santal 33',
  concentration: 'EDP',
  isCustom: true,
};

const storedItem = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  id: 'item-1',
  userId: 'someone-else',
  fragranceId: custom.id,
  bottleSizeMl: 50,
  concentration: 'EDP',
  acquisitionDate: null,
  captureMethod: 'manual',
  userNotes: null,
  favorite: false,
  wearCount: 4,
  createdAt: '2026-01-02T03:04:05.000Z',
  ...over,
});

const newItem = (over: Partial<NewCollectionItem> = {}): NewCollectionItem => ({
  clientRequestId: crypto.randomUUID(),
  fragranceId: fixtureIds.sauvageEdtId,
  bottleSizeMl: 100,
  concentration: 'EDT',
  captureMethod: 'manual',
  ...over,
});

describe('memory repositories with persistence options', () => {
  test('initial state is loaded (custom fragrances, items, request ids)', async () => {
    const initial: PersistedState = {
      version: 1,
      customFragrances: [custom],
      items: [storedItem({ userId: 'local-user' })],
      requestIds: { [REQ_1]: 'item-1' },
    };
    const repos = createMemoryRepositories(fixtureCatalog, { initial });
    expect(await repos.catalog.getById(custom.id)).toEqual(custom);
    const listed = await repos.collection.list();
    expect(listed.map((e) => e.item)).toEqual(initial.items);
    expect(repos.snapshot()).toEqual(initial);
  });

  test('a repeated add with a remembered clientRequestId returns the existing item', async () => {
    const item = storedItem({ userId: 'local-user', fragranceId: fixtureIds.sauvageEdtId, concentration: 'EDT' });
    const repos = createMemoryRepositories(fixtureCatalog, {
      initial: { version: 1, customFragrances: [], items: [item], requestIds: { [REQ_1]: item.id } },
    });
    const again = await repos.collection.add(newItem({ clientRequestId: REQ_1 }));
    expect(again).toEqual(item);
    expect(await repos.collection.list()).toHaveLength(1);
  });

  test('onChange fires once per createCustom, add, update, remove and recordSelection with the new snapshot', async () => {
    const onChange = jest.fn();
    const repos = createMemoryRepositories(fixtureCatalog, { onChange });

    const fragrance = await repos.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(repos.snapshot());
    expect(repos.snapshot().customFragrances).toEqual([fragrance]);

    const a = await repos.collection.add(newItem({ clientRequestId: REQ_A }));
    const b = await repos.collection.add(newItem());
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange.mock.calls[2][0].requestIds[REQ_A]).toBe(a.id);

    await repos.collection.update(a.id, { favorite: true });
    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange.mock.calls[3][0].items.find((i: CollectionItem) => i.id === a.id).favorite).toBe(true);

    const { requestId } = await repos.recommendations.recommend({ occasion: 'Office', timeOfDay: 'morning' });
    expect(onChange).toHaveBeenCalledTimes(4);
    await repos.recommendations.recordSelection(requestId, b.id);
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange.mock.calls[4][0].items.find((i: CollectionItem) => i.id === b.id).wearCount).toBe(1);

    await repos.collection.remove(a.id);
    expect(onChange).toHaveBeenCalledTimes(6);
    expect(onChange.mock.calls[5][0].items.map((i: CollectionItem) => i.id)).toEqual([b.id]);
  });

  test('onChange does not fire for a rejected call (invalid input)', async () => {
    const onChange = jest.fn();
    const repos = createMemoryRepositories(fixtureCatalog, { onChange });
    await expect(repos.collection.add(newItem({ bottleSizeMl: -1 }))).rejects.toThrow();
    await expect(repos.collection.add(newItem({ fragranceId: 'nope' }))).rejects.toThrow();
    await expect(repos.collection.update('nope', { favorite: true })).rejects.toThrow();
    await expect(repos.catalog.createCustom({ house: '', name: 'X', concentration: 'EDP' })).rejects.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('when onChange rejects the mutation is rolled back and the call rejects with RepositoryError kind unknown', async () => {
    const cause = new Error('disk full');
    let fail = false;
    const repos = createMemoryRepositories(fixtureCatalog, {
      onChange: () => (fail ? Promise.reject(cause) : undefined),
    });
    const kept = await repos.collection.add(newItem());
    const before = repos.snapshot();

    fail = true;
    const attempts = [
      repos.collection.add(newItem({ clientRequestId: REQ_LOST })),
      repos.collection.update(kept.id, { favorite: true }),
      repos.collection.remove(kept.id),
      repos.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' }),
    ];
    for (const attempt of attempts) {
      const err = await attempt.then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(RepositoryError);
      expect((err as RepositoryError).kind).toBe('unknown');
      expect((err as RepositoryError).cause).toBe(cause);
    }
    expect(repos.snapshot()).toEqual(before);
    expect(await repos.catalog.search('santal')).toEqual([]);

    // The lost add's request id was rolled back too, so a retry creates the bottle.
    fail = false;
    await repos.collection.add(newItem({ clientRequestId: REQ_LOST }));
    expect(await repos.collection.list()).toHaveLength(2);
  });

  test('two concurrent adds both persist and snapshots arrive in call order', async () => {
    const snapshots: PersistedState[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const repos = createMemoryRepositories(fixtureCatalog, {
      onChange: async (state) => {
        if (snapshots.length === 0) await gate;
        snapshots.push(state);
      },
    });
    const first = repos.collection.add(newItem({ bottleSizeMl: 30 }));
    const second = repos.collection.add(newItem({ bottleSizeMl: 50 }));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(snapshots.map((s) => s.items.map((i) => i.id))).toEqual([[a.id], [a.id, b.id]]);
    expect(repos.snapshot().items.map((i) => i.id)).toEqual([a.id, b.id]);
  });

  test('applyRestore adds fragrances and items with the local user id and keeps id, createdAt and wearCount, then fires onChange once', async () => {
    const onChange = jest.fn();
    const repos = createMemoryRepositories(fixtureCatalog, { onChange });
    const restored = storedItem();
    await repos.applyRestore({ addFragrances: [custom], addItems: [restored], alreadyPresent: 0, skipped: 0 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(repos.snapshot());
    expect(await repos.catalog.getById(custom.id)).toEqual(custom);
    const entry = await repos.collection.get(restored.id);
    expect(entry?.item).toEqual({ ...restored, userId: 'local-user' });
    expect(entry?.fragrance).toEqual(custom);
  });

  test('emptyState has no fragrances, items or request ids', () => {
    expect(emptyState()).toEqual({ version: 1, customFragrances: [], items: [], requestIds: {} });
  });

  test('remove forgets the removed bottle’s request ids and keeps the others', async () => {
    const repos = createMemoryRepositories(fixtureCatalog);
    const a = await repos.collection.add(newItem({ clientRequestId: REQ_A }));
    const b = await repos.collection.add(newItem({ clientRequestId: REQ_1 }));
    await repos.collection.remove(a.id);
    expect(repos.snapshot().requestIds).toEqual({ [REQ_1]: b.id });
  });
});

describe('lastModifiedAt', () => {
  const T0 = Date.parse('2026-11-24T12:00:00.000Z');
  let clock = T0;
  beforeEach(() => {
    clock = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => jest.restoreAllMocks());
  const at = (ms: number) => {
    clock = ms;
    return new Date(ms).toISOString();
  };

  test('is absent after adds, then advances on update, recordSelection and remove', async () => {
    const repos = createMemoryRepositories(fixtureCatalog);
    const a = await repos.collection.add(newItem());
    const b = await repos.collection.add(newItem());
    expect(repos.snapshot()).not.toHaveProperty('lastModifiedAt');

    const updatedAt = at(T0 + 1_000);
    await repos.collection.update(a.id, { favorite: true });
    expect(repos.snapshot().lastModifiedAt).toBe(updatedAt);

    const { requestId } = await repos.recommendations.recommend({ occasion: 'Office', timeOfDay: 'morning' });
    const wornAt = at(T0 + 2_000);
    await repos.recommendations.recordSelection(requestId, b.id);
    expect(repos.snapshot().lastModifiedAt).toBe(wornAt);

    const removedAt = at(T0 + 3_000);
    await repos.collection.remove(a.id);
    expect(repos.snapshot().lastModifiedAt).toBe(removedAt);
  });

  test('removing a bottle that is not there leaves it unchanged', async () => {
    const repos = createMemoryRepositories(fixtureCatalog);
    await repos.collection.remove('nope');
    expect(repos.snapshot()).not.toHaveProperty('lastModifiedAt');
  });

  test('round-trips through the initial state and is rolled back with a failed save', async () => {
    let fail = false;
    const stamp = new Date(T0 - 1_000).toISOString();
    const repos = createMemoryRepositories(fixtureCatalog, {
      initial: { version: 1, customFragrances: [custom], items: [storedItem()], requestIds: {}, lastModifiedAt: stamp },
      onChange: () => (fail ? Promise.reject(new Error('disk full')) : undefined),
    });
    expect(repos.snapshot().lastModifiedAt).toBe(stamp);
    fail = true;
    await expect(repos.collection.update('item-1', { favorite: true })).rejects.toThrow();
    expect(repos.snapshot().lastModifiedAt).toBe(stamp);
  });

  test('stored state with or without it passes the schema', () => {
    expect(persistedStateSchema.safeParse(emptyState()).success).toBe(true);
    expect(persistedStateSchema.safeParse({ ...emptyState(), lastModifiedAt: at(T0) }).success).toBe(true);
  });
});

describe('the timestamp clock seeded from stored bottles (F2/F4)', () => {
  const NOW = Date.parse('2026-11-17T12:00:00.000Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  const relaunch = (items: CollectionItem[]) =>
    createMemoryRepositories(fixtureCatalog, {
      initial: { version: 1, customFragrances: [custom], items, requestIds: {} },
    });

  test('a stored createdAt at the largest valid date does not break Add', async () => {
    const repos = relaunch([storedItem({ createdAt: '+275760-09-13T00:00:00.000Z' })]);
    expect((await repos.collection.add(newItem())).createdAt).toBe(iso(NOW));
  });

  test.each(['9000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z', '2026-11-18T12:00:00.001Z'])(
    'a stored createdAt more than a day ahead (%s) does not push later bottles into the future',
    async (createdAt) => {
      const repos = relaunch([storedItem({ createdAt })]);
      expect((await repos.collection.add(newItem())).createdAt).toBe(iso(NOW));
      expect((await repos.collection.add(newItem())).createdAt).toBe(iso(NOW + 1));
      expect(repos.snapshot().items[0].createdAt).toBe(createdAt); // the stored bottle itself is not rewritten
    },
  );

  test('a genuine bottle a few hours ahead of a slow device clock keeps its date, and new bottles still sort after it', async () => {
    const ahead = iso(NOW + 3 * 60 * 60 * 1000);
    const repos = relaunch([storedItem({ createdAt: ahead })]);
    const added = await repos.collection.add(newItem());
    expect(added.createdAt).toBe(iso(Date.parse(ahead) + 1));
    expect((await repos.collection.list()).map((e) => e.item.id)).toEqual([added.id, 'item-1']);
    expect(repos.snapshot().items[0].createdAt).toBe(ahead);
  });

  test('an unparseable stored createdAt is kept as stored and ignored by the clock', async () => {
    const repos = relaunch([storedItem({ createdAt: 'not a date' })]);
    expect((await repos.collection.add(newItem())).createdAt).toBe(iso(NOW));
    expect(repos.snapshot().items[0].createdAt).toBe('not a date');
  });

  test('a stored lastModifiedAt seeds the clock too, so a later edit is never dated before it', async () => {
    const edited = iso(NOW + 60_000);
    const repos = createMemoryRepositories(fixtureCatalog, {
      initial: { version: 1, customFragrances: [custom], items: [storedItem()], requestIds: {}, lastModifiedAt: edited },
    });
    await repos.collection.update('item-1', { favorite: true });
    expect(repos.snapshot().lastModifiedAt).toBe(iso(Date.parse(edited) + 1));
  });

  test('a very large stored collection loads without hitting the engine argument limit', async () => {
    const items = Array.from({ length: 200_000 }, (_, n) => storedItem({ id: `item-${n}`, createdAt: iso(NOW - n) }));
    const repos = relaunch(items);
    expect((await repos.collection.add(newItem())).createdAt).toBe(iso(NOW + 1));
  });
});
