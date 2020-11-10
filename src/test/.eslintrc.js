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
  },
};
