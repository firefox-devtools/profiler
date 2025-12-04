/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

module.exports = {
  testMatch: ['<rootDir>/src/**/*.test.{js,jsx,ts,tsx}'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],

  // Use custom resolver that respects the "browser" field in package.json
  resolver: './jest-resolver.js',

  testEnvironment: './src/test/custom-environment',
  setupFilesAfterEnv: ['jest-extended/all', './src/test/setup.ts'],

  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!src/types/libdef/**',
  ],

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
  verbose: false,
};
