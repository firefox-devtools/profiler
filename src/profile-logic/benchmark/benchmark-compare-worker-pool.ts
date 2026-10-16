/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Computing the benchmark comparison's bucket tables on other threads.
 *
 * A `TableRunner` (see run-benchmark-comparison.ts) backed by a pool of workers,
 * which is what the compare page uses. Slicing the work already keeps the page
 * responsive; this is what makes it *finish sooner* — ~2.6s of arithmetic on one
 * thread against a few hundred milliseconds spread over eight.
 *
 * There are two levels of parallelism to be had, and the pool uses both:
 *
 *  - **the tables are independent of each other**, so a subtest table gets a
 *    thread of its own; and
 *  - **the permutation draws within one table are independent**, so the global
 *    table — which, once the subtests are spread out, is the whole critical path —
 *    is split across every thread by draw range and combined here. See
 *    `computeBucketTableShardInSlices` and `combineFamilyPartials`. The combined
 *    result is exactly what one thread would have produced, which is a
 *    requirement rather than a nicety: the q-values decide what the report shows,
 *    and two readers must not be told different things about the same two profiles
 *    because their machines have different numbers of cores.
 */

import { combineBucketTableShards } from './compare-benchmark-stats';
import type {
  BucketComparison,
  BucketTableShard,
} from './compare-benchmark-stats';
import { packBuckets } from './benchmark-compare-worker-types';
import type {
  PackedBuckets,
  WorkerInput,
  WorkerOutput,
} from './benchmark-compare-worker-types';
import { createInProcessTableRunner } from './run-benchmark-comparison';
import type {
  BucketTableJob,
  TableRunner,
  TableRunnerSetup,
} from './run-benchmark-comparison';

/**
 * Most threads to spawn, and so also the most ways one table's draws get split.
 *
 * Capped because splitting a table is not free: every shard repeats the whole
 * set-up — matching the two sides' buckets and taking a Welch t of each, ~150ms
 * for the global view — and only divides the ~850ms of draws that follow. At eight
 * shards each is ~150ms of set-up and ~105ms of draws, so the next doubling would
 * take about 50ms off the table while costing another 150ms of machine per shard,
 * plus another copy of the job. There is also a whole browser here that wants a
 * core to itself.
 */
const MAX_WORKERS = 8;

/** Used when `navigator.hardwareConcurrency` says nothing. Low on purpose:
 * guessing high on a two-core machine oversubscribes it, and a table split more
 * ways than there are cores to run them takes *longer* than it would have on
 * one. */
const ASSUMED_CORE_COUNT = 4;

/**
 * A `TableRunner` that computes the tables in workers — or in-process, if this
 * environment has no workers to give.
 */
export function createBenchmarkTableWorkerPool(
  setup: TableRunnerSetup
): TableRunner {
  if (typeof Worker !== 'function' || setup.jobCount === 0) {
    return createInProcessTableRunner(setup);
  }
  return createTableWorkerPool(setup, {
    spawn: () => new Worker(BENCHMARK_COMPARE_WORKER_PATH),
  });
}

/** One worker and what it is doing, if anything. */
type PoolWorker = {
  worker: Worker;
  /** The shard it was last given, or null if it is idle. */
  current: QueuedShard | null;
};

/** One shard of one table, waiting for a thread or running on one. */
type QueuedShard = {
  requestId: number;
  table: PendingTable;
  index: number;
};

/** A table with at least one shard still outstanding. */
type PendingTable = {
  job: BucketTableJob;
  shardCount: number;
  /** The job's weights in wire form, built when the first of its shards is
   * dispatched and then cloned into each shard's message. */
  packed: { base: PackedBuckets; new: PackedBuckets } | null;
  shards: BucketTableShard[];
  resolve: (comparisons: BucketComparison[]) => void;
  reject: (error: Error) => void;
  settled: boolean;
};

/**
 * The pool proper, with the two things a test needs to control taken as
 * arguments: where a worker comes from, and how many of them there are.
 */
