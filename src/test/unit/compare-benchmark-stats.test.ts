/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  applyBenjaminiHochberg,
  classifyChange,
  bucketTableSideOf,
  combineBucketTableShards,
  compareBucketsOf,
  compareIterationTotals,
  computeBucketTableShardInSlices,
  computeGlobalBuckets,
  computeSharedSuiteFactors,
  describeVerdict,
  matchBucketKeys,
} from '../../profile-logic/benchmark/compare-benchmark-stats';
import type { ScoreComparison } from '../../profile-logic/benchmark/compare-benchmark-stats';
import { studentTCritical } from '../../profile-logic/benchmark/perf-compare-stats';
import type { ProfileBenchmarkStats } from '../../profile-logic/benchmark/extract-benchmark-stats';
import { runToCompletion } from '../../profile-logic/benchmark/chunked-work';

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

// A function that runs only in suite "Fast": total weight 12 -> 8. Small
// integers, so most (base, new) pairs are exact ties — which is what made the
// rank statistic this replaced so sensitive to a rescale.
const FAST_BUCKET_BASE = [1, 0, 1, 2, 0, 1, 0, 1, 1, 0, 2, 1, 0, 1, 1, 0];
const FAST_BUCKET_NEW = [0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0];

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
  return compareBucketsOf(
    {
      base: bucketTableSideOf(baseStats),
      new: bucketTableSideOf(newStats),
    },
    { baseBuckets, newBuckets, iterationCount }
  );
}

describe('computeSharedSuiteFactors', function () {
  it('normalises each suite to the geomean of the suite totals', function () {
    const { baseStats, newStats } = makePair();
    const factors = computeSharedSuiteFactors(baseStats, newStats);

    // Suite totals: Fast is 12 (base) / 8 (new), Slow is 400 / 440.
    const fastTotal = Math.sqrt(12 * 8);
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

    // A shared per-suite factor is a common positive scale. It multiplies both
    // delta and se by the same constant, so everything scale-free is unchanged:
    // the bucket's own p-value, how that p-value was obtained, and the relative
    // change.
    expect(globalFast?.pValue).toBeCloseTo(perSuite[0].pValue, 10);
    expect(globalFast?.pValueMethod).toBe(perSuite[0].pValueMethod);
    expect(globalFast?.relChange).toBeCloseTo(perSuite[0].relChange, 10);

    // The scale-dependent quantities move by that one factor. Derived from se,
    // which is strictly positive, rather than from delta, which is allowed to be
    // arbitrarily close to zero.
    const factor = globalFast!.se / perSuite[0].se;
    expect(factor).toBeGreaterThan(1);
    expect(globalFast!.delta).toBeCloseTo(perSuite[0].delta * factor, 8);

    // The MDE deliberately does *not* follow, beyond that scale factor: it is
    // now measured against the bar its own table imposes, and the global table
    // has more buckets in it than the suite table does. Same for qValue. See the
    // "multiple-comparisons correction" tests below.
    expect(globalFast!.mde / factor).toBeGreaterThanOrEqual(perSuite[0].mde);
  });

  it('biases the estimate if each profile uses its own factors', function () {
    // What the shared factor buys, stated as a property: with per-profile
    // factors the two sides are scaled by *different* constants, so the
    // normalisation drift leaks into the point estimate and the measured
    // relative change no longer matches the suite's own.
    const { baseStats, newStats, iterationCount } = makePair();

    const perSuite = compare(
      baseStats,
      newStats,
      baseStats.suites[0].buckets,
      newStats.suites[0].buckets,
      iterationCount
    )[0];

    // Passing one profile twice yields that profile's own factors.
    const own = compare(
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
    ).find((c) => c.key === 'fastOnlyFunc')!;

    const shared = compare(
      baseStats,
      newStats,
      computeGlobalBuckets(
        baseStats,
        computeSharedSuiteFactors(baseStats, newStats),
        iterationCount
      ),
      computeGlobalBuckets(
        newStats,
        computeSharedSuiteFactors(baseStats, newStats),
        iterationCount
      ),
      iterationCount
    ).find((c) => c.key === 'fastOnlyFunc')!;

    expect(shared.relChange).toBeCloseTo(perSuite.relChange, 10);
    expect(Math.abs(own.relChange - perSuite.relChange)).toBeGreaterThan(1e-3);
  });
});

