// @flow
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

    // Adding more errors now
    'testing-library/no-manual-cleanup': 'error',
    'testing-library/no-wait-for-empty-callback': 'error',
    'testing-library/no-wait-for-snapshot': 'error',
    'testing-library/prefer-explicit-assert': 'error',
    'testing-library/prefer-presence-queries': 'error',
    'testing-library/prefer-wait-for': 'error',

    // Individual jest-formatting rules so that we format only test and describe blocks
    'jest-formatting/padding-around-describe-blocks': 2,
    'jest-formatting/padding-around-test-blocks': 2,
  },
};
