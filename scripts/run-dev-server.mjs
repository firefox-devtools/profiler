/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import path from 'path';
import {
  mainBundleConfig,
  sourceMapWorkerConfig,
} from './lib/esbuild-configs.mjs';
import { startDevServer } from './lib/dev-server.mjs';
import { serveAndOpenProfile } from './lib/profile-server.mjs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const isProduction = process.env.NODE_ENV === 'production';
const defaultPort = isProduction ? 4242 : 4241;
const port = parseInt(process.env.FX_PROFILER_PORT) || defaultPort;
const host = process.env.FX_PROFILER_HOST || 'localhost';

const argv = yargs(hideBin(process.argv))
  .command('* [profile]', 'Open Firefox Profiler, on [profile] if included.')
  .version(false)
  .strict()
  .parseSync();

startDevServer(mainBundleConfig, {
  port,
  host,
  distDir: 'dist',
  cleanDist: true,
  extraWatchConfigs: [sourceMapWorkerConfig],
  onServerStart: (profilerUrl) => {
    const barAscii =
      '------------------------------------------------------------------------------------------';

    console.log(barAscii);
    console.log(`> Firefox Profiler is listening at: ${profilerUrl}\n`);

    if (port === defaultPort) {
      console.log(
        '> You can change this default port with the environment variable FX_PROFILER_PORT.\n'
      );
    }

    console.log(
      `> esbuild ${isProduction ? 'production' : 'development'} build with live rebuilds enabled`
    );
    console.log(barAscii);

    if (argv.profile) {
      const resolvedProfile = path.resolve(argv.profile);
      serveAndOpenProfile(host, profilerUrl, resolvedProfile);
    }
  },
}).catch(console.error);
