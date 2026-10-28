import { act, renderHook } from '@testing-library/react-native';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { RepositoryError } from '@/data/errors';
import { createSessionApi, useSession } from '@/data/session';

const session = (id: string) => ({ access_token: `t-${id}`, user: { id } }) as unknown as Session;

type AuthListener = (event: string, session: Session | null) => void;

function createFakeAuthClient() {
  const listeners: AuthListener[] = [];
  const unsubscribe = jest.fn();
  let resolveGetSession!: (s: Session | null) => void;
  let rejectGetSession!: (e: unknown) => void;
  const getSessionResult = new Promise<{ data: { session: Session | null }; error: null }>((resolve, reject) => {
    resolveGetSession = (s) => resolve({ data: { session: s }, error: null });
    rejectGetSession = reject;
  });
  const auth = {
    getSession: jest.fn(() => getSessionResult),
    onAuthStateChange: jest.fn((cb: AuthListener) => {
      listeners.push(cb);
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithOtp: jest.fn(async (_args: unknown) => ({ data: {}, error: null as unknown })),
    verifyOtp: jest.fn(async (_args: unknown) => ({ data: {}, error: null as unknown })),
    signOut: jest.fn(async () => ({ error: null as unknown })),
  };
  const rpc = jest.fn(async (_name: string) => ({ data: null, error: null as unknown }));
  return {
    client: { auth, rpc } as unknown as SupabaseClient,
    auth,
    rpc,
    unsubscribe,
    emit: (event: string, s: Session | null) => listeners.forEach((l) => l(event, s)),
    resolveGetSession,
    rejectGetSession,
  };
}

describe('useSession', () => {
  test('is loading until getSession resolves, then exposes the session', async () => {
    const fake = createFakeAuthClient();
    const { result } = await renderHook(() => useSession(fake.client));
    expect(result.current).toEqual({ session: null, loading: true });
    await act(async () => fake.resolveGetSession(session('u1')));
    expect(result.current.loading).toBe(false);
    expect(result.current.session?.user.id).toBe('u1');
  });

  test('resolves to no session when signed out', async () => {
    const fake = createFakeAuthClient();
    const { result } = await renderHook(() => useSession(fake.client));
    await act(async () => fake.resolveGetSession(null));
    expect(result.current).toEqual({ session: null, loading: false });
  });

  test('follows auth state changes', async () => {
    const fake = createFakeAuthClient();
    const { result } = await renderHook(() => useSession(fake.client));
    await act(async () => fake.resolveGetSession(null));
    await act(async () => fake.emit('SIGNED_IN', session('u2')));
    expect(result.current.session?.user.id).toBe('u2');
    await act(async () => fake.emit('SIGNED_OUT', null));
    expect(result.current.session).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('an auth event before getSession resolves is not overwritten by the older getSession result', async () => {
    const fake = createFakeAuthClient();
    const { result } = await renderHook(() => useSession(fake.client));
    await act(async () => fake.emit('SIGNED_IN', session('fresh')));
    expect(result.current.loading).toBe(true);
    await act(async () => fake.resolveGetSession(null));
    expect(result.current.session?.user.id).toBe('fresh');
    expect(result.current.loading).toBe(false);
  });

  test('finishes loading with no session if getSession fails', async () => {
    const fake = createFakeAuthClient();
    const { result } = await renderHook(() => useSession(fake.client));
    await act(async () => fake.rejectGetSession(new Error('storage unavailable')));
    expect(result.current).toEqual({ session: null, loading: false });
  });

  test('unsubscribes on unmount and ignores a late getSession result', async () => {
    const fake = createFakeAuthClient();
    const { unmount } = await renderHook(() => useSession(fake.client));
    expect(fake.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    await unmount();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    await act(async () => fake.resolveGetSession(session('late')));
  });
});

describe('session api', () => {
  test('signInWithEmailOtp requests a code and may create the user', async () => {
    const fake = createFakeAuthClient();
    await createSessionApi(fake.client).signInWithEmailOtp('tom@example.test');
    expect(fake.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'tom@example.test',
      options: { shouldCreateUser: true },
    });
  });

  test('signInWithEmailOtp throws a RepositoryError on failure', async () => {
    const fake = createFakeAuthClient();
    fake.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: new TypeError('Network request failed') });
    const err = await createSessionApi(fake.client)
      .signInWithEmailOtp('tom@example.test')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RepositoryError);
    expect((err as RepositoryError).kind).toBe('network');
  });

  test('verifyEmailOtp verifies an email code', async () => {
    const fake = createFakeAuthClient();
    await createSessionApi(fake.client).verifyEmailOtp('tom@example.test', '123456');
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({ email: 'tom@example.test', token: '123456', type: 'email' });
  });

  test('verifyEmailOtp throws a RepositoryError on a bad code', async () => {
    const fake = createFakeAuthClient();
    fake.auth.verifyOtp.mockResolvedValueOnce({
      data: {},
      error: Object.assign(new Error('Token has expired or is invalid'), { status: 403, code: 'otp_expired' }),
    });
    await expect(createSessionApi(fake.client).verifyEmailOtp('tom@example.test', '000000')).rejects.toMatchObject({
      name: 'RepositoryError',
      kind: 'auth',
    });
  });

  test('signOut signs out and throws a RepositoryError on failure', async () => {
    const fake = createFakeAuthClient();
    const api = createSessionApi(fake.client);
    await api.signOut();
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
    fake.auth.signOut.mockResolvedValueOnce({ error: new Error('boom') });
    await expect(api.signOut()).rejects.toBeInstanceOf(RepositoryError);
  });

  test('deleteAccount calls delete_my_account and then signs out', async () => {
    const fake = createFakeAuthClient();
    const order: string[] = [];
    fake.rpc.mockImplementationOnce(async (name: string) => {
      order.push(`rpc:${name}`);
      return { data: null, error: null };
    });
    fake.auth.signOut.mockImplementationOnce(async () => {
      order.push('signOut');
      return { error: null };
    });
    await createSessionApi(fake.client).deleteAccount();
    expect(order).toEqual(['rpc:delete_my_account', 'signOut']);
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('deleteAccount still resolves when the sign-out after a successful deletion fails', async () => {
    const fake = createFakeAuthClient();
    fake.auth.signOut.mockResolvedValueOnce({ error: new TypeError('Network request failed') });
    await expect(createSessionApi(fake.client).deleteAccount()).resolves.toBeUndefined();
    fake.auth.signOut.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(createSessionApi(fake.client).deleteAccount()).resolves.toBeUndefined();
    expect(fake.rpc).toHaveBeenCalledTimes(2);
  });

  test('deleteAccount does not sign out when the RPC fails', async () => {
    const fake = createFakeAuthClient();
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'not authenticated', code: '28000' } });
    await expect(createSessionApi(fake.client).deleteAccount()).rejects.toMatchObject({
      name: 'RepositoryError',
      kind: 'auth',
    });
    expect(fake.auth.signOut).not.toHaveBeenCalled();
  });
});
