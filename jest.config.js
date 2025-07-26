/**
 * Jest configuration with two separate test projects:
 * 1. Browser tests (src/) - React/browser environment tests
 * 2. CLI tests (cli-tests/) - Node.js CLI integration tests
 */

module.exports = {
  projects: [
    // ========================================================================
    // Browser Tests (React/browser environment)
    // ========================================================================
    {
      displayName: 'browser',
      testMatch: ['<rootDir>/src/**/*.test.{js,jsx,ts,tsx}'],

      // Use custom jsdom environment for browser/React testing
      testEnvironment: './src/test/custom-environment',

      // Setup files that run after the test framework is installed
      setupFilesAfterEnv: [
        'jest-extended/all', // Extended matchers like toBeNumber()
        './src/test/setup.ts', // Browser-specific test setup
      ],

      // Coverage collection (for browser tests only)
      collectCoverageFrom: [
        'src/**/*.{js,jsx,ts,tsx}',
        '!**/node_modules/**',
        '!src/types/libdef/**',
      ],

      // File extensions to consider
      moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],

      // Transform ESM modules to CommonJS for Jest
      // These packages ship as pure ESM and need to be transformed by Babel
      transformIgnorePatterns: [
        '/node_modules/(?!(query-string|decode-uri-component|iongraph-web|split-on-first|filter-obj|fetch-mock)/)',
      ],

      // Mock static assets (images, CSS, etc.) in browser tests
      moduleNameMapper: {
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|ftl)$':
          '<rootDir>/src/test/fixtures/mocks/file-mock.ts',
        '\\.(css|less)$': '<rootDir>/src/test/fixtures/mocks/style-mock.ts',
      },

      // Global variables available in tests
      globals: {
        AVAILABLE_STAGING_LOCALES: null,
      },

      // Snapshot formatting
      snapshotFormat: {
        escapeString: true,
        printBasicPrototype: true,
      },
    },

    // ========================================================================
    // CLI Tests (Node.js environment)
    // ========================================================================
    {
      displayName: 'cli',
      testMatch: ['<rootDir>/src/profile-query-cli/tests/**/*.test.ts'],

      // Use Node.js environment (not browser/jsdom)
      testEnvironment: 'node',

      // CLI-specific setup (just jest-extended for matchers)
      setupFilesAfterEnv: ['./src/profile-query-cli/tests/setup.ts'],

      // CLI operations can be slow (loading profiles, spawning processes)
      testTimeout: 30000,

      // File extensions for CLI tests
      moduleFileExtensions: ['ts', 'js'],

      // No need for asset mocks in CLI tests
      // No transformIgnorePatterns needed - we don't use ESM-only deps here
    },
  ],
};
