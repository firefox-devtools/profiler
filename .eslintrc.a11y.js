// @flow
const { env, parser, parserOptions } = require('./.eslintrc.js');

// This is a special a11y config that copies main settings from the
// base config, but only has a11y related rulesets activated
module.exports = {
  env,
  parser,
  parserOptions,
  plugins: ['jsx-a11y'],
  extends: ['plugin:jsx-a11y/recommended'],
};
