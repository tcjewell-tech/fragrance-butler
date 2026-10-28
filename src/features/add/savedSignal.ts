type Listener = () => void;

const listeners = new Set<Listener>();

/** Lets the search screen, which stays mounted under the confirm screen, know a bottle was just added. */
export function subscribeSaved(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceSaved(): void {
  for (const listener of [...listeners]) listener();
}
