import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { createMemoryRepositories } from '@/data/memory';
import { RepositoryProvider, useRepositories } from '@/data/RepositoryContext';

describe('useRepositories', () => {
  test('throws outside a RepositoryProvider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(renderHook(() => useRepositories())).rejects.toThrow(
        'useRepositories must be used inside RepositoryProvider',
      );
    } finally {
      spy.mockRestore();
    }
  });

  test('returns the provided repositories', async () => {
    const value = createMemoryRepositories();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RepositoryProvider value={value}>{children}</RepositoryProvider>
    );
    const { result } = await renderHook(() => useRepositories(), { wrapper });
    expect(result.current).toBe(value);
  });
});
