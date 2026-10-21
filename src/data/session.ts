import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { toRepositoryError } from './errors';
import { supabaseClient } from './supabaseClient';

export interface SessionState {
  session: Session | null;
  /** True until the stored session has been read once. */
  loading: boolean;
}

/** The session helpers over a given client, so they can be tested with a fake. */
export function createSessionApi(client: SupabaseClient) {
  const fail = (error: unknown): never => {
    throw toRepositoryError(error);
  };

  async function signOut(): Promise<void> {
    const { error } = await client.auth.signOut();
    if (error) fail(error);
  }

  return {
    /** Emails a one-time code. Creates the account on first sign-in. */
    async signInWithEmailOtp(email: string): Promise<void> {
      const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) fail(error);
    },

    async verifyEmailOtp(email: string, token: string): Promise<void> {
      const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
      if (error) fail(error);
    },

    signOut,

    /** Deletes the signed-in user's account and all their data, then signs out (App Store 5.1.1(v)). */
    async deleteAccount(): Promise<void> {
      const { error } = await client.rpc('delete_my_account');
      if (error) fail(error);
      await signOut();
    },
  };
}

const defaultApi = createSessionApi(supabaseClient);
export const signInWithEmailOtp = defaultApi.signInWithEmailOtp;
export const verifyEmailOtp = defaultApi.verifyEmailOtp;
export const signOut = defaultApi.signOut;
export const deleteAccount = defaultApi.deleteAccount;

/** The current auth session. `loading` stays true until the first read of the stored session finishes. */
export function useSession(client: SupabaseClient = supabaseClient): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    let active = true;
    let sawEvent = false;

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      sawEvent = true;
      if (active) setState((s) => ({ ...s, session }));
    });

    client.auth
      .getSession()
      .then(
        ({ data: { session } }) => session,
        () => null,
      )
      .then((session) => {
        // An auth event that arrived first is newer than this read; keep it.
        if (active) setState((s) => ({ session: sawEvent ? s.session : session, loading: false }));
      });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  return state;
}
