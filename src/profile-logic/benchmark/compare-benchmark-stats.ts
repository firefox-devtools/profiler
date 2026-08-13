/**
 * Compare two benchmark profile stats files (produced by extract-benchmark-stats)
 * and report which buckets changed significantly between them.
 *
 * Uses Mann-Whitney U test with normal approximation.
 *
 * Usage:
 *   yarn build-node-tools
 *   node node-tools-dist/compare-benchmark-stats.js \
 *     --base /tmp/base-stats.json \
 *     --new  /tmp/new-stats.json
 *
 * Options:
 *   --suite <name>    Show per-suite results for this suite (substring match)
 *   --global          Show results from the geomean-normalised global view (default)
 *   --pvalue <0.05>   Significance threshold (default 0.05)
 *   --top <20>        Show top N changed buckets (default 20)
 *   --all             Show all significant buckets, not just top N
 */

import type {
  ProfileBenchmarkStats,
  SparseBucketEntry,
  SuiteStats,
} from './extract-benchmark-stats';
import {
  mannWhitneyU,
  mannWhitneyPValue,
  cliffsDelta,
  interpretEffectSize,
  pValueToConfidence,
} from './perf-compare-stats';
import type { EffectSize, ConfidenceRating } from './perf-compare-stats';
import type { IndexIntoFuncTable } from '../../types/profile';

// ---------------------------------------------------------------------------
// Geomean-normalised global buckets
// ---------------------------------------------------------------------------

/** Total sample weight of a suite, over all its buckets and iterations. Equal
 * to the suite's raw score, since the sparse bucket list covers every bucket
 * with nonzero weight. */
function suiteTotalWeight(suite: SuiteStats): number {
  let total = 0;
  for (const entry of suite.buckets) {
    const { iterationTotals } = entry;
    for (let i = 0; i < iterationTotals.length; i++) {
      total += iterationTotals[i];
    }
  }
  return total;
}

/**
 * Per-suite scaling factors for the geomean-normalised global view, derived
 * from *both* profiles so that the same constant scales a given suite on both
 * sides of the comparison.
 *
 * Scaling each side by its own `geomean / suiteTotal` (what a single-profile
 * score computation uses) would break the rank statistics. Per-iteration
 * bucket weights are small integers — a function typically accounts for 0, 1
 * or 2 samples in an iteration — so base and new tie on a large fraction of
 * pairs, and `mannWhitneyU` detects those ties by exact equality. Two factors
 * that differ by even 0.1% turn every nonzero tie into a strict inequality,
 * all pointing the same way, which shifts Cliff's delta by the tied-pair
 * fraction (routinely 0.1-0.2) in a direction set only by whether that suite
 * happened to get slightly faster or slower overall. A shared factor is a
 * common positive scale, which rank tests are invariant to: ties survive
 * exactly, and a bucket confined to one suite gets the same delta and p-value
 * globally as it does in that suite's own comparison.
 *
 * The shared factor is the geometric mean of the two profiles' own factors,
 * i.e. normalisation by the geometric mean of the two suite totals. Suites
 * present in only one profile use that profile's total alone. Suites with no
 * weight at all are left out of the map; they have no buckets to contribute.
 */
export function computeSharedSuiteFactors(
  baseStats: ProfileBenchmarkStats,
  newStats: ProfileBenchmarkStats
): Map<string, number> {
  // Work in log space throughout: the product of every suite total overflows a
  // double once there are more than a few dozen suites.
  const logTotals = new Map<string, number[]>();
  for (const stats of [baseStats, newStats]) {
    for (const suite of stats.suites) {
      const total = suiteTotalWeight(suite);
      if (!(total > 0) || !isFinite(total)) {
        continue;
      }
      const existing = logTotals.get(suite.suiteName);
      if (existing !== undefined) {
        existing.push(Math.log(total));
      } else {
        logTotals.set(suite.suiteName, [Math.log(total)]);
      }
    }
  }

  const meanLogPerSuite = new Map<string, number>();
  let logSum = 0;
  for (const [suiteName, logs] of logTotals) {
    const meanLog = logs.reduce((sum, l) => sum + l, 0) / logs.length;
    meanLogPerSuite.set(suiteName, meanLog);
    logSum += meanLog;
  }
  if (meanLogPerSuite.size === 0) {
    return new Map();
  }
  const geomeanLog = logSum / meanLogPerSuite.size;

  const factors = new Map<string, number>();
  for (const [suiteName, meanLog] of meanLogPerSuite) {
    factors.set(suiteName, Math.exp(geomeanLog - meanLog));
  }
  return factors;
}

/**
 * Build one profile's geomean-normalised global bucket list: each bucket's
 * per-iteration weights summed across all suites, with each suite scaled by
 * `factorPerSuiteName` (from `computeSharedSuiteFactors`).
 *
 * Suites are visited in name order rather than in the profile's own marker
 * discovery order, so that the floating-point summation order is the same for
 * both profiles. Otherwise a bucket appearing in several suites could end up a
 * few ULPs apart on the two sides and lose ties that ought to hold exactly.
 */