export function createTableWorkerPool(
  setup: TableRunnerSetup,
  options: { spawn: () => Worker; workerCount?: number }
): TableRunner {
  const workerCount = Math.max(
    1,
    Math.min(MAX_WORKERS, options.workerCount ?? coreCount())
  );

  const workers: PoolWorker[] = [];
  const queue: QueuedShard[] = [];
  let nextRequestId = 0;
  let disposed = false;

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    // The whole cancellation story, and a better one than the main-thread path
    // can manage: no cooperative checks, and no waiting for a slice to end.
    for (const entry of workers) {
      entry.worker.terminate();
    }
    workers.length = 0;
    queue.length = 0;
  };

  const settle = (table: PendingTable, report: () => void) => {
    if (table.settled) {
      return;
    }
    table.settled = true;
    // Whether it worked out or not, the job's weights have been sent to everything
    // that was going to get them, and the combine only needed what came back. For
    // the global table that is 12MB.
    table.packed = null;
    report();
  };

  /** Give up on the whole pool: nothing here is recoverable per-table. */
  const failEverything = (error: Error) => {
    const outstanding = new Set<PendingTable>();
    for (const entry of workers) {
      if (entry.current !== null) {
        outstanding.add(entry.current.table);
      }
    }
    for (const shard of queue) {
      outstanding.add(shard.table);
    }
    dispose();
    for (const table of outstanding) {
      settle(table, () => table.reject(error));
    }
  };

  /** Fill idle threads from the queue, until one of the two runs out. */
  const pump = () => {
    for (const entry of workers) {
      if (entry.current !== null) {
        continue;
      }
      const shard = queue.shift();
      if (shard === undefined) {
        return;
      }
      entry.current = shard;
      const { table } = shard;
      if (table.packed === null) {
        table.packed = {
          base: packBuckets(table.job.baseBuckets, table.job.iterationCount),
          new: packBuckets(table.job.newBuckets, table.job.iterationCount),
        };
      }
      const message: WorkerInput = {
        type: 'job',
        requestId: shard.requestId,
        base: table.packed.base,
        new: table.packed.new,
        iterationCount: table.job.iterationCount,
        shardIndex: shard.index,
        shardCount: table.shardCount,
      };
      entry.worker.postMessage(message);
    }
  };

  const onWorkerMessage = (entry: PoolWorker, output: WorkerOutput) => {
    const shard = entry.current;
    if (shard === null || shard.requestId !== output.requestId) {
      // A message about a shard we are no longer waiting for. Cannot happen with
      // one shard in flight per worker; ignoring it is the safe reading if it
      // ever does.
      return;
    }
    entry.current = null;
    const { table } = shard;
    if (output.type === 'error') {
      settle(table, () =>
        table.reject(
          new Error(
            `Computing the bucket table for "${table.job.label}" failed: ${output.message}`
          )
        )
      );
    } else {
      table.shards.push(output.shard);
      if (table.shards.length === table.shardCount) {
        try {
          const comparisons = combineBucketTableShards(
            table.shards,
            setup.meta
          );
          settle(table, () => table.resolve(comparisons));
        } catch (err) {
          settle(table, () => table.reject(toError(err)));
        }
      }
    }
    pump();
  };

  for (let i = 0; i < workerCount; i++) {
    const worker = options.spawn();
    const entry: PoolWorker = { worker, current: null };
    worker.onmessage = (e: MessageEvent<WorkerOutput>) =>
      onWorkerMessage(entry, e.data);
    worker.onerror = (e: ErrorEvent) => {
      // A worker that failed to load, or died outright. There is nothing to retry
      // against — every worker runs the same bundle on data that came from here —
      // so the comparison fails rather than quietly taking seconds longer than
      // the page has led the reader to expect.
      failEverything(
        new Error(
          e.message || 'The benchmark comparison worker could not be started.'
        )
      );
    };
    workers.push(entry);
    // Once per worker rather than once per job: the same answer for every table,
    // and every table needs all of it. Three Int32Arrays; `setup.meta`, which is
    // where the strings are, stays here.
    const init: WorkerInput = { type: 'init', keys: setup.keys };
    worker.postMessage(init);
  }

  setup.signal.addEventListener('abort', () =>
    failEverything(toError(setup.signal.reason))
  );
  if (setup.signal.aborted) {
    failEverything(toError(setup.signal.reason));
  }

  return {
    run: (job) => {
      if (disposed) {
        return Promise.reject(
          new Error('This benchmark comparison has already been abandoned.')
        );
      }
      const shardCount = job.splitAcrossThreads ? workers.length : 1;
      return new Promise<BucketComparison[]>((resolve, reject) => {
        const table: PendingTable = {
          job,
          shardCount,
          packed: null,
          shards: [],
          resolve,
          reject,
          settled: false,
        };
        for (let index = 0; index < shardCount; index++) {
          queue.push({ requestId: nextRequestId++, table, index });
        }
        pump();
      });
    },
    dispose,
  };
}

function coreCount(): number {
  if (typeof navigator !== 'object' || navigator === null) {
    return ASSUMED_CORE_COUNT;
  }
  return navigator.hardwareConcurrency || ASSUMED_CORE_COUNT;
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}
