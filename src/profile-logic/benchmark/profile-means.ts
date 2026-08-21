/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * What a profile spends, per score row and per bucket, without comparing it to
 * anything.
 *
 * A report is of one pair: every Δ, MDE, q and verdict in it is two-sample, and
 * that stays true however many profiles are loaded. But a third profile still has
 * a column of its own, and the question that motivated loading it — "where is
 * Firefox behind *both* of the others" — is answered by comparing means, not by
 * another round of statistics. Means are what extraction already produces, so
 * this is a few passes over arrays rather than the seconds a comparison costs:
 * the price of a third column is one extraction, not one comparison.
 *
 * What it deliberately does *not* produce is significance. A row that is 2% ahead
 * of a profile this module measured has no q-value against it, because no test
 * was run — the viewer says so above the table, in `benchmarkColumnsNote`.
 */

import {
  bucketMatchKey,
  bucketTableSideOf,
  computeGlobalBuckets,
  mean,
  suiteIterationTotals,
} from './compare-benchmark-stats';
import type { ProfileBenchmarkStats } from './extract-benchmark-stats';

export type ProfileMeans = {
  /** Mean per score row, keyed by that row's label: the overall row's, and each
   * subtest's. A subtest this profile did not run is absent rather than zero —
   * "did not run" and "ran, took no time" are different answers. */
  scoreMeans: Map<string, number>;
  /**
   * Per score row, this profile's mean for each bucket, keyed by
   * `bucketMatchKey`.
   *
   * Absent means the profile has no bucket matching that key, which for a column
   * of times reads as zero: it spent none. That is the same thing the pairwise
   * comparison does with a bucket only one side has.
   */
  bucketMeans: Map<string, Map<string, number>>;
};

/**
 * Measure one profile the way the comparison measures its two sides, so that the
 * resulting column is comparable with theirs.
 *
 * `sharedSuiteFactors` has to be the same map the comparison used, computed
 * across every loaded profile — the overall row is a geomean-normalised total,
 * and normalising this profile by its own factors would put its column on a
 * different scale from the two beside it.
 */
export function computeProfileMeans(
  stats: ProfileBenchmarkStats,
  overallLabel: string,
  sharedSuiteFactors: Map<string, number>,
  iterationCount: number
): ProfileMeans {
  const scoreMeans = new Map<string, number>();
  const bucketMeans = new Map<string, Map<string, number>>();

  const globalBuckets = computeGlobalBuckets(
    stats,
    sharedSuiteFactors,
    iterationCount
  );
  scoreMeans.set(
    overallLabel,
    mean(suiteIterationTotals(globalBuckets, iterationCount))
  );
  bucketMeans.set(
    overallLabel,
    meansByKey(stats, globalBuckets, iterationCount)
  );

  for (const suite of stats.suites) {
    scoreMeans.set(
      suite.suiteName,
      mean(suiteIterationTotals(suite.buckets, suite.iterationCount))
    );
    bucketMeans.set(
      suite.suiteName,
      meansByKey(stats, suite.buckets, suite.iterationCount)
    );
  }

  return { scoreMeans, bucketMeans };
}

/**
 * One table's worth of means, keyed the way the comparison matches buckets.
 *
 * Several of a profile's own buckets can share a key — an inlined and a
 * non-inlined copy of one function, say — and the comparison sums them into one
 * row, so this sums them too. A column that split them would not add up to the
 * profile's own total.
 */
function meansByKey(
  stats: ProfileBenchmarkStats,
  buckets: Array<{ bucketIndex: number; iterationTotals: ArrayLike<number> }>,
  iterationCount: number
): Map<string, number> {
  const side = bucketTableSideOf(stats);
  const sums = new Map<string, number>();
  for (const entry of buckets) {
    const b = entry.bucketIndex;
    const fallback = `bucket#${b}`;
    const key = bucketMatchKey(
      side.bucketKeys[b] ?? fallback,
      side.bucketNames[b] ?? fallback
    );
    let sum = 0;
    for (let i = 0; i < iterationCount; i++) {
      sum += entry.iterationTotals[i];
    }
    sums.set(key, (sums.get(key) ?? 0) + sum);
  }
  // Summed over iterations above, so the mean is one division per key rather
  // than a second pass over every iteration of every bucket.
  const means = new Map<string, number>();
  for (const [key, sum] of sums) {
    means.set(key, iterationCount === 0 ? 0 : sum / iterationCount);
  }
  return means;
}
