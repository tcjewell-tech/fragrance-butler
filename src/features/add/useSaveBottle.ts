import { useCallback, useRef, useState } from 'react';
import { useRepositories } from '@/data/RepositoryContext';
import type { NewCollectionItem } from '@/domain/types';
import { newId } from '@/lib/uuid';

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
      setStatus('saving');
      // Everything that can throw runs inside the promise, so any failure becomes a rejection.
      const run = (async () => {
        try {
          clientRequestId.current ??= newId();
          await collection.add({ ...input, clientRequestId: clientRequestId.current });
          setStatus('idle');
        } catch (e) {
          setStatus('error');
          throw e;
        }
      })();
      inFlight.current = run;
      // Cleared after assignment: a failure before the first await settles `run` before this line runs.
      const clear = () => {
        inFlight.current = null;
      };
      run.then(clear, clear);
      return run;
    },
    [collection],
  );

  return { save, status };
}
