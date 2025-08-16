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
  overrides: [
    {
      files: ['src/test/**/*'],
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

        // Allow require(), for example for importing JSON files.
        '@typescript-eslint/no-require-imports': 'off',

        // Override the project-wide config to allow @ts-nocheck.
        // We really just need this for our mocks.
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            // Allow @ts-expect-error and @ts-no-check annotations with descriptions.
            'ts-expect-error': 'allow-with-description',
            'ts-nocheck': 'allow-with-description',
            // Don't allow @ts-ignore because we want to be notified
            // when the error goes away so we can remove the annotation - use
            // @ts-expect-error instead
            'ts-ignore': true,
            'ts-check': false,
          },
        ],

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
    },
  ],
};
