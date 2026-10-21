const expoPreset = require('jest-expo/jest-preset');

/**
 * Integration tests talk to a real Supabase stack, so they run in plain Node: jest-expo's native
 * preset replaces fetch with a stubbed expo/fetch that cannot reach the network. Babel transform
 * only (no jest-expo setup files). Run with `npm run test:integration`.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: expoPreset.transform,
  testMatch: ['**/__tests__/**/*.integration.test.[jt]s'],
  testPathIgnorePatterns: ['/node_modules/', '/.superpowers/'],
  modulePathIgnorePatterns: ['<rootDir>/.superpowers/'],
};
