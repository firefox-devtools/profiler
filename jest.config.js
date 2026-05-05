/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Shared config for projects that need a browser-like (jsdom) environment.
// CLI unit tests use the same environment because they import browser-side
// fixtures to construct profile data.
const browserEnvConfig = {
  testEnvironment: './src/test/custom-environment',
  setupFilesAfterEnv: ['jest-extended/all', './src/test/setup.ts'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  resolver: './jest-resolver.js',

  transform: {
    '\\.([jt]sx?|mjs)$': 'babel-jest',
  },

  // Transform ESM modules to CommonJS for Jest
  // These packages ship as pure ESM and need to be transformed by Babel
  transformIgnorePatterns: [
    '/node_modules/(?!(query-string|decode-uri-component|iongraph-web|split-on-first|filter-obj|fetch-mock|devtools-reps)/)',
  ],

  // Mock static assets (images, CSS, etc.)
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|ftl)$':
      '<rootDir>/src/test/fixtures/mocks/file-mock.ts',
    '\\.(css|less)$': '<rootDir>/src/test/fixtures/mocks/style-mock.ts',
  },

  globals: {
    AVAILABLE_STAGING_LOCALES: null,
  },

  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
};

const allProjects = [
  // ========================================================================
  // Browser Tests (React/browser environment)
  // ========================================================================
  {
    ...browserEnvConfig,
    displayName: 'browser',
    testMatch: ['<rootDir>/src/**/*.test.{js,jsx,ts,tsx}'],

    collectCoverageFrom: [
      'src/**/*.{js,jsx,ts,tsx}',
      '!**/node_modules/**',
      '!src/types/libdef/**',
    ],
  },

  // ========================================================================
  // CLI Unit Tests (browser/jsdom environment - imports browser-side fixtures)
  // ========================================================================
  {
    ...browserEnvConfig,
    displayName: 'cli',
    testMatch: ['<rootDir>/profiler-cli/src/test/unit/**/*.test.ts'],
  },

  // ========================================================================
  // CLI Integration Tests (Node.js environment - spawns real processes)
  // ========================================================================
  {
    displayName: 'cli-integration',
    testMatch: ['<rootDir>/profiler-cli/src/test/integration/**/*.test.ts'],

    testEnvironment: 'node',

    setupFilesAfterEnv: ['./profiler-cli/src/test/integration/setup.ts'],

    // Integration tests can be slow (loading profiles, spawning processes)
    testTimeout: 30000,

    moduleFileExtensions: ['ts', 'js'],

    transform: {
      '\\.([jt]sx?|mjs)$': 'babel-jest',
    },
  },
];

// Filter projects by JEST_PROJECTS env var (comma-separated displayNames).
// Preferred over --selectProjects because that CLI flag is variadic and
// swallows positional args like `yarn test process-profile.ts`.
const filter = process.env.JEST_PROJECTS;
module.exports = {
  projects: filter
    ? allProjects.filter((p) => filter.split(',').includes(p.displayName))
    : allProjects,
};
