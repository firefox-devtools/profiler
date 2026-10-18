/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  combineAgainstFastest,
  combineBucketTables,
} from '../../profile-logic/benchmark/best-of-others';
import type { ComparedBucket } from '../../profile-logic/benchmark/best-of-others';
import { classifyChange } from '../../profile-logic/benchmark/compare-benchmark-stats';
import type {
  BucketComparison,
  ComparisonStats,
} from '../../profile-logic/benchmark/compare-benchmark-stats';
import { compareStatsProgressively } from '../../profile-logic/benchmark/run-benchmark-comparison';
import type { ComparisonProgress } from '../../profile-logic/benchmark/run-benchmark-comparison';
import type { ProfileBenchmarkStats } from '../../profile-logic/benchmark/extract-benchmark-stats';
import type { Profile } from '../../types';

/** One pairwise comparison with the subject's mean fixed at 10, so that the
 * comparand's mean alone decides the gap. */
function pairwise(comparandMean: number, q: number): ComparisonStats {
  const subjectMean = 10;
  return {
    baseMean: comparandMean,
    newMean: subjectMean,
    relChange: (subjectMean - comparandMean) / comparandMean,
    delta: subjectMean - comparandMean,
    se: 0.5,
    df: 20,
    pValue: q,
    pValueMethod: 'permutation',
    mde: 1,
    qValue: q,
    familyWiseP: q,
  };
}

describe('combineAgainstFastest', function () {
  it('measures a row against the fastest of the others', function () {
    const row = combineAgainstFastest(
      [
        { comparand: 0, row: pairwise(8, 0.001) },
        { comparand: 2, row: pairwise(6, 0.001) },
      ],
      2
    );
    expect(row.comparand).toBe(2);
    expect(row.delta).toBe(4);
    expect(classifyChange(row)).toBe('slower');
  });

  it('holds every comparison to alpha divided by how many there are', function () {
    // q = 0.04 clears 0.05 on its own, but one of two chances has to clear
    // 0.025.
    const row = combineAgainstFastest(
      [
        { comparand: 0, row: pairwise(8, 0.04) },
        { comparand: 2, row: pairwise(9, 0.5) },
      ],
      2
    );
    expect(row.qValue).toBeCloseTo(0.08, 10);
    expect(classifyChange(row)).not.toBe('slower');
  });

  it('names a profile the subject is shown to be slower than, over a larger gap that is not', function () {
    const row = combineAgainstFastest(
      [
        // The largest gap, but too noisy to claim.
        { comparand: 0, row: pairwise(5, 0.3) },
        { comparand: 2, row: pairwise(8, 0.001) },
      ],
      2
    );
    expect(row.comparand).toBe(2);
    expect(classifyChange(row)).toBe('slower');
  });

  it('shows the largest gap when none of them is significant', function () {
    const row = combineAgainstFastest(
      [
        { comparand: 0, row: pairwise(9, 0.3) },
        { comparand: 2, row: pairwise(7, 0.4) },
      ],
      2
    );
    expect(row.comparand).toBe(2);
    expect(row.qValue).toBeCloseTo(0.8, 10);
  });

  it('calls the subject faster only if it is faster than every other profile', function () {
    const faster = combineAgainstFastest(
      [
        { comparand: 0, row: pairwise(14, 0.001) },
        { comparand: 2, row: pairwise(12, 0.01) },
      ],
      2
    );
    // Against the closest competitor, judged on the weakest comparison.
    expect(faster.comparand).toBe(2);
    expect(faster.qValue).toBeCloseTo(0.02, 10);
    expect(classifyChange(faster)).toBe('faster');

    const notQuite = combineAgainstFastest(
      [
        { comparand: 0, row: pairwise(14, 0.001) },
        { comparand: 2, row: pairwise(11, 0.2) },
      ],
      2
    );
    expect(notQuite.delta).toBeLessThan(0);
    expect(classifyChange(notQuite)).not.toBe('faster');
  });

  it('gives a score row a q-value as well', function () {
    const score = { ...pairwise(8, 0.01), qValue: null };
    const row = combineAgainstFastest(
      [
        { comparand: 0, row: score },
        { comparand: 2, row: pairwise(9, 0.5) },
      ],
      2
    );
    // From its own p-value, since a score row has no q-value to multiply.
    expect(row.qValue).toBeCloseTo(0.02, 10);
  });
});

