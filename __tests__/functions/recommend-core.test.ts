import {
  type Candidate,
  HttpError,
  MODEL,
  type RecommendDeps,
  parseRecommendRequest,
  recommend,
} from '../../supabase/functions/_shared/recommend-core';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function candidate(n: number, over: Partial<Candidate> = {}): Candidate {
  return {
    itemId: id(n),
    fragranceId: id(100 + n),
    house: `House ${n}`,
    name: `Scent ${n}`,
    concentration: 'EDP',
    bottleSizeMl: 50,
    olfactoryFamily: null,
    notes: { top: [], heart: [], base: [] },
    longevity: null,
    projection: null,
    seasonAffinity: [],
    timeAffinity: [],
    marketedGender: null,
    favorite: false,
    wearCount: 0,
    userNotes: null,
    ...over,
  };
}

const body = { occasion: '  Office   Christmas party ', timeOfDay: 'evening', excludeItemIds: [] as string[] };

function setup(collection: Candidate[], answer: unknown) {
  const deps = {
    listCollection: jest.fn(async () => collection),
    askModel: jest.fn(async (_system: string, _user: string, _schema: Record<string, unknown>) => answer),
    saveRequest: jest.fn(async () => 'req-1'),
  } satisfies RecommendDeps;
  return deps;
}

async function rejection(p: Promise<unknown>): Promise<HttpError> {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(HttpError);
  return err as HttpError;
}

describe('parseRecommendRequest', () => {
  test('tidies the occasion and defaults the exclusions', () => {
    expect(parseRecommendRequest({ occasion: ' Dinner   out ', timeOfDay: 'night' })).toEqual({
      occasion: 'Dinner out',
      timeOfDay: 'night',
      excludeItemIds: [],
    });
  });

  test.each([
    ['no body', null],
    ['a blank occasion', { occasion: '   ', timeOfDay: 'evening' }],
    ['an occasion over 200 characters', { occasion: 'a'.repeat(201), timeOfDay: 'evening' }],
    ['an unknown time of day', { occasion: 'Dinner', timeOfDay: 'teatime' }],
    ['exclusions that are not ids', { occasion: 'Dinner', timeOfDay: 'evening', excludeItemIds: ['nope'] }],
  ])('rejects %s with a 400', (_label, input) => {
    expect(() => parseRecommendRequest(input)).toThrow(HttpError);
    try {
      parseRecommendRequest(input);
    } catch (e) {
      expect((e as HttpError).status).toBe(400);
    }
  });
});