export function computeGlobalBuckets(
  stats: ProfileBenchmarkStats,
  factorPerSuiteName: Map<string, number>,
  iterationCount: number
): SparseBucketEntry[] {
  const bucketCount = stats.bucketNames.length;
  const globalIterTotals = new Float64Array(bucketCount * iterationCount);

  const suitesByName = [...stats.suites].sort((a, b) => {
    if (a.suiteName < b.suiteName) {
      return -1;
    }
    return a.suiteName > b.suiteName ? 1 : 0;
  });
  for (const suite of suitesByName) {
    const factor = factorPerSuiteName.get(suite.suiteName);
    if (factor === undefined) {
      continue;
    }
    // Suites are expected to have run the same number of iterations, but a
    // truncated profile can leave one short; treat its missing iterations as
    // zero rather than reading past the end of its arrays.
    const count = Math.min(iterationCount, suite.iterationCount);
    for (const entry of suite.buckets) {
      const base = entry.bucketIndex * iterationCount;
      const { iterationTotals } = entry;
      for (let i = 0; i < count; i++) {
        globalIterTotals[base + i] += factor * iterationTotals[i];
      }
    }
  }

  const globalBuckets: SparseBucketEntry[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const base = b * iterationCount;
    let total = 0;
    for (let i = 0; i < iterationCount; i++) {
      total += globalIterTotals[base + i];
    }
    if (total === 0) {
      continue;
    }
    globalBuckets.push({
      bucketIndex: b,
      iterationTotals: globalIterTotals.subarray(base, base + iterationCount),
    });
  }
  return globalBuckets;
}

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

export type BucketComparison = {
  /** Cross-profile matching key (source location for JS funcs, name otherwise).
   * Stable across the same profile pair — safe to use as a React key or to
   * anchor UI state (like which row is expanded) across re-filterings. */
  key: string;
  bucketName: string;
  /** Func index of the bucket in the base profile, or null if absent there.
   * If multiple funcs share this name within the profile, the one with the
   * largest sum of iterationTotals is chosen (representative func). */
  baseFunc: IndexIntoFuncTable | null;
  /** Func index of the bucket in the new profile, or null if absent there. */
  newFunc: IndexIntoFuncTable | null;
  baseMean: number;
  newMean: number;
  /** Relative change: (newMean - baseMean) / baseMean */
  relChange: number;
  cliffdsDelta: number;
  effectSize: EffectSize;
  confidence: ConfidenceRating;
};

type KeyMapEntry = {
  /** Human-readable display name for this key (taken from the first bucket
   * seen with this key — usually a function name). */
  displayName: string;
  /** Borrowed from `entry.iterationTotals` on first insert, then replaced by a
   * fresh Float64Array on collision (see buildKeyMap). Callers must not mutate
   * this unless `owned` is true. */
  iterationTotals: ArrayLike<number>;
  /** True iff `iterationTotals` is a fresh Float64Array owned by this entry. */
  owned: boolean;
  /** Func index of the highest-weight bucket with this key (representative). */
  representativeFunc: IndexIntoFuncTable;
  /** Sum of iterationTotals for that representative bucket alone. */
  representativeWeight: number;
};

/** Build a key → iterationTotals + representative-func map for a set of sparse
 * bucket entries. Iteration-total arrays are borrowed by reference until a
 * collision forces a copy — the extraction step returns subarrays of a shared
 * Float64Array, so avoiding copies here saves ~200k small allocations per side. */
function buildKeyMap(
  buckets: SparseBucketEntry[],
  bucketKeys: string[],
  bucketNames: string[],
  bucketFuncs: IndexIntoFuncTable[]
): Map<string, KeyMapEntry> {
  const map = new Map<string, KeyMapEntry>();
  for (const entry of buckets) {
    const key = bucketKeys[entry.bucketIndex] ?? `bucket#${entry.bucketIndex}`;
    const name =
      bucketNames[entry.bucketIndex] ?? `bucket#${entry.bucketIndex}`;
    const func = bucketFuncs[entry.bucketIndex];
    const iterTotals = entry.iterationTotals;
    const iterLen = iterTotals.length;
    let weight = 0;
    for (let i = 0; i < iterLen; i++) {
      weight += iterTotals[i];
    }
    const existing = map.get(key);
    if (existing !== undefined) {
      // Two funcs collapsed to the same matching key (e.g. an inlined and
      // non-inlined copy of the same JS function). Sum their iteration totals
      // together; on the first collision materialise into a fresh Float64Array
      // since the borrowed entry may be a subarray of the source buffer.
      let dest: Float64Array;
      if (existing.owned) {
        dest = existing.iterationTotals as Float64Array;
      } else {
        dest = new Float64Array(existing.iterationTotals);
        existing.iterationTotals = dest;
        existing.owned = true;
      }
      for (let i = 0; i < iterLen; i++) {
        dest[i] += iterTotals[i];
      }
      if (weight > existing.representativeWeight) {
        existing.representativeFunc = func;
        existing.representativeWeight = weight;
        existing.displayName = name;
      }
    } else {
      map.set(key, {
        displayName: name,
        iterationTotals: iterTotals,
        owned: false,
        representativeFunc: func,
        representativeWeight: weight,
      });
    }
  }
  return map;
}