describe('combineBucketTables', function () {
  function bucket(
    key: string,
    comparandMean: number,
    q: number
  ): BucketComparison {
    return {
      key,
      bucketName: key,
      baseFunc: 1,
      newFunc: 2,
      ...pairwise(comparandMean, q),
    };
  }

  it('matches rows across the tables by bucket', function () {
    const combined = combineBucketTables(
      [
        { comparand: 0, rows: [bucket('a', 8, 0.001), bucket('b', 9, 0.5)] },
        { comparand: 2, rows: [bucket('b', 4, 0.001), bucket('a', 9, 0.5)] },
      ],
      2
    );
    const byKey = new Map<string, ComparedBucket>(
      combined.map((row) => [row.key, row])
    );
    expect(byKey.get('a')?.comparand).toBe(0);
    expect(byKey.get('b')?.comparand).toBe(2);
  });

  it('treats a bucket missing from a table as both profiles spending nothing', function () {
    // The subject and profile 2 never run this function, so profile 2's table
    // has no row for it. Profile 0 does run it. That is not the subject being
    // faster than everyone: it ties with profile 2.
    const onlyProfile0: BucketComparison = {
      ...bucket('profile0Only', 3, 0.001),
      newMean: 0,
      delta: -3,
      relChange: -1,
    };
    const [row] = combineBucketTables(
      [
        { comparand: 0, rows: [onlyProfile0] },
        { comparand: 2, rows: [] },
      ],
      2
    );
    expect(row.comparand).toBe(2);
    expect(row.delta).toBe(0);
    expect(classifyChange(row)).not.toBe('faster');
  });
});

describe('the fastest of the others, end to end', function () {
  const iterationCount = 16;

  function makeStats(
    bucketNames: string[],
    buckets: Array<[number, number[]]>
  ): ProfileBenchmarkStats {
    return {
      bucketNames,
      bucketKeys: bucketNames,
      bucketFuncs: bucketNames.map((_, i) => i),
      suites: [
        {
          suiteName: 'Only',
          iterationCount,
          buckets: buckets.map(([bucketIndex, iterationTotals]) => ({
            bucketIndex,
            iterationTotals,
          })),
        },
      ],
    };
  }

  /**
   * Three profiles whose `noiseCount` buckets are all drawn from one process, so
   * none of them differ. One more bucket really does differ: profile 2 spends
   * a quarter of the time the other two do on it. Deterministic.
   */
  function makeThreeProfiles(noiseCount: number): ProfileBenchmarkStats[] {
    let seed = 20261017;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const draw = () =>
      Array.from({ length: iterationCount }, () => (random() < 0.4 ? 1 : 0));
    const bucketNames = ['realMover'];
    for (let i = 1; i <= noiseCount; i++) {
      bucketNames.push(`noise${i}`);
    }
    return [4, 4, 1].map((moverWeight) => {
      const buckets: Array<[number, number[]]> = [
        [0, new Array<number>(iterationCount).fill(moverWeight)],
      ];
      for (let i = 1; i <= noiseCount; i++) {
        buckets.push([i, draw()]);
      }
      return makeStats(bucketNames, buckets);
    });
  }

  async function lastSnapshot(
    stats: ProfileBenchmarkStats[]
  ): Promise<ComparisonProgress> {
    let last: ComparisonProgress | null = null;
    for await (const progress of compareStatsProgressively(
      stats,
      0,
      'best',
      {
        profiles: stats.map(() => ({}) as Profile),
        viewerUrls: stats.map((_, i) => `https://example.com/${i}`),
      },
      new AbortController().signal
    )) {
      last = progress;
    }
    if (last === null) {
      throw new Error('The comparison yielded nothing.');
    }
    return last;
  }

  it('finds the real difference against the profile that has it, and none of the noise', async function () {
    const progress = await lastSnapshot(makeThreeProfiles(40));
    const table = progress.bucketTables.get(progress.scores.overallScore.label);
    if (table === undefined) {
      throw new Error('The overall table is missing.');
    }
    const reported = table.filter((row) => {
      const verdict = classifyChange(row);
      return verdict === 'slower' || verdict === 'faster';
    });
    expect(reported.map((row) => row.bucketName)).toEqual(['realMover']);
    expect(reported[0].comparand).toBe(2);
    expect(classifyChange(reported[0])).toBe('slower');
  });
});
