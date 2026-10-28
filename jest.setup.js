// AsyncStorage has no native module under Jest; use the official in-memory mock everywhere.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// jest-expo's expo-crypto mock returns nothing; delegate ids to Node so UUID validation holds.
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
