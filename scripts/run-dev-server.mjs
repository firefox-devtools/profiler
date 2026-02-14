/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import path from 'path';
import { mainBundleConfig } from './lib/esbuild-configs.mjs';
import { startDevServer } from './lib/dev-server.mjs';
import { serveAndOpenProfile } from './lib/profile-server.mjs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const port = parseInt(process.env.FX_PROFILER_PORT) || 4242;
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
  onServerStart: (profilerUrl) => {
    const barAscii =
      '------------------------------------------------------------------------------------------';

    console.log(barAscii);
    console.log(`> Firefox Profiler is listening at: ${profilerUrl}\n`);

    if (port === 4242) {
      console.log(
        '> You can change this default port with the environment variable FX_PROFILER_PORT.\n'
      );
    }

    console.log('> esbuild development server enabled');
    console.log(barAscii);

    if (argv.profile) {
      const resolvedProfile = path.resolve(argv.profile);
      serveAndOpenProfile(host, profilerUrl, resolvedProfile);
    }
  },
}).catch(console.error);
