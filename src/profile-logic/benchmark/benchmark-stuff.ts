/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Marker,
  Profile,
  RawProfileSharedData,
  RawThread,
  StartEndRange,
} from 'firefox-profiler/types';
import type { StringTable } from 'firefox-profiler/utils/string-table';
import { ensureExists } from 'firefox-profiler/utils/types';
// import { computeBucketStats } from 'firefox-profiler/utils/stats';

export type BenchmarkHarness = 'speedometer' | 'jetstream';

type BenchmarkInfo = {
  suiteNameIfSingleSuite: string | null;
  threadIndex: number;
  getMeasuredTimeRanges: (
    markers: any,
    stringTable: any
  ) => StartEndRange[] | null;
  getMarkersPerSuite: (markers: any, stringTable: any) => Map<string, Marker[]>;
};

export function getBenchmarkInfo(
  profile: Profile,
  benchmarkHarness: BenchmarkHarness
): BenchmarkInfo {
  if (benchmarkHarness === 'speedometer') {
    return getSpeedometerBenchmarkInfo(profile);
  }
  if (benchmarkHarness === 'jetstream') {
    return getJetStreamBenchmarkInfo(profile);
  }
  throw new Error(`Unknown benchmarkHarness: ${benchmarkHarness}`);
}

export function getSpeedometerBenchmarkInfo(profile: Profile): BenchmarkInfo {
  const { threads, shared } = profile;
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const thread = threads[threadIndex];
    const suiteNames = speedometerSuiteNamesOnThread(thread, shared);
    if (suiteNames.length !== 0) {
      const suiteNameIfSingleSuite =
        suiteNames.length === 1 ? suiteNames[0] : null;
      return {
        suiteNameIfSingleSuite,
        threadIndex,
        getMarkersPerSuite: getSpeedometerMarkersPerSuite,
        getMeasuredTimeRanges: getSpeedometerMeasuredTimeRanges,
      };
    }
  }
  throw new Error(
    "Could not find a thread with markers that start with 'suite-'"
  );
}

export function getSpeedometerMarkersPerSuite(
  markers: Marker[],
  stringTable: StringTable
): Map<string, Marker[]> {
  const markersPerSuiteName: Map<string, Marker[]> = new Map();
  for (const m of markers) {
    if (
      (m.name === 'UserTiming' || m.name === 'SimpleMarker') &&
      m.end !== null &&
      m.data &&
      'name' in m.data &&
      m.data.name
    ) {
      const nameOrNameIndex = m.data.name;
      let markerName = '';
      if (typeof nameOrNameIndex === 'number') {
        markerName = stringTable.getString(nameOrNameIndex);
      }
      if (markerName.startsWith('suite-') && !markerName.endsWith('-prepare')) {
        const suiteName = markerName.slice('suite-'.length);
        let markersForThisSuite = markersPerSuiteName.get(suiteName);
        if (markersForThisSuite === undefined) {
          markersForThisSuite = [];
          markersPerSuiteName.set(suiteName, markersForThisSuite);
        }
        markersForThisSuite.push(m);
      }
    }
  }
  return markersPerSuiteName;
}

export function getSpeedometerMeasuredTimeRanges(
  markers: Marker[],
  stringTable: StringTable
): StartEndRange[] | null {
  const ranges = [];
  for (const m of markers) {
    if (
      (m.name === 'UserTiming' || m.name === 'SimpleMarker') &&
      m.end !== null &&
      m.data &&
      'name' in m.data &&
      m.data.name
    ) {
      const nameOrNameIndex = m.data.name;
      let markerName = '';
      if (typeof nameOrNameIndex === 'number') {
        markerName = stringTable.getString(nameOrNameIndex);
      }
      if (markerName.includes('-sync') || markerName.includes('-async')) {
        ranges.push({ start: m.start, end: m.end });
      }
    }
  }
  return ranges;
}

export function getJetStreamBenchmarkInfo(profile: Profile): BenchmarkInfo {
  const { threads, shared } = profile;
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const thread = threads[threadIndex];
    const suiteNames = jetstreamSuiteNamesOnThread(thread, shared);
    if (suiteNames.length !== 0) {
      const suiteNameIfSingleSuite =
        suiteNames.length === 1 ? suiteNames[0] : null;
      return {
        suiteNameIfSingleSuite,
        threadIndex,
        getMarkersPerSuite: getJetstreamMarkersPerSuite,
        getMeasuredTimeRanges: () => null,
      };
    }
  }
  throw new Error(
    "Could not find a thread with markers that include '-iteration-'"
  );
}

