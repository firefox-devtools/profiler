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
    "plugin:react/recommended",
    "prettier",
    "prettier/flowtype",
    "prettier/react"
  ],
  "parserOptions": {
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
    "prettier/prettier": ["error", { singleQuote: true, trailingComma: "es5" }]
  },
  "settings": {
    "react": {
      "pragma": "React",
      "version": "15.0"
    }
  }
};
