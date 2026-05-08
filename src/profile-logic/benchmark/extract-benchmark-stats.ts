/**
 * Extract per-bucket, per-iteration statistics from a benchmark profile into a
 * compact intermediate JSON file suitable for cross-profile comparison.
 *
 * The output is intentionally sparse: only (suite, bucket) pairs with nonzero
 * weight are stored. At 200 iterations × 10578 buckets × 20 suites a dense
 * representation would be ~323 MB; the sparse form is ~2 MB.
 *
 * Usage:
 *   yarn build-node-tools
 *   node node-tools-dist/extract-benchmark-stats.js \
 *     --input ~/Downloads/profile.json \
 *     --output /tmp/profile-stats.json
 */

import {
  computeBenchmarkScores,
  computeIterationMarkersAndMeasuredSamples,
  getBenchmarkInfo,
} from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';
import type {
  BenchmarkHarness,
  SamplesTableForThisStuff,
} from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';
import {
  correlateIPCMarkers,
  deriveMarkersFromRawMarkerTable,
} from 'firefox-profiler/profile-logic/marker-data';
import {
  computeTimeColumnForRawSamplesTable,
  getTimeRangeForThread,
} from 'firefox-profiler/profile-logic/profile-data';
import { StringTable } from 'firefox-profiler/utils/string-table';

import type {
  IndexIntoFuncTable,
  IndexIntoStackTable,
  Profile,
  RawProfileSharedData,
} from '../../types/profile';

// ---------------------------------------------------------------------------
// Types for the intermediate JSON
// ---------------------------------------------------------------------------

/** One (suite, bucket) pair with nonzero weight. */
export type SparseBucketEntry = {
  /** Index into the profile's global bucket list. */
  bucketIndex: number;
  /** Weight sum per iteration, length = iterationCount. */
  iterationTotals: number[];
};

export type SuiteStats = {
  suiteName: string;
  iterationCount: number;
  /** Only buckets that have nonzero total weight across all iterations. */
  buckets: SparseBucketEntry[];
};

