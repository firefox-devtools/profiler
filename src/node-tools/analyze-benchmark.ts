/**
 * Merge two existing profiles, taking the samples from the first profile and
 * the markers from the second profile.
 *
 * This was useful during early 2025 when the Mozilla Performance team was
 * doing a lot of Android startup profiling:
 *
 * - The "samples" profile would be collected using simpleperf and converted
 *   with samply import.
 * - The "markers" profile would be collected using the Gecko profiler.
 *
 * To use this script, it first needs to be built:
 *   yarn build-node-tools
 *
 * Then it can be run from the `node-tools-dist` directory:
 *   node node-tools-dist/analyze-benchmark.js --input ~/Downloads/munged-profile.json
 *
 * For example:
 *   yarn build-node-tools && node node-tools-dist/analyze-benchmark.js --input ~/Downloads/munged-profile.json
 *
 */

import fs from 'fs';
import minimist from 'minimist';

import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import { GOOGLE_STORAGE_BUCKET } from 'firefox-profiler/app-logic/constants';

import type {
  IndexIntoFuncTable,
  IndexIntoStackTable,
  Profile,
  RawProfileSharedData,
  RawThread,
} from '../types/profile';
import type { SamplesTableForThisStuff } from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';
import {
  computeBenchmarkScores,
  computeIterationMarkersAndMeasuredSamples,
  computeSampleWeightsWithSuiteFactorsApplied,
  getBenchmarkInfo,
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
import { compress } from 'firefox-profiler/utils/gz';

type ProfileSource =
  | {
      type: 'HASH';
      hash: string;
    }
  | {
      type: 'FILE';
      file: string;
    };

interface CliOptions {
  profile: ProfileSource;
  outputProfilePath: string | undefined;
  outputJsonPath: string | undefined;
}

export function getProfileUrlForHash(hash: string): string {
  // See https://cloud.google.com/storage/docs/access-public-data
  // The URL is https://storage.googleapis.com/<BUCKET>/<FILEPATH>.
  // https://<BUCKET>.storage.googleapis.com/<FILEPATH> seems to also work but
  // is not documented nowadays.

  // By convention, "profile-store" is the name of our bucket, and the file path
  // is the hash we receive in the URL.
  return `https://storage.googleapis.com/${GOOGLE_STORAGE_BUCKET}/${hash}`;
}

async function fetchProfileWithHash(hash: string): Promise<Profile> {
  const response = await fetch(getProfileUrlForHash(hash));
  const serializedProfile = await response.json();
  return unserializeProfileOfArbitraryFormat(serializedProfile);
}

async function loadProfileFromFile(path: string): Promise<Profile> {
  const uint8Array = fs.readFileSync(path, null);
  return unserializeProfileOfArbitraryFormat(uint8Array.buffer);
}

async function loadProfile(source: ProfileSource): Promise<Profile> {
  switch (source.type) {
    case 'HASH':
      return fetchProfileWithHash(source.hash);
    case 'FILE':
      return loadProfileFromFile(source.file);
    default:
      return source;
  }
}

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

export async function run(options: CliOptions) {
  const profile: Profile = await loadProfile(options.profile);
  const benchmarkInfo = getBenchmarkInfo(profile, 'speedometer');
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
  const sampleWeightsWithSuiteFactorsApplied =
    computeSampleWeightsWithSuiteFactorsApplied(
      iterationMarkersAndMeasuredSamples,
      benchmarkScores.factorPerSuite
    );
  console.log(benchmarkScores);

  const bucketNames = bucketFuncs.map(
    (funcIndex) => shared.stringArray[shared.funcTable.name[funcIndex]]
  );

  const profileBenchmarkInfo = {
    bucketFuncs,
    bucketNames,
    // bucketKeys, (type: label | js, when js include path and start line/col)
    benchmarkScores,
  };
  if (options.outputJsonPath !== undefined) {
    fs.writeFileSync(
      options.outputJsonPath,
      JSON.stringify(profileBenchmarkInfo)
    );
  }

  const adjustedWeightThread: RawThread = {
    ...thread,
    samples: {
      ...thread.samples,
      weight: [...sampleWeightsWithSuiteFactorsApplied],
      // weightType: 'tracing-ms',
    },
  };
  const adjustedWeightThreads = profile.threads.slice();
  adjustedWeightThreads[benchmarkInfo.threadIndex] = adjustedWeightThread;
  const adjustedWeightProfile: Profile = {
    ...profile,
    threads: adjustedWeightThreads,
  };

  if (options.outputProfilePath !== undefined) {
    if (options.outputProfilePath.endsWith('.gz')) {
      fs.writeFileSync(
        options.outputProfilePath,
        await compress(JSON.stringify(adjustedWeightProfile))
      );
    }
  }
}

export function makeOptionsFromArgv(processArgv: string[]): CliOptions {
  const argv = minimist(processArgv.slice(2));

  const hasSamplesHash = 'hash' in argv && typeof argv.hash === 'string';
  const hasSamplesFile = 'input' in argv && typeof argv.input === 'string';

  if (!hasSamplesHash && !hasSamplesFile) {
    throw new Error('Either --input or --hash must be supplied');
  }
  if (hasSamplesHash && hasSamplesFile) {
    throw new Error('Only one of --input or --hash can be supplied');
  }

  const profile: ProfileSource = hasSamplesHash
    ? { type: 'HASH', hash: argv.hash }
    : { type: 'FILE', file: argv.input };

  return {
    profile,
    outputProfilePath: argv['output-profile'],
    outputJsonPath: argv['output-json'],
  };
}

if (!module.parent) {
  try {
    const options = makeOptionsFromArgv(process.argv);
    run(options).catch((err) => {
      throw err;
    });
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
