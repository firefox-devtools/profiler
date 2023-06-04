/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @noflow

import cp from 'child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
import http from 'node:http';
import open from 'open';
import os from 'os';
import path from 'path';
import readline from 'readline';
import url from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

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

// Determine if there is a local config to be processed.
const defaultLocalConfigPath = path.join(
  __dirname,
  './webpack.local-config.js'
);
let localConfigPath;
if (argv.config) {
  localConfigPath = path.resolve(argv.config);
} else if (fs.existsSync(defaultLocalConfigPath)) {
  localConfigPath = defaultLocalConfigPath;
}

let localConfigTempDir;
if (argv.profile) {
  // Need to prevent webpack from opening a browser even if requested in the
  // local config file since this code does that for the user so a temporary
  // overriding config file is created here.
  try {
    localConfigTempDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'launch-fp-')
    );
  } catch (error) {
    console.error('Unable to create launch-fp temporary directory');
    console.error(error);
    process.exit(1);
  }

  // This is the main function in that temporary config file.
  const localConfig = function (config, serverConfig) {
    // Read from original local config file.
    const localConfigPath = '<<LOCAL CONFIG PATH>>';
    const configRequirePath = `./${path.relative(__dirname, localConfigPath)}`;
    try {
      require(configRequirePath)(config, serverConfig);
    } catch (error) {
      console.error(
        `Unable to load and apply settings from ${configRequirePath}`
      );
      console.error(error);
    }

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

    return { origConfigPath: localConfigPath, openOptions };
  };

  // This is the prologue code for the temporary config file.
  const localConfigText = `  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
  // @noflow
 
  const path = require('path');

  module.exports = ${localConfig
    .toString()
    .replace('<<LOCAL CONFIG PATH>>', localConfigPath)}
  `;

  if (localConfigTempDir) {
    // Write to the temporary config file.
    try {
      await fsPromises.writeFile(
        `${localConfigTempDir}/launch-fp-webpack.local-config.js`,
        localConfigText
      );
    } catch (error) {
      console.error(`Unable to write to ${localConfigTempDir}`);
      console.log(error);
    }

    // Cleanup on CTRL-C.
    const rmTempConfigDir = () => {
      fs.rm(
        localConfigTempDir,
        { maxRetries: 10, recursive: true },
        (error) => {
          if (error) {
            console.error(`Unable to remove ${localConfigTempDir}`);
            console.error(error);
          }
        }
      );
    };
    process.on('SIGINT', rmTempConfigDir);
    process.on('SIGTERM', rmTempConfigDir);
  }
}

// Spawn the profiler server.
let configFlagVal;
if (argv.profile) {
  configFlagVal = `${localConfigTempDir}/launch-fp-webpack.local-config.js`;
} else if (argv.config) {
  configFlagVal = argv.config;
}
const fpServer = cp.spawn(
  process.argv[0],
  [
    path.join(__dirname, './server.js'),
    ...(configFlagVal ? ['--config', configFlagVal] : []),
  ],
  {
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['inherit', 'pipe', 'inherit'],
  }
);

// Wait until the profiler server is up before connecting to it, for better UX.
const fpServerStdout = readline.createInterface({ input: fpServer.stdout });
// Assumption: once there is output from the fpServer process, the server is up.
await new Promise((resolve) => {
  fpServerStdout.on('line', (line) => {
    console.log(line);
    resolve();
  });
});

if (argv.profile) {
  // Spin up a simple http server serving the profile file.
  const profileServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', profilerUrl);
    const fileStream = fs.createReadStream(argv.profile);
    fileStream.pipe(res);
  });

  // Close the profile server on CTRL-C.
  const closeProfileServer = () => {
    profileServer.close();
    // For quick profile server closing.
    profileServer.closeAllConnections();
  };
  process.on('SIGINT', closeProfileServer);
  process.on('SIGTERM', closeProfileServer);

  // Read local launch-fp webpack config.
  let configDetails;
  if (localConfigPath) {
    const config = {};
    const serverConfig = {};
    const configImportPath = `${localConfigTempDir}/launch-fp-webpack.local-config.js`;
    try {
      configDetails = (await import(configImportPath)).default(
        config,
        serverConfig
      );
    } catch (error) {
      console.error(`Unable to load settings from ${configImportPath}`);
      console.error(error);
    }
  }

  // Open on profile.
  const port = process.env.FX_PROFILER_PORT || 4242;
  const host = process.env.FX_PROFILER_HOST || 'localhost';
  const profilerUrl = `http://${host}:${port}`;
  profileServer.listen(0, host, () => {
    const profileFromUrl = `${profilerUrl}/from-url/${encodeURIComponent(
      `http://${host}:${profileServer.address().port}/${encodeURIComponent(
        path.basename(argv.profile)
      )}`
    )}`;
    open(profileFromUrl, configDetails.openOptions);
  });
}
