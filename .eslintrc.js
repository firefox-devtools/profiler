module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "node": true
    },
    "extends": ["eslint:recommended", "plugin:react/recommended"],
    "parserOptions": {
        "ecmaFeatures": {
            "experimentalObjectRestSpread": true,
            "jsx": true
        },
        "sourceType": "module"
    },
    "plugins": [
        "react"
    ],
    "rules": {
        "indent": [
            "error",
            2,
            { "SwitchCase": 1 }
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "single"
        ],
        "semi": [
            "error",
            "always"
        ],
        "no-extra-semi": [
            "error"
        ],
        "comma-dangle": [
            "error",
            "always-multiline"
        ],
        "no-console": [
            "error",
            { allow: ["log", "warn", "error"] }
        ],
        "eqeqeq": [
            "error"
        ],
        "valid-jsdoc": [
            "error"
        ]
    },
    "settings": {
        "react": {
            "pragma": "React",
            "version": "15.0"
        }
    }
};