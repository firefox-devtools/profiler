module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  "parser": "babel-eslint",
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:flowtype/recommended",
    "prettier",
    "prettier/flowtype",
    "prettier/react"
  ],
  "parserOptions": {
    "ecmaVersion": "2017",
    "ecmaFeatures": {
      "experimentalObjectRestSpread": true,
      "jsx": true
    },
    "sourceType": "module"
  },
  "plugins": [
    "react",
    "flowtype",
    "import",
    "prettier"
  ],
  "rules": {
    // ES6 Import rules:
    "import/no-duplicates": "error",
    "import/no-unresolved": "error",
    "import/named": "error",
    "prettier/prettier": ["error", { singleQuote: true, trailingComma: "es5" }],

    // overriding recommended rules
    "no-constant-condition": ["error", { checkLoops: false }],
    "no-console": [ "error", { allow: ["log", "warn", "error"] } ],
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],

    // possible errors
    "array-callback-return": "error",
    "consistent-return": "error",
    // "default-case": "error", // to be enabled after fixing issues in our code
    "dot-notation": "error",
    "eqeqeq": "error",
    // "for-direction": "error", // to be enabled after we upgrade eslint
    "no-alert": "error",
    "no-caller": "error",
    "no-eval": "error",
    "no-extend-native": "error",
    "no-extra-bind": "error",
    "no-extra-label": "error",
    "no-implied-eval": "error",
    "no-invalid-this": "error",
    "no-return-await": "error",
    "no-self-compare": "error",
    "no-throw-literal": "error",
    "no-unmodified-loop-condition": "error",
    // "no-unused-expression": "error", // to be enabled after we upgrade eslint
    // "no-use-before-define": "error", // to be enabled after fixing issues in our code
    "no-useless-call": "error",
    "no-useless-computed-key": "error",
    "no-useless-concat": "error",
    "no-useless-constructor": "error",
    "no-useless-rename": "error",
    "no-useless-return": "error",
    "no-var": "error",
    "no-void": "error",
    "no-with": "error",
    "prefer-const": "error",
    // "prefer-promise-reject-errors": "error", // to be enabled after fixing issues in our code
    // "prefer-rest-params": "error", // to be enabled after fixing issues in our code
    "prefer-spread": "error",
  },
  "settings": {
    "react": {
      "pragma": "React",
      "version": "15.0"
    }
  }
};
