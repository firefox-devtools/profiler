/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  compareStatsProgressively,
  createInProcessTableRunner,
} from '../../profile-logic/benchmark/run-benchmark-comparison';
import type {
  BucketTableJob,
  ComparisonProgress,
  TableRunnerFactory,
} from '../../profile-logic/benchmark/run-benchmark-comparison';
import type { ProfileBenchmarkStats } from '../../profile-logic/benchmark/extract-benchmark-stats';
import type { Profile } from '../../types';

/** Same shape as the helper in compare-benchmark-stats.test.ts: buckets are
 * identified by index into `bucketNames`, and each suite lists
 * `[bucketIndex, perIterationWeights]` pairs. */
function makeStats(
  bucketNames: string[],
  suites: Array<{ suiteName: string; buckets: Array<[number, number[]]> }>
): ProfileBenchmarkStats {
  return {
    bucketNames,
    bucketKeys: bucketNames,
    bucketFuncs: bucketNames.map((_, i) => i),
    suites: suites.map(({ suiteName, buckets }) => ({
      suiteName,
      iterationCount: buckets[0][1].length,
      buckets: buckets.map(([bucketIndex, iterationTotals]) => ({
        bucketIndex,
        iterationTotals,
      })),
    })),
  };
}

const WEIGHTS = [3, 4, 3, 5, 4, 3, 4, 5];

/** Two profiles that ran the subtests "Alpha" and "Beta", plus a "Gamma" that
 * only the base profile ran — so there is a score row with no bucket table. */
function makePair() {
  const bucketNames = ['alphaFunc', 'betaFunc', 'gammaFunc'];
  const suite = (name: string, bucket: number, scale: number) => ({
    suiteName: name,
    buckets: [[bucket, WEIGHTS.map((w) => w * scale)]] as Array<
      [number, number[]]
    >,
  });
  return {
    baseStats: makeStats(bucketNames, [
      suite('Beta', 1, 1),
      suite('Alpha', 0, 1),
      suite('Gamma', 2, 1),
    ]),
    newStats: makeStats(bucketNames, [
      suite('Beta', 1, 2),
      suite('Alpha', 0, 1),
    ]),
  };
}

const SOURCES = {
  baseViewerUrl: 'https://profiler.firefox.com/public/base/',
  newViewerUrl: 'https://profiler.firefox.com/public/new/',
  // Only carried through to the snapshots, for the flame graphs that a test
  // never opens.
  baseProfile: {} as Profile,
  newProfile: {} as Profile,
};

async function collect(
  options: { signal?: AbortSignal; makeRunner?: TableRunnerFactory } = {}
): Promise<ComparisonProgress[]> {
  const { baseStats, newStats } = makePair();
  const snapshots = [];
  for await (const progress of compareStatsProgressively(
    baseStats,
    newStats,
    SOURCES,
    options.signal ?? new AbortController().signal,
    options.makeRunner
  )) {
    snapshots.push(progress);
  }
  return snapshots;
}