describe('recommend', () => {
  test('asks with labelled candidates and the occasion, and returns the picks as item ids', async () => {
    const deps = setup([candidate(1), candidate(2), candidate(3)], {
      picks: [
        { candidate: 'c2', rationale: 'Warm enough for a festive room.' },
        { candidate: 'c1', rationale: '  Quieter,   if you prefer. ' },
      ],
    });
    const result = await recommend(body, deps);

    expect(result).toEqual({
      requestId: 'req-1',
      picks: [
        { itemId: id(2), rationale: 'Warm enough for a festive room.' },
        { itemId: id(1), rationale: 'Quieter, if you prefer.' },
      ],
    });
    const [, user, schema] = deps.askModel.mock.calls[0];
    expect(user).toContain('Time of day: evening');
    expect(user).toContain('<occasion>Office Christmas party</occasion>');
    expect(user).toContain('c1: House 1 Scent 1 (EDP, 50 ml)');
    expect(user).not.toContain(id(1));
    expect(JSON.stringify(schema)).toContain('"enum":["c1","c2","c3"]');
  });

  test('describes what is known about each bottle', async () => {
    const rich = candidate(1, {
      olfactoryFamily: 'woody aromatic',
      notes: { top: ['bergamot'], heart: ['lavender'], base: ['vetiver'] },
      projection: 4,
      favorite: true,
      wearCount: 3,
      userNotes: 'My wedding scent',
    });
    const deps = setup([rich, candidate(2)], { picks: [{ candidate: 'c1', rationale: 'A.' }, { candidate: 'c2', rationale: 'B.' }] });
    await recommend(body, deps);
    const user = deps.askModel.mock.calls[0][1];
    expect(user).toContain('family: woody aromatic');
    expect(user).toContain('notes: top bergamot; heart lavender; base vetiver');
    expect(user).toContain('projection 4/5');
    expect(user).toContain('a favourite');
    expect(user).toContain('worn 3 times');
    expect(user).toContain('user\'s note: "My wedding scent"');
  });

  test('logs the request with each pick’s fragrance and the model', async () => {
    const deps = setup([candidate(1), candidate(2)], {
      picks: [{ candidate: 'c1', rationale: 'A.' }, { candidate: 'c2', rationale: 'B.' }],
    });
    await recommend({ ...body, excludeItemIds: [id(9)] }, deps);
    expect(deps.saveRequest).toHaveBeenCalledWith({
      occasion: 'Office Christmas party',
      timeOfDay: 'evening',
      excludeItemIds: [id(9)],
      picks: [
        { itemId: id(1), fragranceId: id(101), rationale: 'A.' },
        { itemId: id(2), fragranceId: id(102), rationale: 'B.' },
      ],
      model: MODEL,
    });
  });

  test('leaves excluded bottles out of the candidates', async () => {
    const deps = setup([candidate(1), candidate(2), candidate(3)], {
      picks: [{ candidate: 'c1', rationale: 'A.' }, { candidate: 'c2', rationale: 'B.' }],
    });
    const result = await recommend({ ...body, excludeItemIds: [id(1)] }, deps);
    const user = deps.askModel.mock.calls[0][1];
    expect(user).not.toContain('Scent 1');
    expect(result.picks.map((p) => p.itemId)).toEqual([id(2), id(3)]);
  });

  test('with fewer than two bottles left it replies 422 without asking', async () => {
    const deps = setup([candidate(1), candidate(2)], null);
    const err = await rejection(recommend({ ...body, excludeItemIds: [id(1)] }, deps));
    expect(err.status).toBe(422);
    expect(deps.askModel).not.toHaveBeenCalled();
  });

  test('drops unknown labels, repeats and unusable rationales, and keeps at most three', async () => {
    const deps = setup([candidate(1), candidate(2), candidate(3), candidate(4), candidate(5)], {
      picks: [
        { candidate: 'c9', rationale: 'Not a candidate.' },
        { candidate: 'c1', rationale: 'First.' },
        { candidate: 'c1', rationale: 'Repeat.' },
        { candidate: 'c2', rationale: '   ' },
        { candidate: 'c3', rationale: 'x'.repeat(281) },
        { candidate: 'c4', rationale: 'Second.' },
        { candidate: 'c5', rationale: 'Third.' },
        { candidate: 'c2', rationale: 'Fourth.' },
      ],
    });
    const result = await recommend(body, deps);
    expect(result.picks.map((p) => p.rationale)).toEqual(['First.', 'Second.', 'Third.']);
  });

  test.each([
    ['one usable pick', { picks: [{ candidate: 'c1', rationale: 'Only one.' }] }],
    ['no picks', { picks: [] }],
    ['a malformed answer', 'not an object'],
  ])('replies 502 on %s and logs nothing', async (_label, answer) => {
    const deps = setup([candidate(1), candidate(2)], answer);
    const err = await rejection(recommend(body, deps));
    expect(err.status).toBe(502);
    expect(deps.saveRequest).not.toHaveBeenCalled();
  });

  test('a bad request is rejected before the collection is read', async () => {
    const deps = setup([candidate(1), candidate(2)], null);
    const err = await rejection(recommend({ occasion: '', timeOfDay: 'evening' }, deps));
    expect(err.status).toBe(400);
    expect(deps.listCollection).not.toHaveBeenCalled();
  });
});
