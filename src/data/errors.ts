export type RepositoryErrorKind = 'network' | 'auth' | 'unknown';

/** Any failure talking to the backend. `kind` tells the UI how to react; the original error is `cause`. */
export class RepositoryError extends Error {
  readonly kind: RepositoryErrorKind;

  constructor(kind: RepositoryErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RepositoryError';
    this.kind = kind;
  }
}

const NETWORK_MESSAGE = /failed to fetch|network request failed|fetch failed|networkerror|load failed/i;
// PGRST301: PostgREST JWT error. 42501: Postgres insufficient privilege (also RLS violations).
// 28000: invalid authorization (raised by delete_my_account without a user).
const AUTH_CODES = new Set(['PGRST301', '42501', '28000', '401', '403']);

const field = (err: unknown, key: string): unknown =>
  typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[key] : undefined;

function classify(err: unknown, status: number | undefined): RepositoryErrorKind {
  const message = field(err, 'message');
  if (
    err instanceof TypeError ||
    field(err, 'name') === 'AuthRetryableFetchError' ||
    (typeof message === 'string' && NETWORK_MESSAGE.test(message))
  ) {
    return 'network';
  }
  const code = field(err, 'code');
  const errStatus = field(err, 'status');
  if (
    (typeof code === 'string' && AUTH_CODES.has(code)) ||
    status === 401 ||
    status === 403 ||
    errStatus === 401 ||
    errStatus === 403
  ) {
    return 'auth';
  }
  return 'unknown';
}

/**
 * Wraps whatever supabase-js (PostgREST, GoTrue, fetch) produced as a RepositoryError. `status` is
 * the HTTP status of the response, when the caller has it. An existing RepositoryError is returned as is.
 */
export function toRepositoryError(err: unknown, status?: number): RepositoryError {
  if (err instanceof RepositoryError) return err;
  const message = field(err, 'message');
  return new RepositoryError(classify(err, status), typeof message === 'string' && message ? message : 'Request failed', {
    cause: err,
  });
}
