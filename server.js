/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @noflow
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const config = require('./webpack.config');
const { oneLine, stripIndent } = require('common-tags');
const port = process.env.FX_PROFILER_PORT || 4242;
const host = process.env.FX_PROFILER_HOST || 'localhost';
const fs = require('fs');
const path = require('path');
const localConfigExists = fs.existsSync(
  path.join(__dirname, './webpack.local-config.js')
);

const serverConfig = {
  allowedHosts: ['localhost', '.gitpod.io'],
  // We disable hot reloading because this takes lot of CPU and memory in the
  // case of the profiler, which is a quite heavy program.
  hot: false,
  liveReload: false,
  contentBase: config.output.path,
  publicPath: config.output.publicPath,
  historyApiFallback: {
    disableDotRule: true,
  },
  headers: {
    // See res/_headers for more information about all these headers.
    // /!\ Don't forget to keep it sync-ed with the headers here /!\
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': oneLine`
      default-src 'self';
      script-src
        'self'
        'sha256-eRTCQnd2fhPykpATDzCv4gdVk/EOdDq+6yzFXaWgGEw='
        'sha256-vY1KJ1dyP9vvnuERKMiQAcoKKtMUXZUEWJ/dT1XqpKM='
        https://www.google-analytics.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      img-src http: https: data:;
      object-src 'none';
      connect-src *;
      frame-ancestors 'self';
      form-action 'none'
    `,
  },
  stats: {
    colors: true,
  },
};

// Allow a local file to override various options.
if (localConfigExists) {
  try {
    require('./webpack.local-config.js')(config, serverConfig);
  } catch (error) {
    console.error(
      'Unable to load and apply settings from webpack.local-config.js'
    );
    console.error(error);
  }
}

new WebpackDevServer(webpack(config), serverConfig).listen(port, host, function(
  err
) {
  if (err) {
    console.log(err);
  }
  const barAscii =
    '------------------------------------------------------------------------------------------';

  console.log(barAscii);
  console.log(`> Firefox Profiler is listening at: http://${host}:${port}\n`);
  if (port === 4242) {
    console.log(
      '> You can change this default port with the environment variable FX_PROFILER_PORT.\n'
    );
  }
  if (localConfigExists) {
    console.log(
      '> We used your local file "webpack.local-config.js" to mutate webpack’s config values.'
    );
  } else {
    console.log(stripIndent`
      > You can customize the webpack dev server by creating a webpack.local-config.js
      > file that exports a single function that mutates the config values:
      >  (webpackConfig, serverConfig) => void
    `);
  }
  console.log(barAscii);
});
