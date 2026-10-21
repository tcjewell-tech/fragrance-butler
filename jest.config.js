const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    // scripts/build-seed.mjs is an ES module under test; run it through the same Babel setup as .ts/.js.
    '\\.mjs$': expoPreset.transform['\\.[jt]sx?$'],
  },
  // Only *.test.* files are suites; __tests__/data/repositoryContract.ts and fixtures.ts are shared helpers.
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/.superpowers/'],
  modulePathIgnorePatterns: ['<rootDir>/.superpowers/'],
};
