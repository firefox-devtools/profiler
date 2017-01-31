module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "node": true
    },
    "parser": "babel-eslint",
    "extends": ["eslint:recommended", "plugin:react/recommended"],
    "parserOptions": {
        "ecmaFeatures": {
            "experimentalObjectRestSpread": true,
            "jsx": true
        },
        "sourceType": "module"
    },
    "plugins": [
        "react",
        "flowtype"
    ],
    "rules": {
        // Flow type rules:
        "flowtype/define-flow-type": 1,
        "flowtype/use-flow-type": 1,
        "flowtype/generic-spacing": [2, "never"],
        "flowtype/space-before-type-colon": [ 2, "never" ],
        "flowtype/space-after-type-colon": [ 2, "always" ],

        // JS Rules:
        "indent": [
            "error",
            2,
            { "SwitchCase": 1 }
        ],
        "linebreak-style": [ "error", "unix" ],
        "quotes": [ "error", "single" ],
        "semi": [ "error", "always" ],
        "no-extra-semi": "error",
        "comma-dangle": [ "error", "always-multiline" ],
        "no-console": [ "error", { allow: ["log", "warn", "error"] } ],
        "eqeqeq": "error",
        "consistent-return": "error",
        "curly": ["error", "all" ],
        "dot-location": ["error", "property"],
        "dot-notation": "error",
        "no-alert": "error",
        "no-caller": "error",
        "no-else-return": "error",
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-extend-native": "error",
        "no-native-reassign": "error",
        "no-extra-bind": "error",
        "no-labels": "error",
        "no-implicit-globals": "error",
        "no-invalid-this": "error",
        "no-iterator": "error",
        "no-lone-blocks": "error",
        "no-loop-func": "error",
        "no-multi-spaces": "error",
        "no-param-reassign": "error",
        "no-proto": "error",
        "no-return-assign": "error",
        "no-script-url": "error",
        "no-self-compare": "error",
        "no-throw-literal": "error",
        "no-unmodified-loop-condition": "error",
        "no-unused-expressions": "error",
        "no-useless-concat": "error",
        "no-useless-escape": "error",
        "no-void": "error",
        "no-with": "error",
        "radix": "error",
        "yoda": ["error", "never", { "exceptRange": true }],
        "brace-style": ["error", "1tbs", { "allowSingleLine": true }],
        "camelcase": "error",
        "comma-spacing": "error",
        "comma-style": "error",
        "jsx-quotes": ["error", "prefer-single"],
        "key-spacing": "error",
        "keyword-spacing": "error",
        "no-new-object": "error",
        "no-spaced-func": "error",
        "semi-spacing": "error",
        "space-in-parens": ["error", "never"],
        "spaced-comment": "error",
        "generator-star-spacing": "error",
        "no-duplicate-imports": "error",
        "no-var": "error",
        "prefer-const": "error",
        "array-bracket-spacing": "error",
        "space-before-function-paren": ["error", {
            "anonymous": "always",
            "named": "never",
            "asyncArrow": "always",
        }],
        "arrow-parens": ["error", "as-needed"],
    },
    "settings": {
        "react": {
            "pragma": "React",
            "version": "15.0"
        }
    }
};
