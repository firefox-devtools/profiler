/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';

import {
  mainBundleConfig,
  sourceMapWorkerConfig,
  getSourceMapWorkerPath,
  formatWorkerConfig,
  getFormatWorkerPath,
} from './lib/esbuild-configs.mjs';
import { cleanDist, saveMetafile } from './lib/build-utils.mjs';

async function build() {
  cleanDist();

  // Build the workers first so we can read their output paths from the
  // metafiles and inject them into the main bundle via SOURCE_MAP_WORKER_PATH
  // and FORMAT_WORKER_PATH.
  const workerEntryNames =
    process.env.NODE_ENV === 'production' ? '[name]-[hash]' : '[name]';
  const [workerResult, formatWorkerResult] = await Promise.all([
    esbuild.build({ ...sourceMapWorkerConfig, entryNames: workerEntryNames }),
    esbuild.build({ ...formatWorkerConfig, entryNames: workerEntryNames }),
  ]);

  const buildResult = await esbuild.build({
    ...mainBundleConfig,
    define: {
      ...mainBundleConfig.define,
      SOURCE_MAP_WORKER_PATH: JSON.stringify(
        getSourceMapWorkerPath(workerResult.metafile)
      ),
      FORMAT_WORKER_PATH: JSON.stringify(
        getFormatWorkerPath(formatWorkerResult.metafile)
      ),
    },
  });

  saveMetafile(buildResult);
  console.log('✅ Main browser build and workers completed');
}

build().catch(console.error);
