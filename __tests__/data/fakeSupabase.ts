import type { SupabaseClient } from '@supabase/supabase-js';

export interface RecordedQuery {
  kind: 'from' | 'rpc';
  /** Table name for `from`, function name for `rpc`. */
  name: string;
  /** For `rpc`, the arguments object. */
  rpcArgs?: unknown;
  /** The chained builder calls, in order, e.g. `['upsert', [row, opts]]`. */
  calls: [method: string, args: unknown[]][];
}

export interface FakeResult {
  data?: unknown;
  error?: unknown;
  status?: number;
}

export interface FakeSession {
  user: { id: string };
}

/**
 * A deliberately small fake of the slice of supabase-js the repositories use: `from(table)` and
 * `rpc(name, args)` return a recording, awaitable builder; `auth.getSession()` returns the given
 * session. Every awaited query is answered by `respond`. It checks no semantics of its own: tests
 * assert on what was sent (`queries`) and on how the repositories map what `respond` returns.
 */
export function createFakeSupabase(
  respond: (q: RecordedQuery) => FakeResult,
  session: FakeSession | null = { user: { id: 'user-1' } },
) {
  const queries: RecordedQuery[] = [];

  const builder = (q: RecordedQuery) => {
    queries.push(q);
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'order', 'single', 'maybeSingle']) {
      chain[method] = (...args: unknown[]) => {
        q.calls.push([method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => {
          const r = respond(q);
          return { data: r.data ?? null, error: r.error ?? null, status: r.status ?? 200 };
        })
        .then(resolve, reject);
    return chain;
  };

  const client = {
    from: (name: string) => builder({ kind: 'from', name, calls: [] }),
    rpc: (name: string, rpcArgs?: unknown) => builder({ kind: 'rpc', name, rpcArgs, calls: [] }),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
    },
  };

  return { client: client as unknown as SupabaseClient, queries };
}

export const methodsOf = (q: RecordedQuery): string[] => q.calls.map(([m]) => m);
export const argsOf = (q: RecordedQuery, method: string): unknown[] | undefined =>
  q.calls.find(([m]) => m === method)?.[1];