/**
 * Compare two sparse bucket lists, matching by bucket key across profiles.
 * For JS funcs, the key is the source location (filename:line:col) so that
 * naming differences across engines don't prevent the same function from
 * matching. For everything else, the key is the bucket name.
 *
 * Buckets that appear in only one profile are treated as
 * "appeared"/"disappeared" unless excludeAppearedDisappeared is set.
 *
 * `baseBucketKeys` / `newBucketKeys` may be missing (older stats files
 * predate the cross-engine matching key); in that case we fall back to
 * matching by name, which preserves prior behaviour.
 */
export function compareBuckets(
  baseBuckets: SparseBucketEntry[],
  newBuckets: SparseBucketEntry[],
  baseBucketNames: string[],
  newBucketNames: string[],
  baseBucketFuncs: IndexIntoFuncTable[],
  newBucketFuncs: IndexIntoFuncTable[],
  iterationCount: number,
  excludeAppearedDisappeared: boolean = false,
  baseBucketKeys: string[] = baseBucketNames,
  newBucketKeys: string[] = newBucketNames
): BucketComparison[] {
  const baseMap = buildKeyMap(
    baseBuckets,
    baseBucketKeys,
    baseBucketNames,
    baseBucketFuncs
  );
  const newMap = buildKeyMap(
    newBuckets,
    newBucketKeys,
    newBucketNames,
    newBucketFuncs
  );

  const allKeys = excludeAppearedDisappeared
    ? new Set([...baseMap.keys()].filter((k) => newMap.has(k)))
    : new Set([...baseMap.keys(), ...newMap.keys()]);

  const zeros = new Array<number>(iterationCount).fill(0);

  const results: BucketComparison[] = [];
  for (const key of allKeys) {
    const baseEntry = baseMap.get(key);
    const newEntry = newMap.get(key);
    const baseIter = baseEntry?.iterationTotals ?? zeros;
    const newIter = newEntry?.iterationTotals ?? zeros;

    const baseMean = mean(baseIter);
    const newMean = mean(newIter);

    if (baseMean === 0 && newMean === 0) {
      continue;
    }

    const u = mannWhitneyU(baseIter, newIter);
    const pValue = mannWhitneyPValue(u, baseIter, newIter);
    const relChange =
      baseMean === 0 ? Infinity : (newMean - baseMean) / baseMean;
    const delta = cliffsDelta(u, baseIter.length, newIter.length);
    const effectSize = interpretEffectSize(delta);
    const confidence = pValueToConfidence(pValue);

    // Prefer the base profile's display name; fall back to the new one.
    const displayName = baseEntry?.displayName ?? newEntry?.displayName ?? key;

    results.push({
      key,
      bucketName: displayName,
      baseFunc: baseEntry?.representativeFunc ?? null,
      newFunc: newEntry?.representativeFunc ?? null,
      baseMean,
      newMean,
      relChange,
      cliffdsDelta: delta,
      effectSize,
      confidence,
    });
  }

  return results;
}

export function mean(arr: ArrayLike<number>): number {
  const n = arr.length;
  if (n === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += arr[i];
  }
  return sum / n;
}

/** Sum all bucket iterationTotals element-wise to get a per-iteration total for a suite. */
export function suiteIterationTotals(
  buckets: SparseBucketEntry[],
  iterationCount: number
): number[] {
  const totals = new Array<number>(iterationCount).fill(0);
  for (const entry of buckets) {
    for (let i = 0; i < iterationCount; i++) {
      totals[i] += entry.iterationTotals[i];
    }
  }
  return totals;
}

export type ScoreComparison = {
  label: string;
  baseMean: number;
  newMean: number;
  relChange: number;
  cliffdsDelta: number;
  effectSize: EffectSize;
  confidence: ConfidenceRating;
};

export function compareIterationTotals(
  label: string,
  baseIter: number[],
  newIter: number[]
): ScoreComparison {
  const baseMean = mean(baseIter);
  const newMean = mean(newIter);
  const u = mannWhitneyU(baseIter, newIter);
  const pValue = mannWhitneyPValue(u, baseIter, newIter);
  const relChange = baseMean === 0 ? Infinity : (newMean - baseMean) / baseMean;
  const delta = cliffsDelta(u, baseIter.length, newIter.length);
  const effectSize = interpretEffectSize(delta);
  const confidence = pValueToConfidence(pValue);
  return {
    label,
    baseMean,
    newMean,
    relChange,
    cliffdsDelta: delta,
    effectSize,
    confidence,
  };
}
