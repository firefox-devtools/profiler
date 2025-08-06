module.exports = {
  env: {
    jest: true,
  },
  plugins: ['jest', 'testing-library', 'jest-formatting', 'jest-dom'],
  extends: [
    'plugin:jest/recommended',
    'plugin:testing-library/react',
    'plugin:jest-dom/recommended',
  ],
  rules: {
    'react/jsx-no-bind': 0,
    // This rule isn't useful because use Flow.
    'jest/valid-title': 0,

    // Allow require(), for example for tests
    '@typescript-eslint/no-require-imports': 'off',

    // Adding more errors now
    'testing-library/no-manual-cleanup': 'error',
    'testing-library/no-wait-for-snapshot': 'error',
    'testing-library/prefer-explicit-assert': [
      'error',
      { includeFindQueries: false },
    ],
    'testing-library/prefer-presence-queries': 'error',

    // Disable some rules that are in the "recommended" part.
    // This is a purely stylistic rule
    'testing-library/render-result-naming-convention': 'off',
    // This disallows using `container`, but this is still useful for us sometimes
    'testing-library/no-container': 'off',
    // This disallows using direct Node properties (eg: firstChild), but we have
    // legitimate uses:
    'testing-library/no-node-access': 'off',
    // Disable until https://github.com/testing-library/eslint-plugin-testing-library/issues/359
    // is fixed.
    'testing-library/await-async-query': 'off',

    // Individual jest-formatting rules so that we format only test and describe blocks
    'jest-formatting/padding-around-describe-blocks': 2,
    'jest-formatting/padding-around-test-blocks': 2,
  },
};