describe('bucket matching', function () {
  // Two profiles that agree on everything except how they spell the bucket.
  // Firefox reports IDBDatabase.transaction where the other engine reports
  // IdbDatabase.transaction; with nothing but the name to match on, the case
  // difference must not split them into two one-sided rows.
  function comparePairNamed(baseName: string, newName: string) {
    const weights = new Array<number>(8).fill(3);
    const baseStats = makeStats(
      [baseName],
      [{ suiteName: 'Suite', buckets: [[0, weights]] }]
    );
    const newStats = makeStats(
      [newName],
      [{ suiteName: 'Suite', buckets: [[0, weights]] }]
    );
    return compare(
      baseStats,
      newStats,
      baseStats.suites[0].buckets,
      newStats.suites[0].buckets,
      weights.length
    );
  }

  it('matches name-keyed buckets that differ only in case', function () {
    const results = comparePairNamed(
      'IDBDatabase.transaction',
      'IdbDatabase.transaction'
    );

    expect(results).toHaveLength(1);
    // Matched on both sides, so neither appeared nor disappeared.
    expect(results[0].baseFunc).not.toBeNull();
    expect(results[0].newFunc).not.toBeNull();
    // The row is reported with the base profile's spelling, not a case-folded
    // one: the key is UI-facing identity, and folding is a matching detail.
    expect(results[0].key).toBe('IDBDatabase.transaction');
    expect(results[0].bucketName).toBe('IDBDatabase.transaction');
  });

  it('still separates buckets whose names differ by more than case', function () {
    const results = comparePairNamed(
      'IDBDatabase.transaction',
      'IDBDatabase.objectStore'
    );
    expect(results).toHaveLength(2);
  });

  it('sums two same-name buckets within one profile', function () {
    // Case folding also collapses within a profile: two funcs whose names
    // differ only in case are one bucket, and their weights add.
    const baseStats = makeStats(
      ['Foo.bar', 'foo.Bar'],
      [
        {
          suiteName: 'Suite',
          buckets: [
            [0, [1, 1, 1, 1]],
            [1, [2, 2, 2, 2]],
          ],
        },
      ]
    );
    const newStats = makeStats(
      ['Foo.bar'],
      [{ suiteName: 'Suite', buckets: [[0, [3, 3, 3, 3]]] }]
    );

    const results = compare(
      baseStats,
      newStats,
      baseStats.suites[0].buckets,
      newStats.suites[0].buckets,
      4
    );
    expect(results).toHaveLength(1);
    // 1 + 2 on the base side against 3 on the new side: no change.
    expect(results[0].delta).toBeCloseTo(0, 10);
    // The heavier of the two collapsed funcs represents the row.
    expect(results[0].key).toBe('foo.Bar');
  });

  it('lets two tables pick different representatives for the same key', function () {
    // Which of a profile's own colliding funcs speaks for the row is decided by
    // weight, and the weights are the table's rather than the profile's -- so the
    // same key can be named after one func in one subtest and the other in the
    // next, and expand to a different flame graph in each. Which is why the choice
    // belongs where the weights are, in the table, and not next to the matching in
    // `matchBucketKeys`.
    const light = [1, 1, 1, 1];
    const heavy = [5, 5, 5, 5];
    const stats = makeStats(
      ['Foo.bar', 'foo.Bar'],
      [
        {
          suiteName: 'A',
          buckets: [
            [0, heavy],
            [1, light],
          ],
        },
        {
          suiteName: 'B',
          buckets: [
            [0, light],
            [1, heavy],
          ],
        },
      ]
    );

    const tableFor = (index: number) =>
      compare(
        stats,
        stats,
        stats.suites[index].buckets,
        stats.suites[index].buckets,
        light.length
      );

    const [inA] = tableFor(0);
    const [inB] = tableFor(1);
    expect([inA.key, inA.bucketName, inA.baseFunc, inA.newFunc]).toEqual([
      'Foo.bar',
      'Foo.bar',
      0,
      0,
    ]);
    expect([inB.key, inB.bucketName, inB.baseFunc, inB.newFunc]).toEqual([
      'foo.Bar',
      'foo.Bar',
      1,
      1,
    ]);
  });
});

