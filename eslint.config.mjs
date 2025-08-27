import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import babelPlugin from '@babel/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import importPlugin from 'eslint-plugin-import';
import jestPlugin from 'eslint-plugin-jest';
import testingLibraryPlugin from 'eslint-plugin-testing-library';
import jestFormattingPlugin from 'eslint-plugin-jest-formatting';
import jestDomPlugin from 'eslint-plugin-jest-dom';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores
  {
    ignores: [
      'src/profile-logic/import/proto/**',
      'src/types/libdef/npm/**',
      'docs-user/**',
      'coverage/**',
    ],
  },

  // Base JavaScript config
  js.configs.recommended,

  // TypeScript config
  ...tsPlugin.configs['flat/recommended'],

  // React config
  reactPlugin.configs.flat.recommended,

  // Custom configuration for all files
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024,
        ...globals.node,
        AVAILABLE_STAGING_LOCALES: true,
      },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@babel': babelPlugin,
      import: importPlugin,
    },
    settings: {
      react: {
        pragma: 'React',
        version: '18.0',
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
      '@typescript-eslint/no-require-imports': 'off',
    },
    linterOptions: {
      // This property is specified both here in addition to the command line in
      // package.json.
      // The reason is that the property only warns but the command line option
      // outputs errors, but the property is useful so that we have the information
      // directly in editors.
      reportUnusedDisableDirectives: true,
    },
  },

  // Source files - enable stricter TypeScript rules
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'error',
    },
  },

  // Test files override
  {
    files: ['src/test/**/*'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    plugins: {
      jest: jestPlugin,
      'testing-library': testingLibraryPlugin,
      'jest-formatting': jestFormattingPlugin,
      'jest-dom': jestDomPlugin,
    },
    rules: {
      // Jest recommended rules
      ...jestPlugin.configs.recommended.rules,

      // Testing Library recommended rules
      ...testingLibraryPlugin.configs.react.rules,

      // Jest DOM recommended rules
      ...jestDomPlugin.configs.recommended.rules,

      'react/jsx-no-bind': 'off',
      // This rule isn't useful because we use TypeScript.
      'jest/valid-title': 'off',

      // Allow require(), for example for importing JSON files.
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
      'jest-formatting/padding-around-describe-blocks': 'error',
      'jest-formatting/padding-around-test-blocks': 'error',
    },
  },

  // __mocks__ directory configuration
  {
    files: ['__mocks__/**/*'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },

  // Prettier config (must be last to override other formatting rules)
  prettierConfig,
];