describe('compareStatsProgressively', function () {
  it('reports the score rows before any bucket table', async function () {
    const [first] = await collect();
    expect(first.scores.overallScore.label).toBe(
      'Overall (geomean-normalised)'
    );
    expect(first.scores.suiteScores.map((row) => row.label)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    expect(first.bucketTables.size).toBe(0);
    // Gamma is not pending: the new profile did not run it, so its row has
    // nothing to expand and should say so straight away rather than spin.
    expect(first.pendingLabels).toEqual([
      'Overall (geomean-normalised)',
      'Alpha',
      'Beta',
    ]);
  });

  it('adds one bucket table per snapshot', async function () {
    // One *more* table per snapshot, not a particular table: the tables are
    // computed in parallel when a runner has threads to spare, so which one lands
    // first is up to how long each took. The UI reads `bucketTables` and
    // `pendingLabels` as sets, so it does not care -- see the badge and the
    // spinner in BenchmarkCompareViewer.
    const snapshots = await collect();
    expect(snapshots.map((s) => s.bucketTables.size)).toEqual([0, 1, 2, 3]);
    expect(snapshots.map((s) => s.pendingLabels.length)).toEqual([3, 2, 1, 0]);
    const last = snapshots[snapshots.length - 1];
    expect([...last.bucketTables.keys()].sort()).toEqual([
      'Alpha',
      'Beta',
      'Overall (geomean-normalised)',
    ]);
    // Gamma never gets one: only the base profile ran it.
    expect(last.pendingLabels).toEqual([]);
  });

  it('yields a table as soon as it arrives, in whatever order that is', async function () {
    // A runner that finishes the subtests before the overall table, which is what
    // a pool of threads does when the biggest job is dispatched first.
    const finished: string[] = [];
    const makeRunner: TableRunnerFactory = (setup) => {
      const inProcess = createInProcessTableRunner(setup);
      let releaseOverall = () => {};
      const overallHeldUntil = new Promise<void>((resolve) => {
        releaseOverall = resolve;
      });
      let subtestsDone = 0;
      return {
        run: (job) =>
          inProcess.run(job).then(async (comparisons) => {
            if (job.label.startsWith('Overall')) {
              await overallHeldUntil;
              finished.push(job.label);
              return comparisons;
            }
            finished.push(job.label);
            if (++subtestsDone === 2) {
              releaseOverall();
            }
            return comparisons;
          }),
        dispose: inProcess.dispose,
      };
    };
    const snapshots = await collect({ makeRunner });
    const arrival = snapshots
      .slice(1)
      .map((s) => [...s.bucketTables.keys()].pop());
    // Dispatched Overall first, and it is the last of the three to be finished, so
    // a snapshot went out for a subtest while the row above it was still pending.
    expect(finished[0]).toBe('Alpha');
    expect(finished[2]).toBe('Overall (geomean-normalised)');
    expect(arrival[0]).toBe('Alpha');
    expect(arrival.slice().sort()).toEqual([
      'Alpha',
      'Beta',
      'Overall (geomean-normalised)',
    ]);
  });

  it('asks for the global table to be spread over every thread, and no other', async function () {
    const jobs: BucketTableJob[] = [];
    await collect({
      makeRunner: (setup) => {
        const inProcess = createInProcessTableRunner(setup);
        return {
          run: (job) => {
            jobs.push(job);
            return inProcess.run(job);
          },
          dispose: inProcess.dispose,
        };
      },
    });
    // The global table is ~1s against ~130ms for a subtest, so it is the whole
    // critical path once the subtests have a thread each.
    expect(jobs.map((job) => [job.label, job.splitAcrossThreads])).toEqual([
      ['Overall (geomean-normalised)', true],
      ['Alpha', false],
      ['Beta', false],
    ]);
  });

  it('disposes of the runner when the comparison finishes', async function () {
    let disposed = 0;
    await collect({
      makeRunner: (setup) => {
        const inProcess = createInProcessTableRunner(setup);
        return {
          run: inProcess.run,
          dispose: () => {
            disposed++;
          },
        };
      },
    });
    expect(disposed).toBe(1);
  });

  it('disposes of the runner when the comparison is abandoned part-way', async function () {
    // What terminates the workers: the reader edited the pair, or navigated away,
    // and finishing the tables would keep the machine busy for seconds on nothing.
    let disposed = 0;
    const controller = new AbortController();
    const { baseStats, newStats } = makePair();
    const iterator = compareStatsProgressively(
      baseStats,
      newStats,
      SOURCES,
      controller.signal,
      (setup) => {
        const inProcess = createInProcessTableRunner(setup);
        return {
          run: inProcess.run,
          dispose: () => {
            disposed++;
          },
        };
      }
    );
    // One snapshot is the score rows; the runner exists from the next `next()` on.
    await iterator.next();
    await iterator.next();
    expect(disposed).toBe(0);
    controller.abort(new Error('the reader moved on'));
    await expect(iterator.next()).rejects.toThrow('the reader moved on');
    expect(disposed).toBe(1);
  });

  it('leaves earlier snapshots alone as later ones arrive', async function () {
    const snapshots = await collect();
    // The consumer renders from whichever snapshot it last received; a snapshot
    // that kept growing behind its back would render stale rows against fresh
    // tables.
    expect(snapshots[0].bucketTables.size).toBe(0);
    expect(snapshots[1].bucketTables.size).toBe(1);
    expect(snapshots[0].pendingLabels).toHaveLength(3);
  });

  it('finds the regression in the subtest the new profile doubled', async function () {
    const snapshots = await collect();
    const last = snapshots[snapshots.length - 1];
    const beta = last.scores.suiteScores.find((row) => row.label === 'Beta');
    expect(beta?.relChange).toBeCloseTo(1, 10);
    const betaBuckets = last.bucketTables.get('Beta');
    expect(betaBuckets?.map((c) => c.bucketName)).toEqual(['betaFunc']);
  });

  it('stops where it is when the signal is aborted', async function () {
    const controller = new AbortController();
    const { baseStats, newStats } = makePair();
    const seen: ComparisonProgress[] = [];
    await expect(
      (async () => {
        for await (const progress of compareStatsProgressively(
          baseStats,
          newStats,
          SOURCES,
          controller.signal
        )) {
          seen.push(progress);
          controller.abort(new Error('the reader moved on'));
        }
      })()
    ).rejects.toThrow('the reader moved on');
    expect(seen).toHaveLength(1);
  });
});
