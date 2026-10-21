import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SessionApiProvider, useSessionApi, type SessionApi } from '@/data/SessionApiContext';
import * as session from '@/data/session';

describe('useSessionApi', () => {
  test('defaults to the bound session helpers', async () => {
    const { result } = await renderHook(() => useSessionApi());
    expect(result.current.signInWithEmailOtp).toBe(session.signInWithEmailOtp);
    expect(result.current.verifyEmailOtp).toBe(session.verifyEmailOtp);
    expect(result.current.signOut).toBe(session.signOut);
    expect(result.current.deleteAccount).toBe(session.deleteAccount);
  });

  test('returns the injected api', async () => {
    const value: SessionApi = {
      signInWithEmailOtp: jest.fn(),
      verifyEmailOtp: jest.fn(),
      signOut: jest.fn(),
      deleteAccount: jest.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionApiProvider value={value}>{children}</SessionApiProvider>
    );
    const { result } = await renderHook(() => useSessionApi(), { wrapper });
    expect(result.current).toBe(value);
  });
});
