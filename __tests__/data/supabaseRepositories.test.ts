import { RepositoryError } from '@/data/errors';
import { RepositoryError as ReExportedError, createSupabaseRepositories } from '@/data/supabase';
import { ValidationError } from '@/domain/validation';
import { argsOf, createFakeSupabase, methodsOf, type FakeResult, type RecordedQuery } from './fakeSupabase';

const UUID = '3f0c2d6e-5b1a-4c9e-8f7d-1a2b3c4d5e6f';

const fragranceRow = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  house: 'Dior',
  name: 'Sauvage',
  concentration: 'EDT',
  note_pyramid: { top: [], heart: [], base: [] },
  olfactory_family: null,
  longevity: null,
  projection: null,
  season_affinity: [],
  time_affinity: [],
  marketed_gender: null,
  release_year: null,
  reference_images: [],
  created_by: null,
  created_at: '2026-10-21T10:00:00+00:00',
  ...over,
});

const itemRow = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  user_id: 'user-1',
  fragrance_id: 'f1',
  bottle_size_ml: 100,
  concentration: 'EDT',
  acquisition_date: null,
  capture_method: 'manual',
  user_notes: null,
  favorite_flag: false,
  wear_count: 0,
  client_request_id: UUID,
  created_at: '2026-10-21T10:00:00.5+00:00',
  updated_at: '2026-10-21T10:00:00.5+00:00',
  ...over,
});

const setup = (respond: (q: RecordedQuery) => FakeResult, session?: { user: { id: string } } | null) => {
  const fake = createFakeSupabase(respond, session);
  return { ...fake, repos: createSupabaseRepositories(fake.client) };
};

