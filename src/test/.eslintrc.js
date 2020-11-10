// @flow
module.exports = {
  env: {
    jest: true,
  },
  plugins: ['testing-library'],
  extends: ['plugin:jest/recommended', 'plugin:testing-library/react'],
  rules: {
    'react/jsx-no-bind': 0,
    // This rule isn't useful because use Flow.
    'jest/valid-title': 0,

    // Adding more errors now
    'testing-library/no-manual-cleanup': 'error',
    'testing-library/no-wait-for-empty-callback': 'error',
    'testing-library/no-wait-for-snapshot': 'error',
    'testing-library/prefer-wait-for': 'error',
  },
};
