import { RepositoryError, toRepositoryError } from '@/data/errors';

describe('toRepositoryError', () => {
  test.each([
    ['a TypeError', new TypeError('anything')],
    ['"Failed to fetch"', { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }],
    ['"Network request failed"', new Error('Network request failed')],
    ['an auth-js retryable fetch error', Object.assign(new Error('x'), { name: 'AuthRetryableFetchError', status: 0 })],
  ])('classifies %s as network', (_label, err) => {
    expect(toRepositoryError(err).kind).toBe('network');
  });

  test.each([
    ['PGRST301', { message: 'JWT expired', code: 'PGRST301' }, undefined],
    ['Postgres 42501', { message: 'permission denied', code: '42501' }, undefined],
    ['status 401 on the error', { message: 'nope', status: 401 }, undefined],
    ['status 403 on the error', { message: 'nope', status: 403 }, undefined],
    ['status 401 from the response', { message: 'nope', code: '' }, 401],
    ['status 403 from the response', { message: 'nope' }, 403],
    ['code "401"', { message: 'nope', code: '401' }, undefined],
    ['not authenticated (28000)', { message: 'not authenticated', code: '28000' }, undefined],
  ])('classifies %s as auth', (_label, err, status) => {
    expect(toRepositoryError(err, status).kind).toBe('auth');
  });

  test.each([
    ['a Postgres constraint violation', { message: 'violates foreign key', code: '23503' }],
    ['a plain error', new Error('boom')],
    ['a non-error value', 'weird'],
    ['an empty error object', {}],
  ])('classifies %s as unknown', (_label, err) => {
    expect(toRepositoryError(err).kind).toBe('unknown');
  });

  test('keeps the original error as cause and its message', () => {
    const original = { message: 'JWT expired', code: 'PGRST301' };
    const e = toRepositoryError(original);
    expect(e).toBeInstanceOf(RepositoryError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('RepositoryError');
    expect(e.message).toBe('JWT expired');
    expect(e.cause).toBe(original);
  });

  test('returns an existing RepositoryError unchanged', () => {
    const e = new RepositoryError('auth', 'x');
    expect(toRepositoryError(e)).toBe(e);
  });
});
