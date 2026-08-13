/**
 * Compare two benchmark profile stats files (produced by extract-benchmark-stats)
 * and report which buckets changed significantly between them.
 *
 * Usage:
 *   yarn build-node-tools
 *   node node-tools-dist/compare-benchmark-stats.js \
 *     --base /tmp/base-stats.json \
 *     --new  /tmp/new-stats.json
 *
 * Options:
 *   --suite <name>    Show per-suite results for this suite (substring match;
 *                     pass "" for every suite)
 *   --global          Show results from the geomean-normalised global view (default)
 *   --qvalue <0.05>   False discovery rate a bucket has to clear (default 0.05)
 *   --top <100>       Show top N changed buckets (default 100)
 *   --all             Show every bucket that clears --qvalue, not just top N
 *   --no-appeared     Skip buckets present in only one of the two profiles
 */

import type {
  ProfileBenchmarkStats,
  SparseBucketEntry,
  SuiteStats,
} from './extract-benchmark-stats';
import {
  computeFamilyCorrection,
  interpretStandardizedEffect,
  makePermutationBaseIndices,
  minimumDetectableEffect,
  permutationTwoSidedP,
  standardizedMeanDifference,
  studentTTwoSidedP,
  welchTTest,
} from './perf-compare-stats';
import type {
  EffectSize,
  FamilyMember,
  WelchResult,
} from './perf-compare-stats';
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
 * score computation uses) means the two sides are divided by *different*
 * constants, so the drift between those constants is added to every bucket's
 * measured change. For a suite whose own total moved by 1%, every function in it
 * picks up a spurious 1% change pointing in the same direction, whether or not
 * that function did anything. A shared factor is a common positive scale
 * instead: it multiplies delta and se together, leaving the standardised effect
 * and the p-value untouched, so a bucket confined to one suite gets the same
 * verdict globally as it does in that suite's own comparison.
 *
 * This also used to be much worse than a 1% bias. While the comparison ran on
 * Mann-Whitney U, the mismatched scaling broke the exact-equality ties that a
 * rank statistic depends on, and a 0.1% difference in factors moved Cliff's
 * delta by the tied-pair fraction — routinely 0.1 to 0.2. See
 * docs-developer/benchmark-auto-bucketing.md §3.1.
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
 * both profiles and a bucket appearing in several suites cannot come out a few
 * ULPs apart on the two sides for no reason.
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
// Shared statistics for one bucket
// ---------------------------------------------------------------------------

/** How a comparison's p-value was arrived at. */
export type PValueMethod = 'permutation' | 'welch';

/** Statistics every comparison row carries, whether it is a bucket or a score. */
export type ComparisonStats = {
  baseMean: number;
  newMean: number;
  /** Relative change: (newMean - baseMean) / baseMean */
  relChange: number;
  /** newMean - baseMean, in the same units as the means. Adds up across a
   * bucket partition, so a list of these is a budget for the total change. */
  delta: number;
  /** Standard error of `delta`. */
  se: number;
  /** Standardised mean difference (Cohen's d); what the effect-size filter
   * compares against. */
  standardizedEffect: number;
  effectSize: EffectSize;
  /**
   * Uncorrected. For a bucket row this is *not* the number to judge by — see
   * `qValue`. It is kept because it answers a different and still useful
   * question: whether this one bucket moved, asked on its own, which is what a
   * perf engineer who already suspects a specific function wants to know.
   */
  pValue: number;
  pValueMethod: PValueMethod;
  /**
   * Smallest |delta| that would have been called significant *by the rule that
   * applies to this row*. A null result with a small MDE means "did not move";
   * with a large MDE it means "could not tell".
   *
   * Which rule that is differs by row type, and so does the MDE. A score row is
   * judged on its own p-value, so its MDE comes from the uncorrected t critical
   * value. A bucket row is judged on `qValue`, against the thousands of buckets
   * in its table, so `applyFamilyCorrection` re-bases its MDE on the bar that
   * table imposes — several times larger, and view-dependent for the same reason
   * `qValue` is: the same bucket is easier to claim in a 118-row subtest than in
   * the 6800-row overall view.
   */
  mde: number;
  /**
   * Estimated false discovery rate among the rows of this table that are at
   * least this extreme — `pValue` corrected for the thousands of buckets tested
   * alongside this one. This is the number to filter on; the uncorrected
   * `pValue` means very little on its own at these family sizes. Null on score
   * rows, which are not one of a family.
   */
  qValue: number | null;
  /** Probability that *any* bucket in this table would look this extreme if
   * nothing had changed anywhere. Exact under the buckets' dependence, and a far
   * stricter bar than `qValue`: use it to answer "is there anything here at
   * all", not to pick out rows. Null on score rows. */
  familyWiseP: number | null;
};

/**
 * How small a Welch p-value has to be before it is worth spending permutations
 * on refining it. Buckets well away from significance cannot change verdict, and
 * there are ~14000 of them per profile pair.
 */
const PERMUTATION_PREFILTER_P = 0.25;

/**
 * Number of relabellings. 1999 puts the smallest reportable p-value at 5e-4,
 * comfortably below the thresholds `pValueToConfidence` uses.
 */
const PERMUTATION_COUNT = 1999;

/**
 * A bucket whose weight is zero in most iterations breaks the t-distribution
 * approximation however large the sample looks: 200 iterations of a bucket that
 * is nonzero in eight of them carries eight observations' worth of information.
 * Those always get the permutation treatment regardless of their Welch p.
 */
