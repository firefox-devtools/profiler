/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Web Worker entry point for the benchmark comparison's bucket tables.
 *
 * Takes one `init` message saying which of the two profiles' buckets match, then a
 * `job` per shard of a table, and answers each with the shard's rows and its share
 * of the family correction. The reason this is cheap to have at all: **nothing here
 * needs a `Profile`**, or for that matter a string. A job is two lists of
 * per-iteration weights, single megabytes, against the several hundred a parsed
 * profile weighs; what a row is called is looked up by the main thread once the row
 * gets there. See `matchBucketKeys` and `resolveBucketTableRows`.
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
  WorkerInput,
  WorkerOutput,
} from './benchmark-compare-worker-types';
import type { MatchedBucketKeys } from './compare-benchmark-stats';

// Override the `self` type: in the browser this file runs as a DedicatedWorker,
// but TypeScript's DOM lib types `self` as `Window & typeof globalThis`. Same
// approach as source-map.worker.ts.
interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerInput>) => void) | null;
  postMessage: (message: WorkerOutput) => void;
}
const scope = self as unknown as WorkerScope;

/** The bucket matching from the `init` message, kept for every job after it. */
let keys: MatchedBucketKeys | null = null;

scope.onmessage = (e: MessageEvent<WorkerInput>) => {
  const message = e.data;
  if (message.type === 'init') {
    keys = message.keys;
    return;
  }
  try {
    if (keys === null) {
      throw new Error('A benchmark compare job arrived before the metadata.');
    }
    const { requestId, iterationCount, shardIndex, shardCount } = message;
    const shard = runToCompletion(
      computeBucketTableShardInSlices(
        {
          keys,
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
