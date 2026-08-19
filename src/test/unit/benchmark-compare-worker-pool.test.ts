/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The worker pool, driven against a fake `Worker` that runs the real worker's
 * message handler in-process.
 *
 * So this is an end-to-end test of everything except the thread: the pool's
 * scheduling, the wire format both ways (including the packing that keeps a job
 * from dragging the whole profile's weight buffer along with it), the worker's own
 * dispatch, and the combining of the shards. What it buys over testing the pieces
 * separately is the property the whole exercise is for — that the table a pool of
 * threads produces is *exactly* the table one thread would have — asserted across
 * the actual protocol rather than across a direct call.
 */

import { createTableWorkerPool } from '../../profile-logic/benchmark/benchmark-compare-worker-pool';
import { compareBuckets } from '../../profile-logic/benchmark/compare-benchmark-stats';
import type { BucketTableSide } from '../../profile-logic/benchmark/compare-benchmark-stats';
import type {
  WorkerInit,
  WorkerInput,
  WorkerJob,
  WorkerOutput,
} from '../../profile-logic/benchmark/benchmark-compare-worker-types';
import type {
  BucketTableJob,
  TableRunnerSetup,
} from '../../profile-logic/benchmark/run-benchmark-comparison';
import type { SparseBucketEntry } from '../../profile-logic/benchmark/extract-benchmark-stats';

// Importing the worker module installs its `onmessage` on the global scope, which
// is what a `DedicatedWorkerGlobalScope` would have done. Grabbed here so the fake
// worker can call it; the module keeps no state beyond the metadata from its
// `init` message, so one copy of it can stand in for every worker in the pool as
// long as they are all initialised the same way — which the pool does.
import '../../profile-logic/benchmark/benchmark-compare.worker';

type WorkerScope = {
  onmessage: (e: { data: WorkerInput }) => void;
  postMessage: (message: WorkerOutput) => void;
};
const workerScope = self as unknown as WorkerScope;
const handleInWorker = workerScope.onmessage;

/**
 * A `Worker` that answers when the test tells it to, so the completion order is
 * the test's to choose rather than the scheduler's.
 */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<WorkerOutput>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  inits: WorkerInit[] = [];
  pending: WorkerJob[] = [];

  constructor() {
    FakeWorker.all.push(this);
  }

  postMessage(message: WorkerInput) {
    if (message.type === 'init') {
      this.inits.push(message);
      // Straight through: the metadata is all the worker keeps between messages,
      // and the pool sends every worker the same. Jobs wait for `answer()`.
      handleInWorker({ data: message });
    } else {
      this.pending.push(message);
    }
  }

  terminate() {
    this.terminated = true;
  }

  /** Run the oldest outstanding shard through the real worker code and deliver
   * whatever it posts back. */
  answer() {
    const job = this.pending.shift();
    if (job === undefined) {
      throw new Error('This worker has nothing outstanding to answer.');
    }
    const restore = workerScope.postMessage;
    workerScope.postMessage = (output: WorkerOutput) => this.deliver(output);
    try {
      handleInWorker({ data: job });
    } finally {
      workerScope.postMessage = restore;
    }
  }

  deliver(output: WorkerOutput) {
    this.onmessage?.(new MessageEvent('message', { data: output }));
  }

  fail(message: string) {
    this.onerror?.(new ErrorEvent('error', { message }));
  }
}

/** Answer every worker that has something outstanding, once each. */
function answerAll() {
  for (const worker of FakeWorker.all) {
    if (worker.pending.length > 0) {
      worker.answer();
    }
  }
}

/** A family of buckets whose weights look like real ones: small counts, zero in
 * most iterations, one of them plainly moved. Deterministic. */
function makeFixture(bucketCount: number) {
  const iterationCount = 16;
  let seed = 19731;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const draw = (shift: number = 0) =>
    Array.from(
      { length: iterationCount },
      () => shift + (random() < 0.35 ? 1 : 0)
    );

  const bucketNames = ['mover'];
  const baseBuckets: SparseBucketEntry[] = [
    { bucketIndex: 0, iterationTotals: draw() },
  ];
  const newBuckets: SparseBucketEntry[] = [
    { bucketIndex: 0, iterationTotals: draw(3) },
  ];
  for (let i = 1; i < bucketCount; i++) {
    bucketNames.push(`noise${i}`);
    baseBuckets.push({ bucketIndex: i, iterationTotals: draw() });
    newBuckets.push({ bucketIndex: i, iterationTotals: draw() });
  }
  const side: BucketTableSide = {
    bucketNames,
    bucketKeys: bucketNames,
    bucketFuncs: bucketNames.map((_, i) => i),
  };
  return { side, baseBuckets, newBuckets, iterationCount };
}