const SPARSE_ZERO_FRACTION = 0.5;

/**
 * Sparse buckets get a wider gate than dense ones, because their Welch p-value
 * is the untrustworthy one. Not an unconditional gate: a sparse bucket whose
 * approximate p-value is 0.8 is not going to turn out significant, and there are
 * thousands of them.
 */
const SPARSE_PREFILTER_P = 0.5;

function zeroFraction(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) {
    return 1;
  }
  let zeros = 0;
  for (let i = 0; i < n; i++) {
    if (values[i] === 0) {
      zeros++;
    }
  }
  return zeros / n;
}

/**
 * Lazily built relabellings, keyed by sample sizes. One set is shared by every
 * bucket in a comparison so that all p-values are judged against the same
 * relabellings, and so that generating them is not paid for per bucket.
 */
const permutationCache: Map<string, Int32Array[]> = new Map();

function permutationsFor(nBase: number, nNew: number): Int32Array[] {
  const key = `${nBase}:${nNew}`;
  let permutations = permutationCache.get(key);
  if (permutations === undefined) {
    permutations = makePermutationBaseIndices(nBase, nNew, PERMUTATION_COUNT);
    permutationCache.set(key, permutations);
  }
  return permutations;
}

/**
 * Statistics for one bucket: Welch's t on the mean difference, with the p-value
 * refined by permutation where that could matter.
 */
export function computeComparisonStats(
  baseIter: ArrayLike<number>,
  newIter: ArrayLike<number>
): ComparisonStats {
  const welch: WelchResult = welchTTest(baseIter, newIter);
  const welchP = studentTTwoSidedP(welch.t, welch.df);

  let pValue = welchP;
  let pValueMethod: PValueMethod = 'welch';
  const sparse =
    zeroFraction(baseIter) > SPARSE_ZERO_FRACTION ||
    zeroFraction(newIter) > SPARSE_ZERO_FRACTION;
  if (
    welch.se > 0 &&
    (welchP <= PERMUTATION_PREFILTER_P ||
      (sparse && welchP <= SPARSE_PREFILTER_P))
  ) {
    pValue = permutationTwoSidedP(
      baseIter,
      newIter,
      permutationsFor(baseIter.length, newIter.length)
    );
    pValueMethod = 'permutation';
  }

  const standardizedEffect = standardizedMeanDifference(welch);
  return {
    baseMean: welch.meanBase,
    newMean: welch.meanNew,
    relChange: welch.meanBase === 0 ? Infinity : welch.delta / welch.meanBase,
    delta: welch.delta,
    se: welch.se,
    standardizedEffect,
    effectSize: interpretStandardizedEffect(standardizedEffect),
    pValue,
    pValueMethod,
    mde: minimumDetectableEffect(welch),
    // Filled in by compareBuckets, which is the level that knows what the family
    // is. A single comparison in isolation has nothing to be corrected against.
    qValue: null,
    familyWiseP: null,
  };
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
} & ComparisonStats;

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
  const family: FamilyMember[] = [];
  for (const key of allKeys) {
    const baseEntry = baseMap.get(key);
    const newEntry = newMap.get(key);
    const baseIter = baseEntry?.iterationTotals ?? zeros;
    const newIter = newEntry?.iterationTotals ?? zeros;

    if (mean(baseIter) === 0 && mean(newIter) === 0) {
      continue;
    }

    // Prefer the base profile's display name; fall back to the new one.
    const displayName = baseEntry?.displayName ?? newEntry?.displayName ?? key;

    results.push({
      key,
      bucketName: displayName,
      baseFunc: baseEntry?.representativeFunc ?? null,
      newFunc: newEntry?.representativeFunc ?? null,
      ...computeComparisonStats(baseIter, newIter),
    });
    family.push({ base: baseIter, comp: newIter });
  }

  applyFamilyCorrection(results, family);
  return results;
}

/**
 * Correct one table's worth of bucket p-values for the fact that there are
 * thousands of them, and write the result onto the rows.
 *
 * **What the family is.** Every bucket in this one comparison, and no more: the
 * global view is corrected against the global view, and each subtest against
 * itself. Those 21 tables do overlap — they are hypotheses about the same
 * samples — so a bucket that shows up in several of them has had several
 * chances. Correcting across all of them at once would be the conservative
 * reading, but it would also mean opening a subtest table changed the numbers in
 * it, which is worse than the error it fixes. Each table is honest about itself.
 */
function applyFamilyCorrection(
  results: BucketComparison[],
  family: FamilyMember[]
) {
  if (family.length === 0) {
    return;
  }
  const correction = computeFamilyCorrection(
    family,
    permutationsFor(family[0].base.length, family[0].comp.length)
  );
  if (correction === null) {
    return;
  }
  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    row.qValue = correction.qValues[i];
    row.familyWiseP = correction.familyWisePValues[i];
    // Re-base the MDE on the bar that now actually applies. `computeComparisonStats`
    // set it from the uncorrected t critical value, which for a bucket row is no
    // longer the threshold anything is judged against — leaving it would have the
    // table promise a sensitivity it does not have, and turn "this really did not
    // move" into an overclaim on every quiet row.
    row.mde = correction.criticalAbsT * row.se;
  }
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
} & ComparisonStats;

export function compareIterationTotals(
  label: string,
  baseIter: number[],
  newIter: number[]
): ScoreComparison {
  return { label, ...computeComparisonStats(baseIter, newIter) };
}