export function jetstreamSuiteNamesOnThread(
  rawThread: RawThread,
  shared: RawProfileSharedData
): string[] {
  const names: Set<string> = new Set();
  const { markers } = rawThread;
  const { stringArray } = shared;
  let userTimingMarkerNameStringIndex = stringArray.indexOf('UserTiming');
  const simpleMarkerNameStringIndex = stringArray.indexOf('SimpleMarker');
  if (
    userTimingMarkerNameStringIndex === -1 ||
    (simpleMarkerNameStringIndex !== -1 &&
      simpleMarkerNameStringIndex < userTimingMarkerNameStringIndex)
  ) {
    userTimingMarkerNameStringIndex = simpleMarkerNameStringIndex;
  }
  for (let i = 0; i < markers.length; i++) {
    if (markers.phase[i] === 0) {
      continue;
    }
    if (markers.name[i] !== userTimingMarkerNameStringIndex) {
      continue;
    }
    const data = markers.data[i];
    if (!data || !('name' in data) || !data.name) {
      continue;
    }

    const markerName =
      typeof data.name === 'string' ? data.name : stringArray[data.name];
    const match = markerName.match(/^(.*?)-iteration-[0-9]+$/);
    if (match !== null) {
      names.add(match[1]);
    }
  }
  return [...names];
}
export function getJetstreamMarkersPerSuite(
  markers: Marker[],
  stringTable: StringTable
): Map<string, Marker[]> {
  const markersPerSuiteName: Map<string, Marker[]> = new Map();
  for (const m of markers) {
    if (
      (m.name === 'UserTiming' || m.name === 'SimpleMarker') &&
      m.end !== null &&
      m.data &&
      'name' in m.data &&
      m.data.name
    ) {
      const data = m.data;
      const markerName =
        typeof data.name === 'string'
          ? data.name
          : stringTable.getString(data.name);
      const match = markerName.match(/^(.*?)-iteration-[0-9]+$/);
      if (match !== null) {
        const suiteName = match[1];
        let markersForThisSuite = markersPerSuiteName.get(suiteName);
        if (markersForThisSuite === undefined) {
          markersForThisSuite = [];
          markersPerSuiteName.set(suiteName, markersForThisSuite);
        }
        markersForThisSuite.push(m);
      }
    }
  }
  return markersPerSuiteName;
}

export function speedometerSuiteNamesOnThread(
  rawThread: RawThread,
  shared: RawProfileSharedData
): string[] {
  const names: Set<string> = new Set();
  const { markers } = rawThread;
  const { stringArray } = shared;
  let userTimingMarkerNameStringIndex = stringArray.indexOf('UserTiming');
  const simpleMarkerNameStringIndex = stringArray.indexOf('SimpleMarker');
  if (
    userTimingMarkerNameStringIndex === -1 ||
    (simpleMarkerNameStringIndex !== -1 &&
      simpleMarkerNameStringIndex < userTimingMarkerNameStringIndex)
  ) {
    userTimingMarkerNameStringIndex = simpleMarkerNameStringIndex;
  }
  for (let i = 0; i < markers.length; i++) {
    if (markers.phase[i] === 0) {
      continue;
    }
    if (markers.name[i] !== userTimingMarkerNameStringIndex) {
      continue;
    }
    const data = markers.data[i];
    if (!data || !('name' in data) || !data.name) {
      continue;
    }

    const markerName =
      typeof data.name === 'string' ? data.name : stringArray[data.name];
    if (markerName.startsWith('suite-')) {
      const suiteName = ensureExists(
        markerName.match(/^suite-(.*?)(-prepare)?$/)
      )[1];
      names.add(suiteName);
    }
  }
  return [...names];
}

export function threadHasMatchingMarkers(
  rawThread: RawThread,
  shared: RawProfileSharedData,
  markerFilter: string
) {
  const { markers } = rawThread;
  const { stringArray } = shared;
  let userTimingMarkerNameStringIndex = stringArray.indexOf('UserTiming');
  const simpleMarkerNameStringIndex = stringArray.indexOf('SimpleMarker');
  if (
    userTimingMarkerNameStringIndex === -1 ||
    (simpleMarkerNameStringIndex !== -1 &&
      simpleMarkerNameStringIndex < userTimingMarkerNameStringIndex)
  ) {
    userTimingMarkerNameStringIndex = simpleMarkerNameStringIndex;
  }
  for (let i = 0; i < markers.length; i++) {
    if (markers.phase[i] === 0) {
      continue;
    }
    if (markers.name[i] !== userTimingMarkerNameStringIndex) {
      continue;
    }
    const data = markers.data[i];
    if (!data || !('name' in data) || !data.name) {
      continue;
    }

    const markerName =
      typeof data.name === 'string' ? data.name : stringArray[data.name];
    // Check if the `markerFilter` string is contained in the marker name.
    // TODO: Let the front-end do the matching, so that all the various search
    // syntaxes work correctly (comma separated multi search, matching by field, etc)
    if (markerName.includes(markerFilter)) {
      return true;
    }
  }
  return false;
}

