import type { SupabaseClient } from '@supabase/supabase-js';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { RepositoryError } from '@/data/errors';
import { createMemoryRepositories } from '@/data/memory';
import { createSupabaseRepositories } from '@/data/supabase';
import { ValidationError } from '@/domain/validation';
import { fixtureCatalog, fixtureIds } from './fixtures';

describe('memory recommendations', () => {
  async function withBottles(ids: string[]) {
    const repos = createMemoryRepositories(fixtureCatalog);
    const items = [];
    for (const fragranceId of ids) {
      items.push(
        await repos.collection.add({
          clientRequestId: crypto.randomUUID(),
          fragranceId,
          bottleSizeMl: 100,
          concentration: 'EDT',
          captureMethod: 'manual',
        }),
      );
    }
    return { repos, itemIds: items.map((i) => i.id) };
  }

  const { sauvageEdtId, sauvageEdpId, hermesId } = fixtureIds;

  test('picks two or three of the caller’s own bottles', async () => {
    const { repos, itemIds } = await withBottles([sauvageEdtId, sauvageEdpId, hermesId, 'fixture-bleu-edp']);
    const rec = await repos.recommendations.recommend({ occasion: 'Dinner out', timeOfDay: 'evening' });
    expect(rec.picks).toHaveLength(3);
    for (const p of rec.picks) expect(itemIds).toContain(p.itemId);
  });

  test('leaves out excluded bottles', async () => {
    const { repos, itemIds } = await withBottles([sauvageEdtId, sauvageEdpId, hermesId, 'fixture-bleu-edp']);
    const first = await repos.recommendations.recommend({ occasion: 'Dinner out', timeOfDay: 'evening' });
    const shown = first.picks.map((p) => p.itemId);
    const next = await repos.recommendations.recommend({
      occasion: 'Dinner out',
      timeOfDay: 'evening',
      excludeItemIds: shown.slice(0, 2),
    });
    for (const p of next.picks) expect(shown.slice(0, 2)).not.toContain(p.itemId);
    expect(next.picks.every((p) => itemIds.includes(p.itemId))).toBe(true);
  });

  test('rejects with fewer than two bottles to choose from', async () => {
    const { repos } = await withBottles([sauvageEdtId]);
    await expect(repos.recommendations.recommend({ occasion: 'Dinner out', timeOfDay: 'evening' })).rejects.toThrow();
  });

  test('rejects a blank occasion', async () => {
    const { repos } = await withBottles([sauvageEdtId, hermesId]);
    await expect(repos.recommendations.recommend({ occasion: ' ', timeOfDay: 'evening' })).rejects.toThrow(
      ValidationError,
    );
  });

  test('records a selection only for a bottle that was offered', async () => {
    const { repos } = await withBottles([sauvageEdtId, hermesId, sauvageEdpId, 'fixture-bleu-edp']);
    const rec = await repos.recommendations.recommend({ occasion: 'The office', timeOfDay: 'morning' });
    await expect(repos.recommendations.recordSelection(rec.requestId, rec.picks[0].itemId)).resolves.toBeUndefined();
    await expect(repos.recommendations.recordSelection(rec.requestId, 'not-offered')).rejects.toThrow();
    await expect(repos.recommendations.recordSelection('unknown', rec.picks[0].itemId)).rejects.toThrow();
  });

  test('choosing counts a wear, and a change of mind moves it', async () => {
    const { repos, itemIds } = await withBottles([sauvageEdtId, hermesId, sauvageEdpId]);
    const rec = await repos.recommendations.recommend({ occasion: 'The office', timeOfDay: 'morning' });
    const wears = async () =>
      Object.fromEntries((await repos.collection.list()).map((e) => [e.item.id, e.item.wearCount]));
    const [first, second] = rec.picks.map((p) => p.itemId);
    await repos.recommendations.recordSelection(rec.requestId, first);
    await repos.recommendations.recordSelection(rec.requestId, first);
    expect((await wears())[first]).toBe(1);
    await repos.recommendations.recordSelection(rec.requestId, second);
    const after = await wears();
    expect(after[first]).toBe(0);
    expect(after[second]).toBe(1);
    expect(itemIds).toContain(second);
  });
});

describe('supabase recommendations', () => {
  function setup(result: { data: unknown; error: unknown } | Error) {
    const invoke = jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    const client = { functions: { invoke } } as unknown as SupabaseClient;
    return { invoke, repos: createSupabaseRepositories(client) };
  }

  const reply = {
    requestId: 'req-1',
    picks: [
      { itemId: 'i1', rationale: 'Warm enough for a festive room.' },
      { itemId: 'i2', rationale: 'Quieter, if you’d rather the room come to you.' },
    ],
  };

  test('calls the recommend function with the tidied occasion and returns the picks', async () => {
    const { invoke, repos } = setup({ data: reply, error: null });
    const rec = await repos.recommendations.recommend({
      occasion: '  Office  Christmas party ',
      timeOfDay: 'evening',
      excludeItemIds: ['i9'],
    });
    expect(invoke).toHaveBeenCalledWith('recommend', {
      body: { occasion: 'Office Christmas party', timeOfDay: 'evening', excludeItemIds: ['i9'] },
    });
    expect(rec).toEqual(reply);
  });

  test('validates the occasion before calling', async () => {
    const { invoke, repos } = setup({ data: reply, error: null });
    await expect(repos.recommendations.recommend({ occasion: '', timeOfDay: 'evening' })).rejects.toThrow(
      ValidationError,
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  test('rejects a reply that breaks the contract', async () => {
    const { repos } = setup({ data: { requestId: 'r', picks: [reply.picks[0]] }, error: null });
    await expect(repos.recommendations.recommend({ occasion: 'Dinner', timeOfDay: 'evening' })).rejects.toThrow(
      ValidationError,
    );
  });

  test('an unreachable function is a network error', async () => {
    const { repos } = setup({ data: null, error: new FunctionsFetchError(new TypeError('Network request failed')) });
    const err = await repos.recommendations.recommend({ occasion: 'Dinner', timeOfDay: 'evening' }).catch((e) => e);
    expect(err).toBeInstanceOf(RepositoryError);
    expect(err.kind).toBe('network');
  });

  test('a 401 reply is an auth error', async () => {
    const { repos } = setup({ data: null, error: new FunctionsHttpError({ status: 401 }) });
    const err = await repos.recommendations.recommend({ occasion: 'Dinner', timeOfDay: 'evening' }).catch((e) => e);
    expect(err).toBeInstanceOf(RepositoryError);
    expect(err.kind).toBe('auth');
  });

  function setupRpc(result: { data: unknown; error: unknown; status?: number }) {
    const rpc = jest.fn(async () => result);
    const client = { rpc } as unknown as SupabaseClient;
    return { rpc, repos: createSupabaseRepositories(client) };
  }

  test('records a selection through record_recommendation_selection', async () => {
    const { rpc, repos } = setupRpc({ data: null, error: null });
    await repos.recommendations.recordSelection('req-1', 'i2');
    expect(rpc).toHaveBeenCalledWith('record_recommendation_selection', { request_id: 'req-1', item_id: 'i2' });
  });

  test('a failed selection rejects with a RepositoryError', async () => {
    const { repos } = setupRpc({ data: null, error: { message: 'that bottle was not offered', code: '22023' }, status: 400 });
    await expect(repos.recommendations.recordSelection('req-1', 'i2')).rejects.toBeInstanceOf(RepositoryError);
  });
});
