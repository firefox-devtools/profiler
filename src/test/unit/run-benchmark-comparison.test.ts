/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { compareStatsProgressively } from '../../profile-logic/benchmark/run-benchmark-comparison';
import type { ComparisonProgress } from '../../profile-logic/benchmark/run-benchmark-comparison';
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

async function collect(signal?: AbortSignal): Promise<ComparisonProgress[]> {
  const { baseStats, newStats } = makePair();
  const snapshots = [];
  for await (const progress of compareStatsProgressively(
    baseStats,
    newStats,
    SOURCES,
    signal ?? new AbortController().signal
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

  it('adds one bucket table per snapshot, in the order the rows are listed', async function () {
    const snapshots = await collect();
    expect(snapshots.map((s) => [...s.bucketTables.keys()])).toEqual([
      [],
      ['Overall (geomean-normalised)'],
      ['Overall (geomean-normalised)', 'Alpha'],
      ['Overall (geomean-normalised)', 'Alpha', 'Beta'],
    ]);
    expect(snapshots.map((s) => s.pendingLabels.length)).toEqual([3, 2, 1, 0]);
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
