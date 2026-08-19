/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Web Worker entry point for the benchmark comparison's bucket tables.
 *
 * Takes one `init` message with the two profiles' bucket metadata, then a `job`
 * per shard of a table, and answers each with the shard's rows and its share of
 * the family correction. The reason this is cheap to have at all: **nothing here
 * needs a `Profile`.** A job is two lists of per-iteration weights and some
 * strings, single megabytes, against the several hundred a parsed profile weighs.
 *
 * `runToCompletion`, not `runInSlices`: slicing exists to keep a page painting,
 * and a worker has no page. Cancellation is `worker.terminate()` for the same
 * reason — there is nothing here to leave in an inconsistent state.
 *
 * Must be built as a separate esbuild bundle (see benchmarkCompareWorkerConfig),
 * since a worker cannot load the main bundle's ES modules.
 */

import { runToCompletion } from './chunked-work';
import { computeBucketTableShardInSlices } from './compare-benchmark-stats';
import { unpackBuckets } from './benchmark-compare-worker-types';
import type {
  WorkerInit,
  WorkerInput,
  WorkerOutput,
} from './benchmark-compare-worker-types';

// Override the `self` type: in the browser this file runs as a DedicatedWorker,
// but TypeScript's DOM lib types `self` as `Window & typeof globalThis`. Same
// approach as source-map.worker.ts.
interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerInput>) => void) | null;
  postMessage: (message: WorkerOutput) => void;
}
const scope = self as unknown as WorkerScope;

/** The bucket metadata from the `init` message, kept for every job after it. */
let sides: WorkerInit | null = null;

scope.onmessage = (e: MessageEvent<WorkerInput>) => {
  const message = e.data;
  if (message.type === 'init') {
    sides = message;
    return;
  }
  try {
    if (sides === null) {
      throw new Error('A benchmark compare job arrived before the metadata.');
    }
    const { requestId, iterationCount, shardIndex, shardCount } = message;
    const shard = runToCompletion(
      computeBucketTableShardInSlices(
        {
          base: sides.base,
          new: sides.new,
          baseBuckets: unpackBuckets(message.base, iterationCount),
          newBuckets: unpackBuckets(message.new, iterationCount),
          iterationCount,
        },
        { index: shardIndex, count: shardCount }
      )
    );
    scope.postMessage({ type: 'shard', requestId, shard });
  } catch (err) {
    scope.postMessage({
      type: 'error',
      requestId: message.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