describe('catalog', () => {
  test('search of a blank query returns [] without calling the database', async () => {
    const { repos, queries } = setup(() => ({ data: [] }));
    expect(await repos.catalog.search('   ')).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  test('search calls the search_fragrances RPC and groups the variants', async () => {
    const { repos, queries } = setup(() => ({
      data: [
        fragranceRow({ id: 'edp', concentration: 'EDP' }),
        fragranceRow({ id: 'edt', concentration: 'EDT' }),
        fragranceRow({ id: 'other', house: 'Chanel', name: 'Bleu' }),
      ],
    }));
    const groups = await repos.catalog.search('sauvage');
    expect(queries[0]).toMatchObject({ kind: 'rpc', name: 'search_fragrances' });
    expect(queries[0].rpcArgs).toMatchObject({ q: 'sauvage' });
    expect(groups.map((g) => g.name)).toEqual(['Sauvage', 'Bleu']);
    expect(groups[0].variants.map((v) => v.id)).toEqual(['edt', 'edp']);
  });

  test('search maps a database error to a RepositoryError', async () => {
    const { repos } = setup(() => ({ error: { message: 'JWT expired', code: 'PGRST301' } }));
    await expect(repos.catalog.search('x')).rejects.toMatchObject({ name: 'RepositoryError', kind: 'auth' });
  });

  test('a thrown fetch failure becomes a network RepositoryError', async () => {
    const { repos } = setup(() => {
      throw new TypeError('Network request failed');
    });
    await expect(repos.catalog.search('x')).rejects.toMatchObject({ name: 'RepositoryError', kind: 'network' });
  });

  test('getById selects one row by id and maps it, or returns null', async () => {
    const { repos, queries } = setup((q) => ({ data: q.calls.length ? fragranceRow() : null }));
    const f = await repos.catalog.getById('f1');
    expect(f?.id).toBe('f1');
    expect(queries[0].name).toBe('fragrances');
    expect(argsOf(queries[0], 'eq')).toEqual(['id', 'f1']);

    const none = setup(() => ({ data: null }));
    expect(await none.repos.catalog.getById('missing')).toBeNull();
  });

  test('createCustom inserts a row owned by the signed-in user', async () => {
    const { repos, queries } = setup(() => ({ data: fragranceRow({ id: 'new', created_by: 'user-1' }) }));
    const created = await repos.catalog.createCustom({
      house: '  Le   Labo ',
      name: 'Santal 33',
      concentration: 'EDP',
      releaseYear: 2011,
    });
    expect(created.isCustom).toBe(true);
    expect(queries[0].name).toBe('fragrances');
    // Without .select() PostgREST returns no row, so the chain must read the inserted row back.
    expect(methodsOf(queries[0])).toEqual(['insert', 'select', 'single']);
    expect(argsOf(queries[0], 'insert')?.[0]).toEqual({
      house: 'Le Labo',
      name: 'Santal 33',
      concentration: 'EDP',
      release_year: 2011,
      created_by: 'user-1',
    });
  });

  test('createCustom without a session rejects with an auth RepositoryError and sends nothing', async () => {
    const { repos, queries } = setup(() => ({ data: fragranceRow() }), null);
    await expect(
      repos.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' }),
    ).rejects.toMatchObject({ name: 'RepositoryError', kind: 'auth' });
    expect(queries).toHaveLength(0);
  });

  test('createCustom lets a ValidationError through unchanged', async () => {
    const { repos, queries } = setup(() => ({ data: fragranceRow() }));
    const err = await repos.catalog
      .createCustom({ house: '  ', name: 'X', concentration: 'EDP' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(queries).toHaveLength(0);
  });
});

describe('collection', () => {
  const entryRow = (over: Record<string, unknown> = {}) => ({ ...itemRow(), fragrances: fragranceRow(), ...over });

  test('list selects items with their fragrance, newest first, and maps them', async () => {
    const { repos, queries } = setup(() => ({
      data: [entryRow({ id: 'new' }), entryRow({ id: 'old', fragrances: fragranceRow({ id: 'f2' }) })],
    }));
    const list = await repos.collection.list();
    expect(list.map((e) => e.item.id)).toEqual(['new', 'old']);
    expect(list[1].fragrance.id).toBe('f2');
    expect(list[0].item.createdAt).toBe('2026-10-21T10:00:00.500Z');
    expect(queries[0].name).toBe('collection_items');
    expect(argsOf(queries[0], 'select')?.[0]).toMatch(/fragrances\(\*\)/);
    expect(argsOf(queries[0], 'order')).toEqual(['created_at', { ascending: false }]);
  });

  test('list rejects when an item has no joined fragrance', async () => {
    const { repos } = setup(() => ({ data: [entryRow({ fragrances: null })] }));
    await expect(repos.collection.list()).rejects.toMatchObject({ name: 'RepositoryError', kind: 'unknown' });
  });

  test('get returns the entry or null', async () => {
    const found = setup(() => ({ data: entryRow() }));
    expect((await found.repos.collection.get('i1'))?.item.id).toBe('i1');
    expect(argsOf(found.queries[0], 'eq')).toEqual(['id', 'i1']);
    expect(methodsOf(found.queries[0])).toEqual(['select', 'eq', 'maybeSingle']);
    const missing = setup(() => ({ data: null }));
    expect(await missing.repos.collection.get('nope')).toBeNull();
  });

  describe('add', () => {
    const input = {
      clientRequestId: UUID,
      fragranceId: 'f1',
      bottleSizeMl: 100,
      concentration: 'EDT' as const,
      captureMethod: 'manual' as const,
    };

    test('upserts ignoring duplicates on client_request_id, then selects by it', async () => {
      const { repos, queries } = setup((q) => ({ data: methodsOf(q).includes('upsert') ? null : itemRow() }));
      const item = await repos.collection.add({ ...input, userNotes: ' hi ', acquisitionDate: '2025-03-09' });
      expect(item.id).toBe('i1');
      expect(queries).toHaveLength(2);

      const [row, opts] = argsOf(queries[0], 'upsert') as [Record<string, unknown>, unknown];
      expect(opts).toEqual({ onConflict: 'client_request_id', ignoreDuplicates: true });
      expect(row).toEqual({
        client_request_id: UUID,
        fragrance_id: 'f1',
        bottle_size_ml: 100,
        concentration: 'EDT',
        capture_method: 'manual',
        acquisition_date: '2025-03-09',
        user_notes: 'hi',
      });
      expect(row).not.toHaveProperty('user_id');

      expect(argsOf(queries[1], 'eq')).toEqual(['client_request_id', UUID]);
      expect(methodsOf(queries[1])).toContain('maybeSingle');
    });

    test('rejects with an unknown RepositoryError if the row cannot be read back', async () => {
      const { repos } = setup(() => ({ data: null }));
      await expect(repos.collection.add(input)).rejects.toMatchObject({ name: 'RepositoryError', kind: 'unknown' });
    });

    test('a database error on the upsert becomes a RepositoryError and skips the read', async () => {
      const { repos, queries } = setup(() => ({ error: { message: 'violates foreign key', code: '23503' } }));
      await expect(repos.collection.add(input)).rejects.toMatchObject({ name: 'RepositoryError', kind: 'unknown' });
      expect(queries).toHaveLength(1);
    });

    test('invalid input rejects with a ValidationError before touching the database', async () => {
      const { repos, queries } = setup(() => ({ data: itemRow() }));
      const err = await repos.collection.add({ ...input, bottleSizeMl: 0 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(queries).toHaveLength(0);
    });
  });

  describe('update', () => {
    test('sends only the patched fields as snake_case columns and maps the row back', async () => {
      const { repos, queries } = setup(() => ({ data: itemRow({ favorite_flag: true, bottle_size_ml: 50 }) }));
      const updated = await repos.collection.update('i1', {
        favorite: true,
        bottleSizeMl: 50,
        acquisitionDate: null,
        userNotes: '  ',
      });
      expect(updated).toMatchObject({ id: 'i1', favorite: true, bottleSizeMl: 50 });
      expect(argsOf(queries[0], 'update')?.[0]).toEqual({
        favorite_flag: true,
        bottle_size_ml: 50,
        acquisition_date: null,
        user_notes: null,
      });
      expect(argsOf(queries[0], 'eq')).toEqual(['id', 'i1']);
      // Without .select() PostgREST returns no row, so the chain must read the updated row back.
      expect(methodsOf(queries[0])).toEqual(['update', 'eq', 'select', 'maybeSingle']);
    });

    test('rejects when no row was updated (unknown id)', async () => {
      const { repos } = setup(() => ({ data: null }));
      await expect(repos.collection.update('nope', { favorite: true })).rejects.toThrow(/unknown/i);
    });

    test('an empty patch sends no update and returns the current item', async () => {
      const { repos, queries } = setup(() => ({ data: entryRow() }));
      expect((await repos.collection.update('i1', {})).id).toBe('i1');
      expect(queries.flatMap(methodsOf)).not.toContain('update');
    });

    test('an invalid patch rejects with a ValidationError before touching the database', async () => {
      const { repos, queries } = setup(() => ({ data: itemRow() }));
      const err = await repos.collection.update('i1', { bottleSizeMl: 1001 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(queries).toHaveLength(0);
    });
  });

  describe('remove', () => {
    test('deletes by id', async () => {
      const { repos, queries } = setup(() => ({ data: null }));
      await expect(repos.collection.remove('i1')).resolves.toBeUndefined();
      expect(methodsOf(queries[0])).toContain('delete');
      expect(argsOf(queries[0], 'eq')).toEqual(['id', 'i1']);
    });

    test('maps a database error to a RepositoryError', async () => {
      const { repos } = setup(() => ({ error: { message: 'denied', code: '42501' } }));
      await expect(repos.collection.remove('i1')).rejects.toMatchObject({ kind: 'auth' });
    });
  });
});

describe('RepositoryError export', () => {
  test('is re-exported from supabase.ts', () => {
    expect(ReExportedError).toBe(RepositoryError);
  });
});
