import { randomUUID } from 'expo-crypto';

/** A random v4 UUID. Hermes has no global `crypto.randomUUID`, so ids come from expo-crypto. */
export function newId(): string {
  return randomUUID();
}
