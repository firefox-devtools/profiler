// @flow
module.exports = {
  env: {
    jest: true,
  },
  extends: ['plugin:jest/recommended'],
  rules: {
    'react/jsx-no-bind': 0,
    // This rule isn't useful because use Flow.
    'jest/valid-title': 0,
  },
};
