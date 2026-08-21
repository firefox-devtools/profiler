/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';

import {
  mainBundleConfig,
  sourceMapWorkerConfig,
  benchmarkCompareWorkerConfig,
  getWorkerPath,
} from './lib/esbuild-configs.mjs';
import { cleanDist, saveMetafile } from './lib/build-utils.mjs';

async function build() {
  cleanDist();

  // Build the workers first so we can read their output paths from their
  // metafiles and inject them into the main bundle as defines.
  const [sourceMapWorker, benchmarkCompareWorker] = await Promise.all([
    esbuild.build(sourceMapWorkerConfig),
    esbuild.build(benchmarkCompareWorkerConfig),
  ]);

  const buildResult = await esbuild.build({
    ...mainBundleConfig,
    define: {
      ...mainBundleConfig.define,
      SOURCE_MAP_WORKER_PATH: JSON.stringify(
        getWorkerPath(sourceMapWorkerConfig, sourceMapWorker.metafile)
      ),
      BENCHMARK_COMPARE_WORKER_PATH: JSON.stringify(
        getWorkerPath(
          benchmarkCompareWorkerConfig,
          benchmarkCompareWorker.metafile
        )
      ),
    },
  });

  saveMetafile(buildResult);
  console.log('✅ Main browser build and workers completed');
}

build().catch(console.error);
