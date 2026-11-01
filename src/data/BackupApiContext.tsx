import { createContext, useContext, type ReactNode } from 'react';
import type { BackupApi } from './backupApi';

const BackupApiContext = createContext<BackupApi | null>(null);

/** Provided only by the local-mode root, so screens can tell the two builds apart. */
export function BackupApiProvider({ value, children }: { value: BackupApi; children: ReactNode }) {
  return <BackupApiContext.Provider value={value}>{children}</BackupApiContext.Provider>;
}

/** The backup API, or null in the Supabase build (no provider). */
export function useBackupApi(): BackupApi | null {
  return useContext(BackupApiContext);
}