const FIXTURE = makeFixture(60);

function makeJob(
  label: string,
  splitAcrossThreads: boolean,
  buckets: {
    baseBuckets: SparseBucketEntry[];
    newBuckets: SparseBucketEntry[];
  } = FIXTURE
): BucketTableJob {
  return {
    label,
    baseBuckets: buckets.baseBuckets,
    newBuckets: buckets.newBuckets,
    iterationCount: FIXTURE.iterationCount,
    splitAcrossThreads,
  };
}

function makePool(workerCount: number, jobCount: number = 1) {
  const controller = new AbortController();
  const setup: TableRunnerSetup = {
    base: FIXTURE.side,
    new: FIXTURE.side,
    jobCount,
    signal: controller.signal,
  };
  const pool = createTableWorkerPool(setup, {
    spawn: () => new FakeWorker() as unknown as Worker,
    workerCount,
  });
  return { pool, controller, workers: FakeWorker.all };
}

/** The answer one thread would have given, which is what the pool has to match. */
function singleThreaded() {
  return compareBuckets(
    FIXTURE.baseBuckets,
    FIXTURE.newBuckets,
    FIXTURE.side.bucketNames,
    FIXTURE.side.bucketNames,
    FIXTURE.side.bucketFuncs,
    FIXTURE.side.bucketFuncs,
    FIXTURE.iterationCount,
    false,
    FIXTURE.side.bucketKeys,
    FIXTURE.side.bucketKeys
  );
}

describe('the benchmark compare worker', function () {
  // First, because the worker's metadata is module state and the pool tests below
  // set it. The pool cannot produce this case — it posts the init as it spawns each
  // worker — but the worker should say so rather than read a side it does not have.
  it('refuses a job that arrives before the metadata', function () {
    const answers: WorkerOutput[] = [];
    const restore = workerScope.postMessage;
    workerScope.postMessage = (output: WorkerOutput) => answers.push(output);
    const empty = {
      bucketIndices: new Int32Array(0),
      iterationTotals: new Float64Array(0),
    };
    try {
      handleInWorker({
        data: {
          type: 'job',
          requestId: 7,
          base: empty,
          new: empty,
          iterationCount: 4,
          shardIndex: 0,
          shardCount: 1,
        },
      });
    } finally {
      workerScope.postMessage = restore;
    }
    expect(answers).toEqual([
      {
        type: 'error',
        requestId: 7,
        message: 'A benchmark compare job arrived before the metadata.',
      },
    ]);
  });
});