export type ProfileBenchmarkStats = {
  /** Name of each bucket (JS function name or similar). Length = total bucket count. */
  bucketNames: string[];
  /**
   * Func index (in profile.shared.funcTable) for each bucket. Same length as
   * bucketNames. -1 for the synthetic "no JS frame" bucket. Useful when callers
   * want to reach back into the source profile for a given bucket, e.g. to feed
   * a focusSelf() flame graph.
   */
  bucketFuncs: Array<IndexIntoFuncTable>;
  /**
   * Per-bucket weight summed across all suites, with suite geomean factors applied,
   * per iteration. Sparse: only buckets with nonzero global total.
   * This is the "geomean-normalised" global view.
   */
  globalBuckets: SparseBucketEntry[];
  /** Per-suite sparse bucket data. */
  suites: SuiteStats[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeJsOnlySampleBuckets(
  shared: RawProfileSharedData,
  sampleStacks: Array<IndexIntoStackTable | null>
): {
  bucketFuncs: Array<IndexIntoFuncTable>;
  sampleBuckets: Int32Array<ArrayBuffer>;
} {
  const { funcTable, stackTable, frameTable } = shared;
  const bucketFuncs = new Array<IndexIntoFuncTable>();
  const funcIndexToBucketIndex = new Map<IndexIntoFuncTable, number>();

  const stackIndexToJsOnlyFuncIndex = new Int32Array(stackTable.length);
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    if (funcTable.isJS[funcIndex] || funcTable.relevantForJS[funcIndex]) {
      stackIndexToJsOnlyFuncIndex[stackIndex] = funcIndex;
    } else {
      const parentStackIndex = stackTable.prefix[stackIndex];
      if (parentStackIndex !== null) {
        stackIndexToJsOnlyFuncIndex[stackIndex] =
          stackIndexToJsOnlyFuncIndex[parentStackIndex];
      } else {
        stackIndexToJsOnlyFuncIndex[stackIndex] = -1;
      }
    }
  }

  const sampleBuckets = new Int32Array(sampleStacks.length);
  for (let sampleIndex = 0; sampleIndex < sampleBuckets.length; sampleIndex++) {
    const stackIndex = sampleStacks[sampleIndex];
    if (stackIndex !== null) {
      const jsOnlyFuncIndex = stackIndexToJsOnlyFuncIndex[stackIndex];
      let bucketIndex =
        jsOnlyFuncIndex !== -1
          ? funcIndexToBucketIndex.get(jsOnlyFuncIndex)
          : -1;
      if (bucketIndex === undefined) {
        bucketIndex = bucketFuncs.length;
        bucketFuncs[bucketIndex] = jsOnlyFuncIndex;
        funcIndexToBucketIndex.set(jsOnlyFuncIndex, bucketIndex);
      }
      sampleBuckets[sampleIndex] = bucketIndex;
    } else {
      sampleBuckets[sampleIndex] = -1;
    }
  }

  return { bucketFuncs, sampleBuckets };
}

// ---------------------------------------------------------------------------
// Main extraction logic
// ---------------------------------------------------------------------------

/**
 * Extract per-bucket, per-iteration statistics from an already-loaded Profile.
 * This is the browser-safe core of the extraction logic; it has no I/O dependencies.
 */
export function extractBenchmarkStatsFromProfile(
  profile: Profile,
  benchmarkHarness: BenchmarkHarness = 'speedometer'
): ProfileBenchmarkStats {
  const benchmarkInfo = getBenchmarkInfo(profile, benchmarkHarness);
  const { shared } = profile;
  const thread = profile.threads[benchmarkInfo.threadIndex];

  const { markers } = deriveMarkersFromRawMarkerTable(
    thread.markers,
    shared.stringArray,
    thread.tid,
    getTimeRangeForThread(thread, profile.meta.interval),
    correlateIPCMarkers(profile.threads, shared)
  );
  const stringTable = StringTable.withBackingArray(shared.stringArray);

  const sampleCount = thread.samples.length;
  const { sampleBuckets, bucketFuncs } = computeJsOnlySampleBuckets(
    shared,
    thread.samples.stack
  );

  const profileOverheadBucket = bucketFuncs.findIndex(
    (func) =>
      shared.stringArray[shared.funcTable.name[func]] === 'Profiling overhead'
  );
  const bucketsToIgnore =
    profileOverheadBucket !== -1 ? [profileOverheadBucket] : [];

  const samples: SamplesTableForThisStuff = {
    length: sampleCount,
    time: new Float64Array(computeTimeColumnForRawSamplesTable(thread.samples)),
    weight: thread.samples.weight
      ? new Float64Array(thread.samples.weight)
      : new Float64Array(sampleCount).fill(1),
    bucketIndex: sampleBuckets,
    bucketCount: bucketFuncs.length,
  };

  const iterationMarkersAndMeasuredSamples =
    computeIterationMarkersAndMeasuredSamples(
      benchmarkInfo,
      markers,
      samples,
      stringTable,
      bucketsToIgnore
    );

  const benchmarkScores = computeBenchmarkScores(
    iterationMarkersAndMeasuredSamples
  );

  const bucketNames = bucketFuncs.map(
    (funcIndex) => shared.stringArray[shared.funcTable.name[funcIndex]]
  );

  const bucketCount = bucketFuncs.length;
  const { allSuiteScores, factorPerSuite } = benchmarkScores;

  // Build per-suite sparse entries
  const suites: SuiteStats[] = allSuiteScores.map((suiteScores) => {
    const iterationCount = suiteScores.bucketStats!.iterationCount;
    const buckets: SparseBucketEntry[] = [];

    for (let b = 0; b < bucketCount; b++) {
      if (suiteScores.bucketTotals[b] === 0) {
        continue;
      }
      const iterationTotals: number[] = new Array(iterationCount);
      const base = b * iterationCount;
      for (let i = 0; i < iterationCount; i++) {
        iterationTotals[i] = suiteScores.bucketIterationTotals[base + i];
      }
      buckets.push({ bucketIndex: b, iterationTotals });
    }

    return {
      suiteName: suiteScores.suiteName,
      iterationCount,
      buckets,
    };
  });

  // Build global sparse entries: sum factorPerSuite[s] * bucketIterationTotals[s][b][i]
  // All suites share the same iterationCount, so we can use the first suite's value.
  const iterationCount = allSuiteScores[0].bucketStats!.iterationCount;
  const globalIterTotals = new Float64Array(bucketCount * iterationCount);

  for (let suiteIndex = 0; suiteIndex < allSuiteScores.length; suiteIndex++) {
    const factor = factorPerSuite[suiteIndex];
    const suiteScores = allSuiteScores[suiteIndex];
    for (let b = 0; b < bucketCount; b++) {
      if (suiteScores.bucketTotals[b] === 0) {
        continue;
      }
      const base = b * iterationCount;
      for (let i = 0; i < iterationCount; i++) {
        globalIterTotals[base + i] +=
          factor * suiteScores.bucketIterationTotals[base + i];
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
    const iterationTotals: number[] = new Array(iterationCount);
    for (let i = 0; i < iterationCount; i++) {
      iterationTotals[i] = globalIterTotals[base + i];
    }
    globalBuckets.push({ bucketIndex: b, iterationTotals });
  }

  return { bucketNames, bucketFuncs, globalBuckets, suites };
}
