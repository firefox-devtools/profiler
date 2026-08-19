/**
 * Compare two benchmark profile stats files (produced by extract-benchmark-stats)
 * and report which buckets changed significantly between them.
 *
 * Usage:
 *   yarn build-node-tools
 *   node node-tools-dist/compare-benchmark-stats.js \
 *     --base before.jslb.gz \
 *     --new  after.jslb.gz
 *
 * `--base` and `--new` each take either a profile as captured or a stats file
 * from extract-benchmark-stats; see `loadStats` in the CLI entry point.
 *
 * Options:
 *   --suite <name>    Show per-suite results for this suite (substring match;
 *                     pass "" for every suite)
 *   --global          Show results from the geomean-normalised global view (default)
 *   --qvalue <0.05>   False discovery rate a bucket has to clear (default 0.05)
 *   --top <100>       Show top N changed buckets (default 100)
 *   --all             Show every bucket that clears --qvalue, not just top N
 *   --no-appeared     Skip buckets present in only one of the two profiles
 *   --harness <name>  speedometer (default) or jetstream
 */

import type {
  ProfileBenchmarkStats,
  SparseBucketEntry,
  SuiteStats,
} from './extract-benchmark-stats';
import { runToCompletion } from './chunked-work';
import type { SlicedWork } from './chunked-work';
import {
  accumulateFamilyPartialInSlices,
  combineFamilyPartials,
  makePermutationBaseIndices,
  minimumDetectableEffect,
  permutationTwoSidedP,
  studentTTwoSidedP,
  welchTTest,
} from './perf-compare-stats';
import type {
  FamilyCorrection,
  FamilyMember,
  FamilyPartialCorrection,
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
 * instead: it multiplies delta and se together, leaving the studentised |t| and
 * so the p-value untouched, which is what lets a bucket confined to one suite
 * carry the same evidence globally as in that suite's own comparison.
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
  /** Welch-Satterthwaite degrees of freedom. Kept so that a critical value can be
   * re-derived at a corrected alpha after the fact — see `mde`. */
  df: number;
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
 * Number of relabellings. 1999 puts the smallest reportable p-value at 5e-4,
 * comfortably below the thresholds `pValueToConfidence` uses.
 */
const PERMUTATION_COUNT = 1999;

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
 * Where a comparison's p-value should come from.
 *
 * A **score** row has to relabel its own iterations: there are only 21 score
 * rows and nothing else for them to borrow from. Cheap at that count.
 *
 * A **bucket** row leaves it to `applyFamilyCorrection`, which is relabelling
 * every bucket in the table jointly anyway and can read each one's own p-value
 * off the same pass for one extra comparison per value. That is not just a
 * saving: a separate pass could not afford to relabel *every* bucket, so it used
 * to spend permutations only on the ones that might change verdict and leave the
 * rest on a Welch approximation that is not trustworthy for a bucket whose
 * weight is zero in most iterations. Now every bucket gets an exact p-value and
 * the three thresholds that used to decide who deserved one are gone.
 */
export type PValueSource = 'own-permutation' | 'family';

/**
 * Statistics for one comparison: Welch's t on the mean difference, with an exact
 * permutation p-value where `source` says to compute one here.
 */
export function computeComparisonStats(
  baseIter: ArrayLike<number>,
  newIter: ArrayLike<number>,
  source: PValueSource
): ComparisonStats {
  const welch: WelchResult = welchTTest(baseIter, newIter);

  // For 'family', the Welch p-value stands in until applyFamilyCorrection
  // replaces it -- and remains as the fallback if the family turns out to be
  // uncalibratable, which is the only case where a row keeps an approximate one.
  let pValue = studentTTwoSidedP(welch.t, welch.df);
  let pValueMethod: PValueMethod = 'welch';
  if (source === 'own-permutation' && welch.se > 0) {
    pValue = permutationTwoSidedP(
      baseIter,
      newIter,
      permutationsFor(baseIter.length, newIter.length)
    );
    pValueMethod = 'permutation';
  }

  return {
    baseMean: welch.meanBase,
    newMean: welch.meanNew,
    relChange: welch.meanBase === 0 ? Infinity : welch.delta / welch.meanBase,
    delta: welch.delta,
    se: welch.se,
    df: welch.df,
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
// Verdicts
// ---------------------------------------------------------------------------

/**
 * What a row is actually telling the reader.
 *
 * The point of this view is one question — "did my patch change anything, and
 * did it make anything worse" — and the person asking it usually has a try push,
 * not a statistics background. So the answer is a word, and there are four of
 * them rather than three, because **"nothing changed" and "we could not tell" are
 * different answers and conflating them is how a performance tool misleads
 * people.** A run that had the power to see a 0.5% regression and did not see one
 * is evidence the patch is fine. A run that could only have seen 4% is no
 * evidence at all, and must not read the same way.
 */
export type Verdict = 'slower' | 'faster' | 'unchanged' | 'unresolved';

/**
 * How close the minimum detectable effect has to get, as a fraction of the row's
 * own size, before a null result may be reported as "unchanged" rather than
 * "unresolved".
 *
 * 2%. Measured on the reference pairs, subtest MDEs run 1.8% to 4.3% of their own
 * mean and the overall score's is 1.5%, so at this tolerance a 20-run pair can
 * say "unchanged" about the overall score and about the tighter subtests, and has
 * to admit "unresolved" for the rest. That is the honest split rather than a
 * flattering one: it tells a developer chasing a 1% subtest regression that this
 * many runs cannot see it, which is the most useful thing the tool can say to
 * them. Raising it to 5% would relabel most of those "unchanged" and quietly
 * promise a sensitivity that is not there.
 */
export const RESOLUTION_TOLERANCE = 0.02;

/**
 * Weight is time, so up is slower. `alpha` is compared against the corrected
 * `qValue` when the row has one and its own `pValue` when it does not — see
 * `ComparisonStats.qValue` for which rows are which.
 */
export function classifyChange(
  row: ComparisonStats,
  alpha: number = 0.05
): Verdict {
  if ((row.qValue ?? row.pValue) <= alpha) {
    return row.delta > 0 ? 'slower' : 'faster';
  }
  const resolved = row.mde <= RESOLUTION_TOLERANCE * Math.abs(row.baseMean);
  return resolved ? 'unchanged' : 'unresolved';
}

/**
 * Plain-language gloss for a verdict, for a tooltip or a legend.
 *
 * `names` are what to call the two sides. "Slower" on its own is only
 * unambiguous when the two sides are the same build before and after a patch;
 * in a Chrome-vs-Firefox report the reader has to be told which one is meant,
 * every time.
 */
export function describeVerdict(
  verdict: Verdict,
  mde: string,
  names: { base: string; new: string }
): string {
  switch (verdict) {
    case 'slower':
      return `${names.new} is slower than ${names.base} here, by more than this comparison could explain by chance.`;
    case 'faster':
      return `${names.new} is faster than ${names.base} here, by more than this comparison could explain by chance.`;
    case 'unchanged':
      return `No change. A change of ${mde} would have shown up, so this really did not move.`;
    case 'unresolved':
      return `Can't tell. Only a change of ${mde} or larger would have shown up here, and nothing that big happened — which is not the same as nothing happening.`;
    default:
      throw new Error(`Unhandled verdict ${verdict as string}`);
  }
}

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

export type BucketComparison = {
  /** Cross-profile matching key (source location for JS funcs, name otherwise).
   * Stable across the same profile pair — safe to use as a React key or to
   * anchor UI state (like which row is expanded) across re-filterings. Name
   * keys match case-insensitively, but this reports the spelling the profile
   * used (the base profile's, when the two differ). */
  key: string;
  bucketName: string;
  /** Func index of the bucket in the base profile, or null if absent there.
   * If multiple funcs share this name within the profile, the one with the
   * largest sum of iterationTotals is chosen (representative func). */
  baseFunc: IndexIntoFuncTable | null;
  /** Func index of the bucket in the new profile, or null if absent there. */
  newFunc: IndexIntoFuncTable | null;
} & ComparisonStats;

/**
 * A `BucketComparison` before its names are looked up: what a table computes, and
 * what comes back from a worker.
 *
 * The four string and func fields of a `BucketComparison` are all derived from a
 * bucket index and the metadata, and the metadata never leaves the main thread, so
 * a row travels as two integers and is resolved on arrival by
 * `resolveBucketTableRows`. On a Speedometer 3 pair that is ~6800 rows not
 * carrying two strings each back over a `postMessage`.
 */
export type BucketTableRow = {
  /**
   * `bucketIndex` of the base profile's representative bucket for this row's key,
   * or -1 if the base profile has no bucket with that key.
   *
   * "Representative" because several of a profile's own buckets can share a key —
   * an inlined and a non-inlined copy of one JS function have the same source
   * location, and two spellings of a DOM entry point fold to the same name — in
   * which case their weights are summed into one row and the heaviest of them
   * stands for the group. So which bucket this is depends on the weights, and the
   * weights are the table's, not the profile's: the same key can be represented by
   * one bucket in the global table and by another in a subtest's. That is why the
   * choice is made here, where the weights are, rather than alongside the matching.
   */
  baseBucket: number;
  /** The same for the new profile. At least one of the two is not -1. */
  newBucket: number;
} & ComparisonStats;

/**
 * Which buckets of the two profiles are the same bucket, as integers.
 *
 * `base[b]` and `new[b]` are the *key id* of bucket `b` on that side: two buckets
 * are the same bucket exactly when their key ids are equal, whether they are on
 * the same side or on opposite ones. Ids run from 0 to `keyCount - 1` and are
 * shared between the two arrays, so a table can index a dense array by one.
 *
 * This is the whole of what a bucket table needs to know about the keys, and the
 * only form of it a worker is sent. See `matchBucketKeys` for why it is worth
 * resolving the strings away before they get anywhere near a thread.
 */
export type MatchedBucketKeys = {
  base: Int32Array;
  new: Int32Array;
  /** One past the largest id in either array. */
  keyCount: number;
};

/**
 * Decide which of the two profiles' buckets are the same bucket, once.
 *
 * **Why this is a step of its own.** Matching is the only thing a bucket table
 * wants the key strings for, it is the same answer for every table, and it is
 * pure function of metadata the main thread has anyway. Leaving it to the tables
 * meant every worker was sent both profiles' `bucketNames` and `bucketKeys` — four
 * arrays of a few thousand strings, and `bucketKeys` holds source locations, so
 * long ones. Measured on a Speedometer 3 pair over eight workers, reading that one
 * `init` message cost ~90ms per worker *before* it could start its shard, and
 * freeing the strings again cost another ~35ms in each worker's shutdown GC. Most
 * of both was contention on the process's jemalloc arena, since eight threads were
 * allocating and freeing tens of thousands of small char buffers at once. Sending
 * three `Int32Array`s instead costs none of it, and saves each shard the case
 * folding and string hashing below, which the shards were repeating.
 *
 * **The folding.** Name-based keys match case-insensitively: without a source
 * location to pin the function down, the name is all we have, and engines disagree
 * on the capitalisation of the same DOM entry point (Gecko's
 * IDBDatabase.transaction vs IdbDatabase.transaction elsewhere). Location keys are
 * left alone — filenames and URL paths are case-sensitive, so folding their case
 * could merge two genuinely different sources. A key that is still the name is a
 * name key, whether because the func has no usable location or because the stats
 * file predates `bucketKeys` entirely.
 */
export function matchBucketKeys(meta: BucketTableMetadata): MatchedBucketKeys {
  // Shared across both sides: that a base bucket and a new bucket land on the
  // same id is the entire point.
  const idPerKey = new Map<string, number>();
  const idsFor = (side: BucketTableSide): Int32Array => {
    const { bucketNames, bucketKeys } = side;
    const ids = new Int32Array(bucketNames.length);
    for (let b = 0; b < bucketNames.length; b++) {
      const fallback = `bucket#${b}`;
      const rawKey = bucketKeys[b] ?? fallback;
      const name = bucketNames[b] ?? fallback;
      const key = rawKey === name ? name.toLowerCase() : rawKey;
      let id = idPerKey.get(key);
      if (id === undefined) {
        id = idPerKey.size;
        idPerKey.set(key, id);
      }
      ids[b] = id;
    }
    return ids;
  };
  // Base first, so that ids ascend in base-bucket order, which is the order the
  // rows of a table come out in.
  const base = idsFor(meta.base);
  return { base, new: idsFor(meta.new), keyCount: idPerKey.size };
}

/** One key's worth of one side of a table: the buckets that share a key id,
 * summed. */
type KeyGroup = {
  keyId: number;
  /** Borrowed from `entry.iterationTotals` on first insert, then replaced by a
   * fresh Float64Array on collision (see buildKeyGroups). Callers must not mutate
   * this unless `owned` is true. */
  iterationTotals: ArrayLike<number>;
  /** True iff `iterationTotals` is a fresh Float64Array owned by this group. */
  owned: boolean;
  /** `bucketIndex` of the highest-weight bucket in the group. What the row is
   * named and drawn from; see `resolveBucketTableRows`. */
  representativeBucket: number;
  /** Sum of iterationTotals for that representative bucket alone. */
  representativeWeight: number;
};

type KeyGroups = {
  /** In the order the buckets were encountered, which is the order a table's rows
   * come out in and so has to be the same in every shard of it. */
  groups: KeyGroup[];
  /** Key id → index into `groups`, or -1 for a key this side does not have. */
  indexByKeyId: Int32Array;
};

/** Group one side's sparse bucket entries by key id, summing the ones that share
 * an id. Iteration-total arrays are borrowed by reference until a collision forces
 * a copy — the extraction step returns subarrays of a shared Float64Array, so
 * avoiding copies here saves ~200k small allocations per side. */
function buildKeyGroups(
  buckets: SparseBucketEntry[],
  keyIds: Int32Array,
  keyCount: number
): KeyGroups {
  const groups: KeyGroup[] = [];
  const indexByKeyId = new Int32Array(keyCount).fill(-1);
  for (const entry of buckets) {
    const { bucketIndex } = entry;
    if (bucketIndex < 0 || bucketIndex >= keyIds.length) {
      // Reading past the key ids would silently pick up id 0 and merge this
      // bucket into whichever key that is, which is a wrong table rather than a
      // missing one.
      throw new Error(
        `Bucket ${bucketIndex} has no key: the matched keys cover ${keyIds.length} buckets.`
      );
    }
    const keyId = keyIds[bucketIndex];
    const iterTotals = entry.iterationTotals;
    const iterLen = iterTotals.length;
    let weight = 0;
    for (let i = 0; i < iterLen; i++) {
      weight += iterTotals[i];
    }
    const at = indexByKeyId[keyId];
    if (at !== -1) {
      // Two funcs collapsed to the same matching key (e.g. an inlined and
      // non-inlined copy of the same JS function). Sum their iteration totals
      // together; on the first collision materialise into a fresh Float64Array
      // since the borrowed entry may be a subarray of the source buffer.
      const existing = groups[at];
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
        existing.representativeBucket = bucketIndex;
        existing.representativeWeight = weight;
      }
    } else {
      indexByKeyId[keyId] = groups.length;
      groups.push({
        keyId,
        iterationTotals: iterTotals,
        owned: false,
        representativeBucket: bucketIndex,
        representativeWeight: weight,
      });
    }
  }
  return { groups, indexByKeyId };
}

/**
 * Compare two sparse bucket lists, matching by bucket key across profiles.
 * For JS funcs, the key is the source location (filename:line:col) so that
 * naming differences across engines don't prevent the same function from
 * matching. For everything else, the key is the bucket name, matched
 * case-insensitively. `matchBucketKeys` has already decided all of that; what
 * this sees of it is `input.keys`.
 *
 * Buckets that appear in only one profile are treated as
 * "appeared"/"disappeared" unless `excludeAppearedDisappeared` is set.
 */
export function compareBuckets(
  input: BucketTableInput,
  meta: BucketTableMetadata
): BucketComparison[] {
  return runToCompletion(compareBucketsInSlices(input, meta));
}

/**
 * `compareBuckets` for a caller with one table to compute and no matching in hand,
 * which is the CLI and the tests. The browser matches once for the whole
 * comparison instead; see `TableRunnerSetup`.
 */
export function compareBucketsOf(
  meta: BucketTableMetadata,
  table: Omit<BucketTableInput, 'keys'>
): BucketComparison[] {
  return compareBuckets({ keys: matchBucketKeys(meta), ...table }, meta);
}

/**
 * `compareBuckets`, interruptible. See there for what this computes.
 *
 * One of these is a second of arithmetic for the global view, so the UI runs it in
 * slices; nothing else about it differs. Nearly all of the time is in the family
 * correction, which brings its own yield points — the ones added here just keep
 * the set-up from being one long task of its own on a very large table.
 *
 * A single shard covering every draw, so that this and the multi-threaded path are
 * the same code rather than two implementations that have to be kept agreeing.
 */
export function* compareBucketsInSlices(
  input: BucketTableInput,
  meta: BucketTableMetadata
): SlicedWork<BucketComparison[]> {
  const shard = yield* computeBucketTableShardInSlices(input, {
    index: 0,
    count: 1,
  });
  return combineBucketTableShards([shard], meta);
}

/** One profile's bucket metadata: what a table needs to know about a side
 * besides the per-iteration weights themselves. The three arrays are indexed by
 * `SparseBucketEntry.bucketIndex` and cover every bucket in the profile, not just
 * the ones in a given table. */
export type BucketTableSide = {
  bucketNames: string[];
  bucketKeys: string[];
  bucketFuncs: IndexIntoFuncTable[];
};

/**
 * Both profiles' bucket metadata.
 *
 * **Main-thread only, deliberately.** Two things are wanted from it: which buckets
 * match, which `matchBucketKeys` resolves to integers up front, and what to call a
 * row, which `resolveBucketTableRows` does to the rows as they come back. Neither
 * happens where a table is computed, so none of these strings has to be anywhere
 * near a worker — see `matchBucketKeys` for what it cost when they were.
 */
export type BucketTableMetadata = {
  base: BucketTableSide;
  new: BucketTableSide;
};

/**
 * The metadata half of a table's input, from a stats file that may predate parts
 * of it.
 *
 * `bucketKeys` and `bucketFuncs` were both added after the format was first
 * written, and every caller had grown its own copy of the same two fallbacks.
 * Keys fall back to the names, which is matching by name — what the comparison
 * did before there were keys. Funcs fall back to -1, which reads as "no func to
 * reach back into the profile with", and only the flame graphs want one.
 */
export function bucketTableSideOf(
  stats: ProfileBenchmarkStats
): BucketTableSide {
  const { bucketNames } = stats;
  return {
    bucketNames,
    bucketKeys: stats.bucketKeys ?? bucketNames,
    bucketFuncs: stats.bucketFuncs ?? new Array(bucketNames.length).fill(-1),
  };
}

/**
 * Everything one bucket table is computed from.
 *
 * An object rather than an argument list, and not only because it has to go over
 * a `postMessage`: this used to be ten positional parameters of which six were
 * same-typed arrays — names, keys and funcs for each side — so transposing two of
 * them type-checked, ran, and quietly compared the wrong things.
 */
export type BucketTableInput = {
  /** From `matchBucketKeys`, once per comparison rather than once per table. */
  keys: MatchedBucketKeys;
  baseBuckets: SparseBucketEntry[];
  newBuckets: SparseBucketEntry[];
  iterationCount: number;
  excludeAppearedDisappeared?: boolean;
};

/** Which of `count` equal parts of a table's permutation draws to run. */
export type BucketTableShardSpec = {
  index: number;
  count: number;
};

/**
 * One shard's worth of a bucket table: the rows, from whichever shard was asked
 * to build them, and this shard's share of the family correction.
 */
export type BucketTableShard = {
  /**
   * The comparison rows, before the family correction is written onto them —
   * only from shard 0, since every shard would produce the identical list and
   * there is no point sending it back more than once.
   */
  rows: BucketTableRow[] | null;
  /** Null when the family cannot be calibrated at all; see
   * `accumulateFamilyPartialInSlices`. Every shard of a table agrees about that,
   * since it is a property of the family rather than of the draws. */
  family: FamilyPartialCorrection | null;
};

/**
 * Compute part of a bucket table: all of the set-up, and the draws in shard
 * `index` of `count`.
 *
 * **The set-up is not divided, it is repeated.** Matching the two sides' buckets
 * and taking a Welch t of each is ~150ms of the global view's ~1.1s, and it is
 * deterministic from the input, so a shard recomputes it rather than being sent
 * it — which is the only reason a shard can be described by two integers. What
 * that costs is that a table stops getting faster once `count` is high enough for
 * the repeated set-up to dominate the draws each shard has left.
 *
 * Shards other than 0 skip building the rows, which is most of that set-up. It
 * saves them no wall clock — shard 0 is on the critical path either way — but on a
 * machine with fewer cores than shards it is the difference between the other
 * shards costing a little and costing as much again.
 */
export function* computeBucketTableShardInSlices(
  input: BucketTableInput,
  shard: BucketTableShardSpec
): SlicedWork<BucketTableShard> {
  const {
    keys,
    baseBuckets,
    newBuckets,
    iterationCount,
    excludeAppearedDisappeared = false,
  } = input;
  const withRows = shard.index === 0;

  const baseGroups = buildKeyGroups(baseBuckets, keys.base, keys.keyCount);
  yield;
  const newGroups = buildKeyGroups(newBuckets, keys.new, keys.keyCount);

  // The two sides paired up by key, in base-bucket order and then whatever only
  // the new profile has. Materialised rather than walked in place because the loop
  // below has to be able to yield out of the middle of it, and because the order
  // is load-bearing: it is the order the rows come out in, and every shard of a
  // table has to agree about it for `combineFamilyPartials` to be able to check
  // that they were looking at the same members.
  const pairs: Array<{ base: KeyGroup | null; new: KeyGroup | null }> = [];
  for (const group of baseGroups.groups) {
    const at = newGroups.indexByKeyId[group.keyId];
    if (at !== -1) {
      pairs.push({ base: group, new: newGroups.groups[at] });
    } else if (!excludeAppearedDisappeared) {
      pairs.push({ base: group, new: null });
    }
  }
  if (!excludeAppearedDisappeared) {
    for (const group of newGroups.groups) {
      if (baseGroups.indexByKeyId[group.keyId] === -1) {
        pairs.push({ base: null, new: group });
      }
    }
  }

  const zeros = new Array<number>(iterationCount).fill(0);

  const rows: BucketTableRow[] | null = withRows ? [] : null;
  const family: FamilyMember[] = [];
  let sinceYield = 0;
  for (const pair of pairs) {
    // A Welch t per key, so a few microseconds each; a few hundred at a time is
    // well inside any slice a driver would pick.
    if (++sinceYield === 256) {
      sinceYield = 0;
      yield;
    }
    const baseIter = pair.base?.iterationTotals ?? zeros;
    const newIter = pair.new?.iterationTotals ?? zeros;

    if (mean(baseIter) === 0 && mean(newIter) === 0) {
      continue;
    }

    if (rows !== null) {
      rows.push({
        baseBucket: pair.base?.representativeBucket ?? -1,
        newBucket: pair.new?.representativeBucket ?? -1,
        ...computeComparisonStats(baseIter, newIter, 'family'),
      });
    }
    family.push({ base: baseIter, comp: newIter });
  }

  if (family.length === 0) {
    return { rows, family: null };
  }
  const permutations = permutationsFor(
    family[0].base.length,
    family[0].comp.length
  );
  // Each shard takes a contiguous range, so that the ranges tile the draws
  // however unevenly `count` divides them. Which draws a shard gets does not
  // affect the result — they are exchangeable and every one of them is applied
  // exactly once — so the split is by index alone.
  const perShard = Math.ceil(permutations.length / shard.count);
  const drawStart = Math.min(permutations.length, shard.index * perShard);
  const drawEnd = Math.min(permutations.length, drawStart + perShard);
  const partial = yield* accumulateFamilyPartialInSlices(
    family,
    permutations,
    drawStart,
    drawEnd
  );
  return { rows, family: partial };
}

/**
 * Look up what each row is called.
 *
 * The naming follows the base profile whenever it has the key at all, since the
 * two sides can spell it differently — that is the whole point of the case folding
 * in `matchBucketKeys` — and a report that switched between the two spellings
 * depending on which side happened to weigh more would be reporting on its own
 * arithmetic. Which of one side's own buckets speaks for it is `baseBucket`'s
 * business; see `BucketTableRow`.
 */
function resolveBucketTableRows(
  rows: BucketTableRow[],
  meta: BucketTableMetadata
): BucketComparison[] {
  return rows.map(({ baseBucket, newBucket, ...stats }) => {
    const named =
      baseBucket !== -1
        ? { side: meta.base, bucket: baseBucket }
        : { side: meta.new, bucket: newBucket };
    // Only reachable from a stats file whose metadata is shorter than its bucket
    // indices, which `bucketTableSideOf` rules out for every real caller.
    const fallback = `bucket#${named.bucket}`;
    return {
      key: named.side.bucketKeys[named.bucket] ?? fallback,
      bucketName: named.side.bucketNames[named.bucket] ?? fallback,
      baseFunc:
        baseBucket === -1 ? null : (meta.base.bucketFuncs[baseBucket] ?? null),
      newFunc:
        newBucket === -1 ? null : (meta.new.bucketFuncs[newBucket] ?? null),
      ...stats,
    };
  });
}

/**
 * Put a table's shards back together: combine their draw ranges into one family
 * correction, write it onto the rows, and name them.
 *
 * Cheap — a few passes over the members plus a sort of the per-draw maxima, a
 * fraction of a millisecond against the second the shards spent — which is why
 * this can sit on the main thread even when the shards ran in workers. Which is
 * also where `meta` has to be read: it is the one part of a comparison that is
 * never sent anywhere.
 */
export function combineBucketTableShards(
  shards: ReadonlyArray<BucketTableShard>,
  meta: BucketTableMetadata
): BucketComparison[] {
  let rows: BucketTableRow[] | null = null;
  const families: FamilyPartialCorrection[] = [];
  let uncalibratable = false;
  for (const shard of shards) {
    if (shard.rows !== null) {
      if (rows !== null) {
        throw new Error('More than one shard of a bucket table carried rows.');
      }
      rows = shard.rows;
    }
    if (shard.family === null) {
      // Nothing to correct against, and every shard of the table says so, since
      // it is a property of the family. Leaves the rows with the Welch stand-in
      // `computeComparisonStats` put on them.
      uncalibratable = true;
    } else {
      families.push(shard.family);
    }
  }
  if (rows === null) {
    throw new Error('No shard of a bucket table carried its rows.');
  }
  if (uncalibratable) {
    return resolveBucketTableRows(rows, meta);
  }
  const correction = combineFamilyPartials(families);
  if (correction !== null) {
    applyFamilyCorrection(rows, correction);
  }
  return resolveBucketTableRows(rows, meta);
}

/**
 * Write a family correction onto the rows it was computed from.
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
  results: ComparisonStats[],
  correction: FamilyCorrection
) {
  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    // Exact, from the same relabellings, replacing the Welch stand-in.
    row.pValue = correction.pValues[i];
    row.pValueMethod = 'permutation';
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
  return {
    label,
    ...computeComparisonStats(baseIter, newIter, 'own-permutation'),
  };
}

/**
 * Correct the subtest scores for the fact that there are 20 of them.
 *
 * Twenty is a small enough family that plain Benjamini-Hochberg works, which the
 * ~6800-bucket tables could not use: BH rejects the k-th smallest of n p-values
 * when `p_k ≤ q · k / n`, so at n = 20 the most extreme subtest needs
 * `p ≤ 0.05 / 20 = 2.5e-3` — comfortably above the permutation floor of 5e-4,
 * where `0.05 / 6798 = 7.4e-6` was hopelessly below it. No joint relabelling
 * needed here, so this stays the simple, standard procedure.
 *
 * **Do not pass the overall score in.** It is the one hypothesis the developer
 * came to ask about, stated before any data was seen: "did my patch move the
 * score". Correcting it for the company of the 20 subtests would be answering a
 * question nobody asked, and would make the headline number harder to clear the
 * more subtests the benchmark happens to have.
 *
 * BH is valid here under positive dependence, which the subtest scores plausibly
 * have (a machine-wide effect moves all of them together) — and unlike the
 * buckets they are not a partition of shared samples, so there is no built-in
 * negative correlation to worry about.
 */
export function applyBenjaminiHochberg(
  subtestScores: ScoreComparison[],
  alpha: number = 0.05
) {
  const n = subtestScores.length;
  if (n === 0) {
    return;
  }

  // Re-base the MDE on the corrected bar, for the same reason the bucket tables
  // do: it is defined as the smallest change that would have been *reported*, so
  // correcting what gets reported without correcting it leaves the column
  // promising a sensitivity that is not there. Without this, a subtest could show
  // a Δ larger than its own MDE and still be labelled "no change" — which is what
  // Perf-Dashboard did, at Δ = -1.83 against ±1.52.
  //
  // The bar is `alpha / n`, which is BH's own threshold at rank 1: what a subtest
  // would have needed to clear on its own, with no help from any other subtest
  // also having moved. Same choice as the buckets' family-wise bar, and here it is
  // exactly the procedure's own first step rather than an approximation of it.
  for (const row of subtestScores) {
    row.mde = minimumDetectableEffect(row, alpha / n);
  }
  const ascending = subtestScores
    .map((row, index) => ({ index, pValue: row.pValue }))
    .sort((a, b) => a.pValue - b.pValue);

  // Walk from the least to the most extreme, carrying the smallest adjusted
  // value seen so far. That running minimum is what makes the result monotone:
  // BH's raw `p_k · n / k` is not, so a subtest could otherwise come out with a
  // better q than one with a smaller p-value.
  let best = 1;
  for (let k = n; k >= 1; k--) {
    const { index, pValue } = ascending[k - 1];
    best = Math.min(best, Math.min(1, (pValue * n) / k));
    subtestScores[index].qValue = best;
  }
  // `familyWiseP` stays null: there is no joint relabelling here, so no
  // max-statistic null to read one off. Bonferroni-Holm would be the analogue,
  // and nothing needs it yet.
}