describe('multiple-comparisons correction', function () {
  /** `count` buckets drawn from one process on both sides, so none of them
   * changed, plus one that plainly did. Deterministic. */
  function makeFamilyPair(count: number) {
    const iterationCount = 16;
    let seed = 20250812;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const draw = () =>
      Array.from({ length: iterationCount }, () => (random() < 0.4 ? 1 : 0));

    const bucketNames = ['realMover'];
    const baseBuckets: Array<[number, number[]]> = [
      [0, new Array<number>(iterationCount).fill(1)],
    ];
    const newBuckets: Array<[number, number[]]> = [
      [0, new Array<number>(iterationCount).fill(4)],
    ];
    for (let i = 1; i <= count; i++) {
      bucketNames.push(`noise${i}`);
      baseBuckets.push([i, draw()]);
      newBuckets.push([i, draw()]);
    }
    return {
      baseStats: makeStats(bucketNames, [
        { suiteName: 'Only', buckets: baseBuckets },
      ]),
      newStats: makeStats(bucketNames, [
        { suiteName: 'Only', buckets: newBuckets },
      ]),
      iterationCount,
    };
  }

  function compareFamily(count: number) {
    const { baseStats, newStats, iterationCount } = makeFamilyPair(count);
    return compare(
      baseStats,
      newStats,
      baseStats.suites[0].buckets,
      newStats.suites[0].buckets,
      iterationCount
    );
  }

  /**
   * A score row with real spread and degrees of freedom -- the MDE re-basing
   * needs both -- but a p-value set directly, because what is under test is BH's
   * arithmetic over a known set of p-values, not how those p-values arose.
   */
  function makeScore(label: string, pValue: number): ScoreComparison {
    const row = compareIterationTotals(
      label,
      [10, 12, 11, 13, 9, 11, 10, 12],
      [11, 13, 12, 14, 10, 12, 11, 13]
    );
    row.pValue = pValue;
    return row;
  }

  it('gives every bucket a q-value, and no score row one', function () {
    const comparisons = compareFamily(40);
    expect(comparisons).toHaveLength(41);
    for (const c of comparisons) {
      expect(c.qValue).not.toBe(null);
      expect(c.familyWiseP).not.toBe(null);
      expect(c.qValue).toBeGreaterThan(0);
      expect(c.qValue).toBeLessThanOrEqual(1);
    }

    // A score is not one of a family of thousands, so there is nothing to
    // correct it against and it keeps its own p-value.
    const score = compareIterationTotals(
      'Overall',
      [10, 12, 11, 13, 9, 11, 10, 12],
      [14, 16, 15, 13, 17, 15, 16, 14]
    );
    expect(score.qValue).toBe(null);
    expect(score.familyWiseP).toBe(null);
    expect(score.pValue).toBeLessThan(0.05);
  });

  it('measures the MDE against the bar the table actually imposes', function () {
    // The MDE's job is to separate "did not move" from "could not tell", so it
    // has to be the smallest change that would have been *reported* — and what
    // gets reported is now q ≤ 0.05, not p ≤ 0.05. Left uncorrected it would
    // promise a sensitivity a table of hundreds does not have.
    const small = compareFamily(20);
    const large = compareFamily(400);
    const pick = (rows: typeof small) => rows.find((c) => c.key === 'noise1')!;

    // Same bucket, same data, same se either way.
    expect(pick(large).se).toBeCloseTo(pick(small).se, 12);
    // But a harder bar in the bigger table, and a harder bar than uncorrected in
    // both: the uncorrected t critical value for these df is under 2.1.
    expect(pick(large).mde).toBeGreaterThan(pick(small).mde);
    expect(pick(small).mde / pick(small).se).toBeGreaterThan(2.1);

    // The bar belongs to the table, not to the row, so every bucket in one table
    // divides out to exactly the same critical |t|. That is the property to hold
    // on to; the tempting stronger claim -- that everything reported has moved by
    // at least its own MDE -- is *not* guaranteed and must not be asserted. The
    // MDE is what a row would have needed on its own, while FDR rejects the k-th
    // best row on a looser threshold than the first, so a row can be reported on a
    // budget shared with other genuine movers and come in just under its own bar.
    // `realMover` has zero spread on both sides, so its ratio is 0/0 and says
    // nothing; every row that has a spread to divide by must agree.
    const criticalAbsT = new Set(
      large.filter((c) => c.se > 0).map((c) => (c.mde / c.se).toPrecision(9))
    );
    expect(criticalAbsT.size).toBe(1);
    expect(large.filter((c) => c.se === 0)).toHaveLength(1);
  });

  it('corrects the subtest scores, and only them', function () {
    // Twenty subtests is a small enough family for plain Benjamini-Hochberg, and
    // the overall score is left out on purpose: it is the question the developer
    // came to ask, not one of twenty they went looking through.
    const subtests = [0.0004, 0.002, 0.01, 0.2, 0.9].map((pValue, i) =>
      makeScore(`suite${i}`, pValue)
    );
    applyBenjaminiHochberg(subtests);

    // BH's adjusted value is p * n / k at rank k, made monotone by carrying the
    // running minimum down from the least extreme end.
    expect(subtests.map((s) => s.qValue)).toEqual([
      0.002, // 0.0004 * 5 / 1
      0.005, // 0.002  * 5 / 2
      expect.closeTo(0.016666666, 6), // 0.01 * 5 / 3
      0.25, // 0.2 * 5 / 4
      0.9, // 0.9 * 5 / 5
    ]);
    // Monotone, and never better than the raw p-value.
    for (const s of subtests) {
      expect(s.qValue!).toBeGreaterThanOrEqual(s.pValue);
    }

    // And the MDE moves with the bar, or the column would promise a sensitivity
    // the correction took away.
    const uncorrected = makeScore('suite0', 0.0004);
    expect(subtests[0].mde).toBeGreaterThan(uncorrected.mde);
    expect(subtests[0].mde).toBeCloseTo(
      studentTCritical(subtests[0].df, 0.05 / 5) * subtests[0].se,
      10
    );
  });

  it('separates "nothing changed" from "we could not tell"', function () {
    // The distinction the fourth verdict exists for. Same non-significant result
    // twice, once from a run tight enough to have seen a change worth caring
    // about and once from a run that could not have. Reporting both as "no change"
    // is how a performance tool tells someone their patch is fine when it has no
    // idea.
    const tight = makeScore('tight', 0.6);
    tight.baseMean = 100;
    tight.mde = 1; // 1% of the row, inside RESOLUTION_TOLERANCE
    expect(classifyChange(tight)).toBe('unchanged');

    const noisy = makeScore('noisy', 0.6);
    noisy.baseMean = 100;
    noisy.mde = 8; // 8% of the row: this run proves nothing
    expect(classifyChange(noisy)).toBe('unresolved');

    // Wording has to keep them apart too -- this is the text a reader acts on.
    const names = { base: 'Chrome', new: 'Firefox' };
    expect(describeVerdict('unchanged', '±1.00', names)).toContain(
      'did not move'
    );
    expect(describeVerdict('unresolved', '±8.00', names)).toContain(
      "Can't tell"
    );

    // A verdict of "slower" is meaningless without saying slower than what, so
    // both sides get named and the moving one comes first.
    expect(describeVerdict('slower', '±1.00', names)).toBe(
      'Firefox is slower than Chrome here, by more than this comparison could explain by chance.'
    );
  });

  it('reads the direction off the sign, since weight is time', function () {
    const slower = makeScore('slower', 0.001);
    slower.delta = 5;
    expect(classifyChange(slower)).toBe('slower');

    const faster = makeScore('faster', 0.001);
    faster.delta = -5;
    expect(classifyChange(faster)).toBe('faster');

    // And it is the corrected value that decides, when there is one: the same
    // p-value that reads "slower" on its own says nothing once it has been
    // charged for the company it was found in.
    const corrected = makeScore('corrected', 0.001);
    corrected.delta = 5;
    corrected.qValue = 0.4;
    corrected.mde = 0.001 * Math.abs(corrected.baseMean);
    expect(classifyChange(corrected)).toBe('unchanged');
  });

  it('keeps a real change and drops the buckets that only look like one', function () {
    const comparisons = compareFamily(300);
    const mover = comparisons.find((c) => c.key === 'realMover')!;
    expect(mover.qValue).toBeLessThanOrEqual(0.05);
    expect(mover.familyWiseP).toBeLessThanOrEqual(0.05);

    // Uncorrected, 300 nulls hand out a handful of rows at p ≤ 0.05 — fewer
    // than the nominal 15, because 16 Bernoulli iterations per side are coarse
    // enough that the permutation test is conservative on them.
    const uncorrected = comparisons.filter(
      (c) => c.key !== 'realMover' && c.pValue <= 0.05
    );
    expect(uncorrected.length).toBeGreaterThanOrEqual(5);
    const survivors = comparisons.filter(
      (c) => c.key !== 'realMover' && (c.qValue ?? 1) <= 0.05
    );
    expect(survivors.map((c) => c.key)).toEqual([]);
  });

  describe('computed in shards', function () {
    /** A table computed the way the worker pool computes one: `shardCount`
     * independent shards, each doing all of the set-up and its own share of the
     * permutation draws, combined afterwards. */
    function compareFamilyInShards(count: number, shardCount: number) {
      const { baseStats, newStats, iterationCount } = makeFamilyPair(count);
      const meta = {
        base: bucketTableSideOf(baseStats),
        new: bucketTableSideOf(newStats),
      };
      const input = {
        keys: matchBucketKeys(meta),
        baseBuckets: baseStats.suites[0].buckets,
        newBuckets: newStats.suites[0].buckets,
        iterationCount,
      };
      const shards = [];
      for (let index = 0; index < shardCount; index++) {
        shards.push(
          runToCompletion(
            computeBucketTableShardInSlices(input, {
              index,
              count: shardCount,
            })
          )
        );
      }
      return { shards, table: combineBucketTableShards(shards, meta) };
    }

    it('produces exactly the table the single-threaded path does', function () {
      // The contract the worker pool rests on, stated at the level the pool
      // actually works in: a table split over threads is not approximately the
      // table one thread would have computed, it is that table. `toEqual` on the
      // whole list, so a q-value out by an ULP is a failure.
      const whole = compareFamily(120);
      for (const shardCount of [1, 2, 5, 8]) {
        const { table } = compareFamilyInShards(120, shardCount);
        expect({ shardCount, table }).toEqual({ shardCount, table: whole });
      }
    });

    it('carries the rows on exactly one shard', function () {
      // Every shard would build the identical list, and one of these is thousands
      // of objects to clone back over a postMessage.
      const { shards } = compareFamilyInShards(40, 4);
      expect(shards.map((shard) => shard.rows !== null)).toEqual([
        true,
        false,
        false,
        false,
      ]);
      expect(shards.every((shard) => shard.family !== null)).toBe(true);
    });

    it('leaves a table it cannot calibrate uncorrected, from any number of shards', function () {
      // No buckets at all: there is no family to relabel, so the rows keep the
      // Welch stand-in and nothing throws on the way out.
      const meta = {
        base: { bucketNames: [], bucketKeys: [], bucketFuncs: [] },
        new: { bucketNames: [], bucketKeys: [], bucketFuncs: [] },
      };
      const input = {
        keys: matchBucketKeys(meta),
        baseBuckets: [],
        newBuckets: [],
        iterationCount: 8,
      };
      const shards = [0, 1, 2].map((index) =>
        runToCompletion(
          computeBucketTableShardInSlices(input, { index, count: 3 })
        )
      );
      expect(shards.map((shard) => shard.family)).toEqual([null, null, null]);
      expect(combineBucketTableShards(shards, meta)).toEqual([]);
    });
  });
});
