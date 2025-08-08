module.exports = {
  env: {
    browser: true,
    es6: true,
    es2020: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@babel', '@typescript-eslint', 'react', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: '2022',
    ecmaFeatures: {
      experimentalObjectRestSpread: true,
      jsx: true,
    },
    sourceType: 'module',
  },
  rules: {
    // Plugin rules:
    'import/no-duplicates': 'error',
    'import/no-unresolved': 'error',
    'import/named': 'error',
    'react/button-has-type': 'error',
    'react/no-access-state-in-setstate': 'error',
    'react/no-danger': 'error',
    'react/no-did-mount-set-state': 'error',
    'react/no-did-update-set-state': 'error',
    'react/no-will-update-set-state': 'error',
    'react/no-redundant-should-component-update': 'error',
    'react/no-unused-class-component-methods': 'error',
    'react/no-this-in-sfc': 'error',
    'react/no-typos': 'error',
    // TypeScript provides enough coverage over the prop types.
    'react/prop-types': 'off',
    'react/jsx-curly-brace-presence': [
      'error',
      { props: 'never', children: 'never' },
    ],
    // `no-unused-prop-types` is buggy when we use destructuring parameters in
    // functions as it misunderstands them as functional components.
    // See https://github.com/yannickcr/eslint-plugin-react/issues/1561
    // 'react/no-unused-prop-types': 'error',
    'react/no-unused-state': 'error',
    'react/jsx-no-bind': 'error',
    'react/jsx-no-leaked-render': 'error',

    // overriding recommended rules
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-console': ['error', { allow: ['log', 'warn', 'error'] }],

    // possible errors
    'array-callback-return': 'error',
    'consistent-return': 'error',
    curly: 'error',
    'default-case': 'error',
    'dot-notation': 'error',
    eqeqeq: 'error',
    'for-direction': 'error',
    'no-alert': 'error',
    'no-caller': 'error',
    'no-eval': 'error',
    'no-extend-native': 'error',
    'no-extra-bind': 'error',
    'no-extra-label': 'error',
    'no-implied-eval': 'error',
    // We use the version from the babel plugin so that `this` in a function
    // class property doesn't give a false positive.
    '@babel/no-invalid-this': 'error',
    'no-return-await': 'error',
    'no-self-compare': 'error',
    'no-throw-literal': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-useless-call': 'error',
    'no-useless-computed-key': 'error',
    'no-useless-concat': 'error',
    'no-useless-constructor': 'error',
    'no-useless-rename': 'error',
    'no-useless-return': 'error',
    'no-var': 'error',
    'no-void': 'error',
    'no-with': 'error',
    'prefer-const': 'error',
    'prefer-promise-reject-errors': 'error',
    'prefer-rest-params': 'error',
    'prefer-spread': 'error',
    'no-else-return': 'error',
    'no-nested-ternary': 'error',

    // Use `import type` everywhere we can.
    '@typescript-eslint/consistent-type-imports': 'error',
    // Allow `as any` escape hatches
    '@typescript-eslint/no-explicit-any': 'off',
    // Disable a rule that the TypeScript FAQ disapproves of
    '@typescript-eslint/no-empty-object-type': 'off',
    // Should enable this soon, mostly finds `catch (e)` with unused e
    '@typescript-eslint/no-unused-vars': 'off',
    // TypeScript imports react-jsx into .tsx files for us
    'react/react-in-jsx-scope': 'off',
    // Allow @ts-expect-error annotations with descriptions.
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        // Allow @ts-expect-error annotations with descriptions.
        'ts-expect-error': 'allow-with-description',
        // Don't allow @ts-ignore or @ts-nocheck because we want to be notified
        // when the error goes away so we can remove the annotation - use
        // @ts-expect-error instead
        'ts-ignore': true,
        'ts-nocheck': true,
        'ts-check': false, // allow even without description
      },
    ],
    // TODO: Re-enable for src when we update to eslint and switch to the new
    // config format
    '@typescript-eslint/no-require-imports': 'off',
  },
  // This property is specified both here in addition to the command line in
  // package.json.
  // The reason is that the property only warns but the command line option
  // outputs errors, but the property is useful so that we have the information
  // directly in editors.
  reportUnusedDisableDirectives: true,
  settings: {
    react: {
      pragma: 'React',
      version: '17.0',
    },
    'import/resolver': {
      alias: {
        map: [
          ['firefox-profiler', './src'],
          ['firefox-profiler-res', './res'],
        ],
        extensions: ['.js', '.ts', '.tsx', '.jpg'],
      },
    },
  },
  globals: {
    AVAILABLE_STAGING_LOCALES: true,
  },
};
