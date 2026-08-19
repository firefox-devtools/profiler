/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * What goes over the wire between the main thread and a benchmark compare worker.
 *
 * Imported by both sides, and by nothing else. Deliberately free of anything that
 * would pull the worker's bundle into the main one, or vice versa.
 */

import type { SparseBucketEntry } from './extract-benchmark-stats';
import type {
  BucketTableShard,
  BucketTableSide,
} from './compare-benchmark-stats';

/**
 * One side of a table job's weights, as one typed array rather than as a list of
 * views into whichever buffer they came out of.
 *
 * This exists because of how structured clone treats a typed array: it copies the
 * view's *whole* underlying buffer. The bucket lists a job is built from are
 * `subarray` views into one `Float64Array` per suite — see the allocation in
 * `computeGlobalBuckets` and the `subarray` in `extractBenchmarkStatsFromProfile`
 * — and that buffer covers every bucket in the profile at every iteration, 17MB
 * for a Speedometer 3 pair, where the job itself needs a third of it. Sending the
 * views would clone the whole thing (once per buffer, since clone preserves
 * identity within a single `postMessage`, but once is enough), and the phase-2
 * split sends the same job to every worker, so it would be 17MB × workers.
 *
 * Packing costs one copy of what is actually needed, on the main thread, and makes
 * the wire size proportional to the table rather than to the profile.
 *
 * Not transferred, either: the main thread still needs those weights for the other
 * tables and for the flame graphs.
 */
export type PackedBuckets = {
  /** `bucketIndex` per entry, in the order the entries were packed. */
  bucketIndices: Int32Array;
  /** `entryCount × iterationCount` weights: entry `e`'s iteration `i` at
   * `e * iterationCount + i`. */
  iterationTotals: Float64Array;
};

export function packBuckets(
  buckets: SparseBucketEntry[],
  iterationCount: number
): PackedBuckets {
  const bucketIndices = new Int32Array(buckets.length);
  const iterationTotals = new Float64Array(buckets.length * iterationCount);
  for (let e = 0; e < buckets.length; e++) {
    const entry = buckets[e];
    bucketIndices[e] = entry.bucketIndex;
    const base = e * iterationCount;
    for (let i = 0; i < iterationCount; i++) {
      iterationTotals[base + i] = entry.iterationTotals[i];
    }
  }
  return { bucketIndices, iterationTotals };
}

/** The inverse, as views into the packed buffer — so no second copy, and the
 * entries are the same shape the comparison expects. */
export function unpackBuckets(
  packed: PackedBuckets,
  iterationCount: number
): SparseBucketEntry[] {
  const { bucketIndices, iterationTotals } = packed;
  const buckets: SparseBucketEntry[] = [];
  for (let e = 0; e < bucketIndices.length; e++) {
    const base = e * iterationCount;
    buckets.push({
      bucketIndex: bucketIndices[e],
      iterationTotals: iterationTotals.subarray(base, base + iterationCount),
    });
  }
  return buckets;
}

/**
 * The two profiles' bucket metadata, sent once per worker rather than once per
 * job. A few thousand strings each, and every job needs all of it.
 */
export type WorkerInit = {
  type: 'init';
  base: BucketTableSide;
  new: BucketTableSide;
};

/** One shard of one table. `shardCount` is how many of these the pool split this
 * table into; see `computeBucketTableShardInSlices`. */
export type WorkerJob = {
  type: 'job';
  requestId: number;
  base: PackedBuckets;
  new: PackedBuckets;
  iterationCount: number;
  shardIndex: number;
  shardCount: number;
};

export type WorkerInput = WorkerInit | WorkerJob;

export type WorkerOutput =
  | { type: 'shard'; requestId: number; shard: BucketTableShard }
  /** Anything thrown while computing a shard, since a worker cannot reject a
   * promise. */
  | { type: 'error'; requestId: number; message: string };