export type SamplesTableForThisStuff = {
  time: Float64Array;
  weight: Float64Array;
  bucketIndex: Int32Array;
  bucketCount: number;
  length: number;
};

export type BenchmarkScores = {
  geomean: number;
  allSuiteScores: SuiteScores[];
  factorPerSuite: number[];
};

export type IterationMarkersAndMeasuredSamples = {
  markersPerSuite: Array<[string, Marker[]]>;
  measuredSamples: SamplesTableForThisStuff;
};

export function computeIterationMarkersAndMeasuredSamples(
  benchmarkInfo: BenchmarkInfo,
  filteredMarkers: Marker[],
  samples: SamplesTableForThisStuff,
  stringTable: StringTable,
  bucketsToIgnore: number[]
): IterationMarkersAndMeasuredSamples {
  const measuredTimeRanges = benchmarkInfo.getMeasuredTimeRanges(
    filteredMarkers,
    stringTable
  );
  const measuredWeights = samples.weight.slice();
  if (measuredTimeRanges !== null) {
    zeroWeightsOutsideRanges(measuredWeights, samples.time, measuredTimeRanges);
  }
  zeroWeightsForBuckets(measuredWeights, samples.bucketIndex, bucketsToIgnore);
  const measuredSamples = {
    ...samples,
    weight: measuredWeights,
  };
  const markersPerSuite = [
    ...benchmarkInfo.getMarkersPerSuite(filteredMarkers, stringTable),
  ];
  return { markersPerSuite, measuredSamples };
}

export function computeBenchmarkScores(
  iterationMarkersAndMeasuredSamples: IterationMarkersAndMeasuredSamples
): BenchmarkScores {
  const { markersPerSuite, measuredSamples } =
    iterationMarkersAndMeasuredSamples;
  const allSuiteScores = markersPerSuite.map(([suiteName, iterationMarkers]) =>
    computeSuiteScores(suiteName, iterationMarkers, measuredSamples)
  );
  const geomean = computeGeomean(allSuiteScores.map((s) => s.total));
  const factorPerSuite = allSuiteScores.map(
    (suiteScores) => geomean / suiteScores.total
  );
  return { geomean, allSuiteScores, factorPerSuite };
}

function computeGeomean(values: number[]): number {
  let product = 1;
  for (const value of values) {
    product *= value;
  }
  return Math.pow(product, 1 / values.length);
}

function zeroWeightsOutsideRanges(
  sampleWeights: Float64Array,
  sampleTimes: Float64Array,
  nonZeroRanges: StartEndRange[]
) {
  let sampleIndex = 0;
  const sampleCount = sampleTimes.length;
  for (let rangeIndex = 0; rangeIndex < nonZeroRanges.length; rangeIndex++) {
    const range = nonZeroRanges[rangeIndex];
    const rangeStart = range.start;
    const rangeEnd = range.end;

    // Zero out sample weights before the range.
    for (; sampleIndex < sampleCount; sampleIndex++) {
      if (sampleTimes[sampleIndex] >= rangeStart) {
        break;
      }
      sampleWeights[sampleIndex] = 0;
    }

    // Skip over samples inside the range.
    for (; sampleIndex < sampleCount; sampleIndex++) {
      if (sampleTimes[sampleIndex] >= rangeEnd) {
        break;
      }
    }
  }

  // Zero out sample weights at the end
  for (; sampleIndex < sampleCount; sampleIndex++) {
    sampleWeights[sampleIndex] = 0;
  }
}

function zeroWeightsForBuckets(
  sampleWeights: Float64Array,
  sampleBuckets: Int32Array,
  bucketsToZeroOut: number[]
) {
  for (let i = 0; i < sampleWeights.length; i++) {
    if (bucketsToZeroOut.includes(sampleBuckets[i])) {
      sampleWeights[i] = 0;
    }
  }
}

export function computeSampleWeightsWithSuiteFactorsApplied(
  iterationMarkersAndMeasuredSamples: IterationMarkersAndMeasuredSamples,
  suiteFactors: Array<number>
): Float64Array {
  const { markersPerSuite, measuredSamples: samples } =
    iterationMarkersAndMeasuredSamples;
  const newWeights = samples.weight.slice();
  for (let i = 0; i < markersPerSuite.length; i++) {
    const [_suiteName, iterationMarkers] = markersPerSuite[i];
    const factor = suiteFactors[i];
    applySuiteFactor(samples.time, newWeights, iterationMarkers, factor);
  }
  return newWeights;
}

