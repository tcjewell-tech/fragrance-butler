import { createContext, useContext, type ReactNode } from 'react';
import { deleteAccount, signInWithEmailOtp, signOut, verifyEmailOtp } from './session';

export interface SessionApi {
  signInWithEmailOtp(email: string): Promise<void>;
  verifyEmailOtp(email: string, token: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

/** The bound Supabase-backed helpers. */
export const defaultSessionApi: SessionApi = { signInWithEmailOtp, verifyEmailOtp, signOut, deleteAccount };

const SessionApiContext = createContext<SessionApi>(defaultSessionApi);

/** Lets screens use the session helpers without importing Supabase, so tests can inject fakes. */
export function SessionApiProvider({ value, children }: { value: SessionApi; children: ReactNode }) {
  return <SessionApiContext.Provider value={value}>{children}</SessionApiContext.Provider>;
}

export function useSessionApi(): SessionApi {
  return useContext(SessionApiContext);
}
