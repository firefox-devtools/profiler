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

type NameMapEntry = {
  iterationTotals: number[];
  /** Func index of the highest-weight bucket with this name (representative). */
  representativeFunc: IndexIntoFuncTable;
  /** Sum of iterationTotals for that representative bucket alone. */
  representativeWeight: number;
};

/** Build a name → iterationTotals + representative-func map for a set of sparse bucket entries. */
function buildNameMap(
  buckets: SparseBucketEntry[],
  bucketNames: string[],
  bucketFuncs: IndexIntoFuncTable[]
): Map<string, NameMapEntry> {
  const map = new Map<string, NameMapEntry>();
  for (const entry of buckets) {
    const name =
      bucketNames[entry.bucketIndex] ?? `bucket#${entry.bucketIndex}`;
    const func = bucketFuncs[entry.bucketIndex];
    let weight = 0;
    for (const v of entry.iterationTotals) weight += v;
    const existing = map.get(name);
    if (existing !== undefined) {
      // If the same name appears twice (two different functions with identical names),
      // sum their iteration totals together. Pick the heaviest as the representative
      // func, since the flame graph can only focusSelf on one func.
      for (let i = 0; i < existing.iterationTotals.length; i++) {
        existing.iterationTotals[i] += entry.iterationTotals[i];
      }
      if (weight > existing.representativeWeight) {
        existing.representativeFunc = func;
        existing.representativeWeight = weight;
      }
    } else {
      map.set(name, {
        iterationTotals: entry.iterationTotals.slice(),
        representativeFunc: func,
        representativeWeight: weight,
      });
    }
  }
  return map;
}

/**
 * Compare two sparse bucket lists, matching by bucket name across profiles.
 * Buckets that appear in only one profile are treated as "appeared"/"disappeared"
 * unless excludeAppearedDisappeared is set.
 */
export function compareBuckets(
  baseBuckets: SparseBucketEntry[],
  newBuckets: SparseBucketEntry[],
  baseBucketNames: string[],
  newBucketNames: string[],
  baseBucketFuncs: IndexIntoFuncTable[],
  newBucketFuncs: IndexIntoFuncTable[],
  iterationCount: number,
  excludeAppearedDisappeared: boolean = false
): BucketComparison[] {
  const baseMap = buildNameMap(baseBuckets, baseBucketNames, baseBucketFuncs);
  const newMap = buildNameMap(newBuckets, newBucketNames, newBucketFuncs);

  const allNames = excludeAppearedDisappeared
    ? new Set([...baseMap.keys()].filter((k) => newMap.has(k)))
    : new Set([...baseMap.keys(), ...newMap.keys()]);

  const zeros = new Array<number>(iterationCount).fill(0);

  const results: BucketComparison[] = [];
  for (const name of allNames) {
    const baseEntry = baseMap.get(name);
    const newEntry = newMap.get(name);
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

    results.push({
      bucketName: name,
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
