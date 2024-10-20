/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @noflow
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const profileServer = require('./profile-server');
const config = require('./webpack.config');
const { oneLine, stripIndent } = require('common-tags');
const port = process.env.FX_PROFILER_PORT || 4242;
const host = process.env.FX_PROFILER_HOST || 'localhost';
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .command('* [profile]', 'Open Firefox Profiler, on [profile] if included.')
  .option('c', {
    alias: 'config',
    describe: 'Path to local webpack config',
    type: 'string',
  })
  // Disabled --version flag since no version number in package.json.
  .version(false)
  .strict()
  .parseSync();

config.cache = {
  type: 'filesystem',
};
const serverConfig = {
  allowedHosts: ['localhost', '.gitpod.io'],
  host,
  port,
  // We disable hot reloading because this takes lot of CPU and memory in the
  // case of the profiler, which is a quite heavy program.
  hot: false,
  liveReload: false,
  // redirects all 404 requests to index.html
  historyApiFallback: {
    // Without any special rule about having a "." character in the URL request.
    disableDotRule: true,
  },
  headers: {
    // See res/_headers for more information about all these headers.
    // /!\ Don't forget to keep it sync-ed with the headers here /!\
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': oneLine`
      default-src 'self';
      script-src
        'self'
        'wasm-unsafe-eval';
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      img-src http: https: data:;
      object-src 'none';
      connect-src *;
      form-action 'none'
    `,
  },
  static: false,
  client: {
    // See https://github.com/firefox-devtools/profiler/pull/4598#issuecomment-1529260852
    // for the root cause of an error happening at load time. For this reason we
    // disable the webpack overlay. We may be able to revisit after moving to
    // the React 18 new API.
    overlay: false,
  },
};

// Allow a local file to override various options.
let localConfigFile; // Set by readConfig() below.
const defaultLocalConfigPath = path.join(
  __dirname,
  './webpack.local-config.js'
);
const readConfig = (localConfigPath) => {
  const configRequirePath = `./${path.relative(__dirname, localConfigPath)}`;
  try {
    require(configRequirePath)(config, serverConfig);
    localConfigFile = path.basename(configRequirePath);
  } catch (error) {
    console.error(
      `Unable to load and apply settings from ${configRequirePath}`
    );
    console.error(error);
  }
};
if (argv.config) {
  readConfig(argv.config);
} else if (fs.existsSync(defaultLocalConfigPath)) {
  readConfig(defaultLocalConfigPath);
}

const profilerUrl = `http://${host}:${port}`;
if (argv.profile) {
  // Needed because of a later working directory change.
  argv.profile = path.resolve(argv.profile);

  // Delete "open" target (if any) in serverConfig.
  if (
    typeof serverConfig.open === 'object' &&
    !Array.isArray(serverConfig.open) &&
    serverConfig.open !== null
  ) {
    delete serverConfig.open.target;
  } else {
    delete serverConfig.open;
  }

  // Save and delete "open" property from serverConfig so that
  // webpack-dev-server doesn't open anything in tandem.
  const openOptions = serverConfig.open;
  delete serverConfig.open;

  // Start profile server and open on profile.
  profileServer.serveAndOpen(host, profilerUrl, argv.profile, openOptions);
}

process.chdir(__dirname); // Allow server.js to be run from anywhere.
const server = new WebpackDevServer(serverConfig, webpack(config));
server
  .start()
  .then(() => {
    const barAscii =
      '------------------------------------------------------------------------------------------';

    console.log(barAscii);
    console.log(`> Firefox Profiler is listening at: ${profilerUrl}\n`);
    if (port === 4242) {
      console.log(
        '> You can change this default port with the environment variable FX_PROFILER_PORT.\n'
      );
    }
    if (localConfigFile) {
      console.log(
        `> We used your local file "${localConfigFile}" to mutate webpack’s config values.`
      );
    } else {
      console.log(stripIndent`
        > You can customize the webpack dev server by creating a webpack.local-config.js
        > file that exports a single function that mutates the config values:
        >  (webpackConfig, serverConfig) => void
        `);
    }
    console.log(barAscii);
  })
  .catch((err) => console.log(err));
