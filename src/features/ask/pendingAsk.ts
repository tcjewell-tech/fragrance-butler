import type { TimeOfDay } from '@/domain/recommendation';

export type PendingAsk = { occasion: string; timeOfDay: TimeOfDay };

// Kept in memory, not in the tray's URL, so a link from outside the app can't start a request.
let pending: PendingAsk | null = null;

/** The Ask screen leaves what the user submitted here for the tray it opens; the tray clears it. */
export function handOverAsk(ask: PendingAsk | null): void {
  pending = ask;
}

export function pendingAsk(): PendingAsk | null {
  return pending;
}
