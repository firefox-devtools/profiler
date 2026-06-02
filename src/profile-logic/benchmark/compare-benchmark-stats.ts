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

import type { SparseBucketEntry } from './extract-benchmark-stats';
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
// Comparison logic
// ---------------------------------------------------------------------------

export type BucketComparison = {
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
  iterationTotals: number[];
  /** Func index of the highest-weight bucket with this key (representative). */
  representativeFunc: IndexIntoFuncTable;
  /** Sum of iterationTotals for that representative bucket alone. */
  representativeWeight: number;
};

/** Build a key → iterationTotals + representative-func map for a set of sparse bucket entries. */
function buildKeyMap(
  buckets: SparseBucketEntry[],
  bucketKeys: string[],
  bucketNames: string[],
  bucketFuncs: IndexIntoFuncTable[]
): Map<string, KeyMapEntry> {
  const map = new Map<string, KeyMapEntry>();
  for (const entry of buckets) {
    const key =
      bucketKeys[entry.bucketIndex] ?? `bucket#${entry.bucketIndex}`;
    const name =
      bucketNames[entry.bucketIndex] ?? `bucket#${entry.bucketIndex}`;
    const func = bucketFuncs[entry.bucketIndex];
    let weight = 0;
    for (const v of entry.iterationTotals) weight += v;
    const existing = map.get(key);
    if (existing !== undefined) {
      // If the same key appears twice (two different funcs that collapsed to
      // the same matching key — e.g. an inlined and non-inlined copy of the
      // same JS function), sum their iteration totals together. Pick the
      // heaviest as the representative func, since the flame graph can only
      // focusSelf on one func.
      for (let i = 0; i < existing.iterationTotals.length; i++) {
        existing.iterationTotals[i] += entry.iterationTotals[i];
      }
      if (weight > existing.representativeWeight) {
        existing.representativeFunc = func;
        existing.representativeWeight = weight;
        existing.displayName = name;
      }
    } else {
      map.set(key, {
        displayName: name,
        iterationTotals: entry.iterationTotals.slice(),
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

    if (baseMean === 0 && newMean === 0) continue;

    const allValues = [...baseIter, ...newIter];
    const u = mannWhitneyU(baseIter, newIter);
    const pValue = mannWhitneyPValue(
      u,
      baseIter.length,
      newIter.length,
      allValues
    );
    const relChange =
      baseMean === 0 ? Infinity : (newMean - baseMean) / baseMean;
    const delta = cliffsDelta(u, baseIter.length, newIter.length);
    const effectSize = interpretEffectSize(delta);
    const confidence = pValueToConfidence(pValue);

    // Prefer the base profile's display name; fall back to the new one.
    const displayName = baseEntry?.displayName ?? newEntry?.displayName ?? key;

    results.push({
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

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
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
  const allValues = [...baseIter, ...newIter];
  const u = mannWhitneyU(baseIter, newIter);
  const pValue = mannWhitneyPValue(
    u,
    baseIter.length,
    newIter.length,
    allValues
  );
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