function applySuiteFactor(
  sampleTimes: Float64Array,
  sampleWeights: Float64Array,
  iterationMarkers: Marker[],
  factor: number
) {
  let sampleIndex = 0;
  const sampleCount = sampleWeights.length;
  for (
    let iterationIndex = 0;
    iterationIndex < iterationMarkers.length;
    iterationIndex++
  ) {
    const marker = iterationMarkers[iterationIndex];
    const rangeStart = marker.start;
    const rangeEnd = ensureExists(marker.end);

    // Skip over samples before the range.
    for (; sampleIndex < sampleCount; sampleIndex++) {
      if (sampleTimes[sampleIndex] >= rangeStart) {
        break;
      }
    }

    // Process samples inside the range.
    for (; sampleIndex < sampleCount; sampleIndex++) {
      if (sampleTimes[sampleIndex] >= rangeEnd) {
        break;
      }
      sampleWeights[sampleIndex] *= factor;
    }
  }
}

function computeBucketStats(
  bucketIterationTotals: Float64Array,
  bucketCount: number,
  iterationCount: number
): AllBucketStats {
  const bucketMeans = new Float64Array(bucketCount);
  const bucketVariances = new Float64Array(bucketCount);
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
    const startIndex = bucketIndex * iterationCount;
    let totalSum = 0;
    for (
      let iterationIndex = 0;
      iterationIndex < iterationCount;
      iterationIndex++
    ) {
      totalSum += bucketIterationTotals[startIndex + iterationIndex];
    }
    const mean = totalSum / iterationCount;
    let squareDiffSum = 0;
    for (
      let iterationIndex = 0;
      iterationIndex < iterationCount;
      iterationIndex++
    ) {
      const diff = bucketIterationTotals[startIndex + iterationIndex] - mean;
      const squareDiff = diff * diff;
      squareDiffSum += squareDiff;
    }
    const variance = squareDiffSum / (iterationCount - 1);
    bucketMeans[bucketIndex] = mean;
    bucketVariances[bucketIndex] = variance;
  }
  return { iterationCount, bucketMeans, bucketVariances };
}

export type AllBucketStats = {
  iterationCount: number;
  bucketMeans: Float64Array;
  bucketVariances: Float64Array;
};

export type SuiteScores = {
  suiteName: string;
  total: number;
  bucketTotals: Float64Array<ArrayBuffer>;
  bucketIterationTotals: Float64Array<ArrayBuffer>;
  bucketStats: AllBucketStats | null;
};

function computeSuiteScores(
  suiteName: string,
  iterationMarkers: Marker[],
  samples: SamplesTableForThisStuff
): SuiteScores {
  const iterationCount = iterationMarkers.length;
  const bucketCount = samples.bucketCount;
  const bucketTotals = new Float64Array(bucketCount);
  const bucketIterationTotals = new Float64Array(bucketCount * iterationCount);
  let total = 0;

  let sampleIndex = 0;
  const sampleCount = samples.length;
  for (
    let iterationIndex = 0;
    iterationIndex < iterationMarkers.length;
    iterationIndex++
  ) {
    const marker = iterationMarkers[iterationIndex];
    const rangeStart = marker.start;
    const rangeEnd = ensureExists(marker.end);

    // Skip over samples before the range.
    for (; sampleIndex < sampleCount; sampleIndex++) {
      if (samples.time[sampleIndex] >= rangeStart) {
        break;
      }
    }

    // Process samples inside the range.
    for (; sampleIndex < sampleCount; sampleIndex++) {
      if (samples.time[sampleIndex] >= rangeEnd) {
        break;
      }
      const bucketIndex = samples.bucketIndex[sampleIndex];
      if (bucketIndex === -1) {
        continue;
      }

      // Map this sample to its bucket and accumulate the weight.
      const sampleWeight = samples.weight[sampleIndex];
      total += sampleWeight;
      bucketTotals[bucketIndex] += sampleWeight;
      bucketIterationTotals[bucketIndex * iterationCount + iterationIndex] +=
        sampleWeight;
    }
  }

  const bucketStats = computeBucketStats(
    bucketIterationTotals,
    bucketCount,
    iterationCount
  );

  return {
    suiteName,
    total,
    bucketTotals,
    bucketIterationTotals,
    bucketStats,
  };
}
