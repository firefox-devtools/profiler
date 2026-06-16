/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';

import {
  mainBundleConfig,
  sourceMapWorkerConfig,
  getSourceMapWorkerPath,
} from './lib/esbuild-configs.mjs';
import { cleanDist, saveMetafile } from './lib/build-utils.mjs';

async function build() {
  cleanDist();

  // Build the worker first so we can read its output path from the metafile
  // and inject it into the main bundle via SOURCE_MAP_WORKER_PATH.
  const workerResult = await esbuild.build(sourceMapWorkerConfig);

  const buildResult = await esbuild.build({
    ...mainBundleConfig,
    define: {
      ...mainBundleConfig.define,
      SOURCE_MAP_WORKER_PATH: JSON.stringify(
        getSourceMapWorkerPath(workerResult.metafile)
      ),
    },
  });

  saveMetafile(buildResult);
  console.log('✅ Main browser build and source map worker completed');
}

build().catch(console.error);
