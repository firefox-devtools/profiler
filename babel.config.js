module.exports = function (api) {
  api.cache(true);

  return {
    overrides: [
      {
        test: /\.jsx?$/,
        presets: [
          [
            "@babel/preset-env",
            {
              useBuiltIns: "usage",
              corejs: "3.9",
              bugfixes: true
            }
          ],
          [
            "@babel/preset-react",
            {
              useSpread: true
            }
          ],
          [
            "@babel/preset-flow",
            {
              all: true
            }
          ]
        ]
      },
      {
        test: /\.tsx?$/,
        presets: [
          [
            "@babel/preset-env",
            {
              useBuiltIns: "usage",
              corejs: "3.9",
              bugfixes: true
            }
          ],
          [
            "@babel/preset-react",
            {
              useSpread: true
            }
          ],
          [
            "@babel/preset-typescript",
            {
              isTSX: true,
              allExtensions: true
            }
          ]
        ]
      }
    ],
    plugins: [
      [
        "@babel/plugin-transform-class-properties",
        {
          loose: true
        }
      ],
      [
        "@babel/plugin-transform-private-methods",
        {
          loose: true
        }
      ],
      [
        "@babel/plugin-transform-private-property-in-object",
        {
          loose: true
        }
      ],
      [
        "module-resolver",
        {
          alias: {
            "firefox-profiler": "./src"
          }
        }
      ]
    ]
  };
};