describe('createTableWorkerPool', function () {
  beforeEach(function () {
    FakeWorker.all = [];
  });

  it('sends the bucket metadata once per worker, before any job', function () {
    const { workers } = makePool(4);
    expect(workers).toHaveLength(4);
    for (const worker of workers) {
      // A few thousand strings that every job needs all of: once each, not once
      // per table.
      expect(worker.inits).toHaveLength(1);
      expect(worker.inits[0].base.bucketNames).toBe(FIXTURE.side.bucketNames);
      expect(worker.pending).toHaveLength(0);
    }
  });

  it('splits a table across every thread and gets exactly the single-threaded answer', async function () {
    for (const workerCount of [1, 3, 8]) {
      FakeWorker.all = [];
      const { pool, workers } = makePool(workerCount);
      const table = pool.run(makeJob('Overall', true));
      // One shard each, and they say so: shard 0 of N through shard N-1 of N.
      expect(
        workers.map((worker) => worker.pending.map((job) => job.shardIndex))
      ).toEqual(workers.map((_, i) => [i]));
      expect(workers[0].pending[0].shardCount).toBe(workerCount);
      answerAll();
      expect({ workerCount, table: await table }).toEqual({
        workerCount,
        table: singleThreaded(),
      });
      pool.dispose();
    }
  });

  it('packs a job into one pair of typed arrays rather than sending the views', function () {
    const { pool, workers } = makePool(2);
    pool.run(makeJob('Overall', true));
    const [{ base }] = workers[0].pending;
    // The point of packing: the wire size is the table's, not the whole
    // profile's. A view into the profile-wide weights buffer would have carried
    // that entire buffer along with it, once per shard.
    expect(base.bucketIndices).toHaveLength(FIXTURE.baseBuckets.length);
    expect(base.iterationTotals).toHaveLength(
      FIXTURE.baseBuckets.length * FIXTURE.iterationCount
    );
    // Both shards were handed the same packed arrays to clone.
    expect(workers[1].pending[0].base.iterationTotals).toBe(
      base.iterationTotals
    );
    pool.dispose();
  });

  it('gives an unsplit table one thread, and the rest to the tables after it', async function () {
    const { pool, workers } = makePool(3, 3);
    const first = pool.run(makeJob('Alpha', false));
    const second = pool.run(makeJob('Beta', false));
    expect(workers.map((worker) => worker.pending.length)).toEqual([1, 1, 0]);
    expect(workers[0].pending[0].shardCount).toBe(1);

    // Answered out of dispatch order, which is the whole reason the caller takes
    // the tables as they arrive.
    workers[1].answer();
    await expect(second).resolves.toEqual(singleThreaded());
    workers[0].answer();
    await expect(first).resolves.toEqual(singleThreaded());
    pool.dispose();
  });

  it('queues shards it has no thread for yet', async function () {
    const { pool, workers } = makePool(2, 2);
    const split = pool.run(makeJob('Overall', true));
    const queued = pool.run(makeJob('Alpha', false));
    // Both threads are on the split table; the subtest waits its turn.
    expect(workers.map((worker) => worker.pending.length)).toEqual([1, 1]);
    workers[0].answer();
    // Freeing one thread starts the queued table on it, without waiting for the
    // other shard.
    expect(workers[0].pending).toHaveLength(1);
    expect(workers[0].pending[0].shardCount).toBe(1);
    workers[1].answer();
    await expect(split).resolves.toEqual(singleThreaded());
    workers[0].answer();
    await expect(queued).resolves.toEqual(singleThreaded());
    pool.dispose();
  });

  it('terminates every worker when the comparison is aborted', async function () {
    const { pool, controller, workers } = makePool(3, 2);
    const running = pool.run(makeJob('Overall', true));
    const alsoRunning = pool.run(makeJob('Alpha', false));
    running.catch(() => {});
    alsoRunning.catch(() => {});
    expect(workers.every((worker) => worker.terminated)).toBe(false);

    controller.abort(new Error('the reader moved on'));
    // No cooperative check to wait for and no slice to finish: the threads are
    // stopped where they stand, which is better than the main-thread path can do.
    expect(workers.every((worker) => worker.terminated)).toBe(true);
    await expect(running).rejects.toThrow('the reader moved on');
    await expect(alsoRunning).rejects.toThrow('the reader moved on');
    await expect(pool.run(makeJob('Beta', false))).rejects.toThrow(
      'already been abandoned'
    );
  });

  it('terminates every worker when the comparison finishes', async function () {
    const { pool, workers } = makePool(2);
    const table = pool.run(makeJob('Overall', true));
    answerAll();
    await table;
    expect(workers.every((worker) => worker.terminated)).toBe(false);
    pool.dispose();
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });

  it('reports a shard that threw, naming the table it was for', async function () {
    const { pool, workers } = makePool(2);
    const table = pool.run(makeJob('Overall', true));
    table.catch(() => {});
    workers[0].deliver({
      type: 'error',
      requestId: workers[0].pending[0].requestId,
      message: 'out of memory',
    });
    await expect(table).rejects.toThrow(
      'Computing the bucket table for "Overall" failed: out of memory'
    );
  });

  it('fails the comparison when a worker cannot be started', async function () {
    const { pool, workers } = makePool(2, 2);
    const first = pool.run(makeJob('Overall', true));
    const second = pool.run(makeJob('Alpha', false));
    first.catch(() => {});
    second.catch(() => {});
    // Every worker runs the same bundle, so there is nothing to retry against.
    workers[0].fail('Failed to load benchmark-compare.worker.js');
    await expect(first).rejects.toThrow('Failed to load');
    await expect(second).rejects.toThrow('Failed to load');
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });
});
