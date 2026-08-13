/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  compareBuckets,
  computeGlobalBuckets,
  computeSharedSuiteFactors,
} from '../../profile-logic/benchmark/compare-benchmark-stats';
import type { ProfileBenchmarkStats } from '../../profile-logic/benchmark/extract-benchmark-stats';

/**
 * Build a minimal ProfileBenchmarkStats. Buckets are identified by index into
 * `bucketNames`; each suite lists `[bucketIndex, perIterationWeights]` pairs.
 */
function makeStats(
  bucketNames: string[],
  suites: Array<{
    suiteName: string;
    buckets: Array<[number, number[]]>;
  }>
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

// A function that runs only in suite "Fast". The two sides are close enough
// that the change isn't significant, and — crucially — both are small integers,
// so most (base, new) pairs are exact ties.
const FAST_BUCKET_BASE = [1, 0, 1, 2, 0, 1, 0, 1, 1, 0, 2, 1, 0, 1, 1, 0];
const FAST_BUCKET_NEW = [0, 1, 1, 0, 1, 1, 0, 2, 0, 1, 1, 1, 1, 0, 2, 0];

// Filler in suite "Slow", which regresses by ~10%. This is what makes the two
// profiles' geomean normalisation factors differ.
const SLOW_BUCKET_BASE = new Array<number>(16).fill(25);
const SLOW_BUCKET_NEW = new Array<number>(16).fill(27.5);

function makePair() {
  const bucketNames = ['fastOnlyFunc', 'slowOnlyFunc'];
  const baseStats = makeStats(bucketNames, [
    { suiteName: 'Fast', buckets: [[0, FAST_BUCKET_BASE]] },
    { suiteName: 'Slow', buckets: [[1, SLOW_BUCKET_BASE]] },
  ]);
  const newStats = makeStats(bucketNames, [
    { suiteName: 'Fast', buckets: [[0, FAST_BUCKET_NEW]] },
    { suiteName: 'Slow', buckets: [[1, SLOW_BUCKET_NEW]] },
  ]);
  return { baseStats, newStats, iterationCount: FAST_BUCKET_BASE.length };
}

function compare(
  baseStats: ProfileBenchmarkStats,
  newStats: ProfileBenchmarkStats,
  baseBuckets: ProfileBenchmarkStats['suites'][0]['buckets'],
  newBuckets: ProfileBenchmarkStats['suites'][0]['buckets'],
  iterationCount: number
) {
  return compareBuckets(
    baseBuckets,
    newBuckets,
    baseStats.bucketNames,
    newStats.bucketNames,
    baseStats.bucketFuncs,
    newStats.bucketFuncs,
    iterationCount,
    false,
    baseStats.bucketKeys,
    newStats.bucketKeys
  );
}

describe('computeSharedSuiteFactors', function () {
  it('normalises each suite to the geomean of the suite totals', function () {
    const { baseStats, newStats } = makePair();
    const factors = computeSharedSuiteFactors(baseStats, newStats);

    // Suite totals: Fast is 12 (base) / 12 (new), Slow is 400 / 440.
    const fastTotal = Math.sqrt(12 * 12);
    const slowTotal = Math.sqrt(400 * 440);
    const geomean = Math.sqrt(fastTotal * slowTotal);
    expect(factors.get('Fast')).toBeCloseTo(geomean / fastTotal, 10);
    expect(factors.get('Slow')).toBeCloseTo(geomean / slowTotal, 10);

    // Each suite ends up contributing the same normalised weight.
    expect((factors.get('Fast') ?? 0) * fastTotal).toBeCloseTo(
      (factors.get('Slow') ?? 0) * slowTotal,
      10
    );
  });

  it('is the geometric mean of the two profiles own factors', function () {
    const { baseStats, newStats } = makePair();
    // Passing one profile twice yields that profile's own factors.
    const baseOwn = computeSharedSuiteFactors(baseStats, baseStats);
    const newOwn = computeSharedSuiteFactors(newStats, newStats);
    const shared = computeSharedSuiteFactors(baseStats, newStats);

    for (const suiteName of ['Fast', 'Slow']) {
      expect(shared.get(suiteName)).toBeCloseTo(
        Math.sqrt((baseOwn.get(suiteName) ?? 0) * (newOwn.get(suiteName) ?? 0)),
        10
      );
    }
    // The two profiles' own factors really do differ, so this test pair
    // exercises the case the shared factor exists to handle.
    expect(baseOwn.get('Slow')).not.toBe(newOwn.get('Slow'));
  });

  it('ignores suites with no weight at all', function () {
    const stats = makeStats(
      ['a', 'b'],
      [
        { suiteName: 'Fast', buckets: [[0, [1, 2, 3]]] },
        { suiteName: 'Empty', buckets: [[1, [0, 0, 0]]] },
      ]
    );
    const factors = computeSharedSuiteFactors(stats, stats);
    expect(factors.has('Empty')).toBe(false);
    expect(factors.get('Fast')).toBe(1);
  });
});

describe('computeGlobalBuckets', function () {
  it('sums each bucket across suites with the per-suite factor applied', function () {
    const stats = makeStats(
      ['shared'],
      [
        { suiteName: 'A', buckets: [[0, [1, 2]]] },
        { suiteName: 'B', buckets: [[0, [10, 20]]] },
      ]
    );
    const factors = new Map([
      ['A', 3],
      ['B', 0.5],
    ]);
    const global = computeGlobalBuckets(stats, factors, 2);
    expect(global).toHaveLength(1);
    expect(global[0].bucketIndex).toBe(0);
    expect(Array.from(global[0].iterationTotals)).toEqual([
      3 * 1 + 0.5 * 10,
      3 * 2 + 0.5 * 20,
    ]);
  });

  it('omits buckets with no global weight', function () {
    const stats = makeStats(
      ['a', 'b'],
      [
        {
          suiteName: 'A',
          buckets: [
            [0, [0, 0]],
            [1, [1, 0]],
          ],
        },
      ]
    );
    const global = computeGlobalBuckets(stats, new Map([['A', 1]]), 2);
    expect(global.map((b) => b.bucketIndex)).toEqual([1]);
  });

  it('does not depend on the order the suites appear in the profile', function () {
    const suites: Array<{
      suiteName: string;
      buckets: Array<[number, number[]]>;
    }> = [
      { suiteName: 'A', buckets: [[0, [1, 3]]] },
      { suiteName: 'B', buckets: [[0, [7, 11]]] },
      { suiteName: 'C', buckets: [[0, [13, 17]]] },
    ];
    const factors = new Map([
      ['A', 1 / 3],
      ['B', 0.1],
      ['C', 7 / 9],
    ]);
    const inOrder = computeGlobalBuckets(makeStats(['x'], suites), factors, 2);
    const reversed = computeGlobalBuckets(
      makeStats(['x'], [...suites].reverse()),
      factors,
      2
    );
    // Bit-for-bit, not just close: exact equality is what keeps ties intact.
    expect(Array.from(reversed[0].iterationTotals)).toEqual(
      Array.from(inOrder[0].iterationTotals)
    );
  });
});

describe('global bucket comparison', function () {
  it('gives a single-suite bucket the same statistics as its own suite', function () {
    const { baseStats, newStats, iterationCount } = makePair();

    const perSuite = compare(
      baseStats,
      newStats,
      baseStats.suites[0].buckets,
      newStats.suites[0].buckets,
      iterationCount
    );
    expect(perSuite).toHaveLength(1);

    const sharedFactors = computeSharedSuiteFactors(baseStats, newStats);
    const global = compare(
      baseStats,
      newStats,
      computeGlobalBuckets(baseStats, sharedFactors, iterationCount),
      computeGlobalBuckets(newStats, sharedFactors, iterationCount),
      iterationCount
    );
    const globalFast = global.find((c) => c.key === 'fastOnlyFunc');

    // A shared per-suite factor is a common positive scale, and rank
    // statistics are invariant to those.
    expect(globalFast?.cliffdsDelta).toBe(perSuite[0].cliffdsDelta);
    expect(globalFast?.confidence).toBe(perSuite[0].confidence);
    expect(globalFast?.effectSize).toBe(perSuite[0].effectSize);
    expect(globalFast?.relChange).toBeCloseTo(perSuite[0].relChange, 10);
  });

  it('would inflate the effect size if each profile used its own factors', function () {
    // This is the bug the shared factor fixes: per-iteration weights are small
    // integers, so base and new tie on many pairs. Scaling the two sides by
    // even slightly different constants breaks every nonzero tie in the same
    // direction, moving Cliff's delta by the tied-pair fraction.
    const { baseStats, newStats, iterationCount } = makePair();

    const perSuiteDelta = compare(
      baseStats,
      newStats,
      baseStats.suites[0].buckets,
      newStats.suites[0].buckets,
      iterationCount
    )[0].cliffdsDelta;

    const ownDelta = compare(
      baseStats,
      newStats,
      computeGlobalBuckets(
        baseStats,
        computeSharedSuiteFactors(baseStats, baseStats),
        iterationCount
      ),
      computeGlobalBuckets(
        newStats,
        computeSharedSuiteFactors(newStats, newStats),
        iterationCount
      ),
      iterationCount
    ).find((c) => c.key === 'fastOnlyFunc')!.cliffdsDelta;

    expect(Math.abs(ownDelta)).toBeGreaterThan(Math.abs(perSuiteDelta) + 0.1);
  });
});
