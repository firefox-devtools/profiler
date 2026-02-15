/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { startDevServer } from './lib/dev-server.mjs';
import { photonConfig } from './lib/esbuild-configs.mjs';

const port = parseInt(process.env.FX_PROFILER_PHOTON_PORT) || 4243;
const host = process.env.FX_PROFILER_PHOTON_HOST || 'localhost';

startDevServer(photonConfig, {
  port,
  host,
  distDir: 'dist',
  fallback: 'photon/index.html',
  cleanDist: false, // Don't clean the whole dist, just photon
  onServerStart: (url) => {
    console.log(`> Photon styling is listening at: ${url}/photon/\n`);
  },
}).catch(console.error);
