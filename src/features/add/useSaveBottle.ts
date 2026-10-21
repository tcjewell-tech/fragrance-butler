import { useCallback, useRef, useState } from 'react';
import { useRepositories } from '@/data/RepositoryContext';
import type { NewCollectionItem } from '@/domain/types';

export type SaveStatus = 'idle' | 'saving' | 'error';

export interface SaveBottle {
  /**
   * Adds the bottle. Resolves once saved; rejects if the repository fails (status becomes 'error' and the
   * caller's selection is untouched). A call while another is in flight returns that same promise. Every
   * call from one mount sends the same `clientRequestId`, so a retry can never add the bottle twice.
   */
  save(input: Omit<NewCollectionItem, 'clientRequestId'>): Promise<void>;
  status: SaveStatus;
}

export function useSaveBottle(): SaveBottle {
  const { collection } = useRepositories();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const clientRequestId = useRef<string | null>(null);
  // A ref, not state: two presses in the same tick both see the state from before the first press.
  const inFlight = useRef<Promise<void> | null>(null);

  const save = useCallback(
    (input: Omit<NewCollectionItem, 'clientRequestId'>): Promise<void> => {
      if (inFlight.current) return inFlight.current;
      clientRequestId.current ??= crypto.randomUUID();
      const request = { ...input, clientRequestId: clientRequestId.current };
      setStatus('saving');
      const run = (async () => {
        try {
          await collection.add(request);
          setStatus('idle');
        } catch (e) {
          setStatus('error');
          throw e;
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = run;
      return run;
    },
    [collection],
  );

  return { save, status };
}
