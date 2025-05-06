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
 *   yarn build-merge-android-profiles
 *
 * Then it can be run from the `dist` directory:
 *   node dist/merge-android-profiles.js --samples-hash warg8azfac0z5b5sy92h4a69bfrj2fqsjc6ty58 --markers-hash mb6220c2rx3mmhegv82d84tsvgn6a5p8r7g4je8 --output-file ~/Downloads/merged-profile.json
 *
 * For example:
 *   yarn build-merge-android-profiles && node dist/merge-android-profiles.js --samples-hash warg8azfac0z5b5sy92h4a69bfrj2fqsjc6ty58 --markers-hash mb6220c2rx3mmhegv82d84tsvgn6a5p8r7g4je8 --output-file ~/Downloads/merged-profile.json
 *
 */

import fs from 'fs';
import minimist from 'minimist';

import {
  unserializeProfileOfArbitraryFormat,
  adjustMarkerTimestamps,
} from '../profile-logic/process-profile';
import { getProfileUrlForHash } from '../actions/receive-profile';
import { computeStringIndexMarkerFieldsByDataType } from '../profile-logic/marker-schema';
import { ensureExists } from '../utils/types';
import { StringTable } from '../utils/string-table';

import type { Profile, RawThread, Tid } from '../types/profile';
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
  samplesProf: ProfileSource;
  markersProf: ProfileSource;
  filterByProcessPrefix: string | undefined;
  assumeSamplesProfileHasStartTimeZero: boolean;
  outputFile: string;
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

export async function run(options: CliOptions) {
  const profileWithSamples: Profile = await loadProfile(options.samplesProf);
  const profileWithMarkers: Profile = await loadProfile(options.markersProf);

  // const referenceSampleTime = 169912951.547432; // filteredThread.samples.time[0] after zooming in on samples in mozilla::dom::indexedDB::BackgroundTransactionChild::RecvComplete
  // const referenceMarkerTime = 664.370158 ; // selectedMarker.start after selecting the marker for the "complete" DOMEvent

  // console.log(profileWithSamples.meta);
  // console.log(profileWithMarkers.meta);

  if (
    profileWithSamples.meta.startTimeAsClockMonotonicNanosecondsSinceBoot ===
      undefined &&
    options.assumeSamplesProfileHasStartTimeZero
  ) {
    profileWithSamples.meta.startTimeAsClockMonotonicNanosecondsSinceBoot = 0;
  }

  let timeDelta =
    profileWithMarkers.meta.startTime - profileWithSamples.meta.startTime;
  if (
    profileWithSamples.meta.startTimeAsClockMonotonicNanosecondsSinceBoot !==
      undefined &&
    profileWithMarkers.meta.startTimeAsClockMonotonicNanosecondsSinceBoot !==
      undefined
  ) {
    timeDelta =
      (profileWithMarkers.meta.startTimeAsClockMonotonicNanosecondsSinceBoot -
        profileWithSamples.meta.startTimeAsClockMonotonicNanosecondsSinceBoot) /
      1000000;
  }

  // console.log({ timeDelta });

  const profile = profileWithSamples;
  profile.meta.markerSchema = profileWithMarkers.meta.markerSchema;
  profile.pages = profileWithMarkers.pages;

  const markerProfileCategoryToCategory = new Map();
  const markerProfileCategories = ensureExists(
    profileWithMarkers.meta.categories
  );
  const profileCategories = ensureExists(profile.meta.categories);
  for (
    let markerCategoryIndex = 0;
    markerCategoryIndex < markerProfileCategories.length;
    markerCategoryIndex++
  ) {
    const category = markerProfileCategories[markerCategoryIndex];
    let categoryIndex = profileCategories.findIndex(
      (c) => c.name === category.name
    );
    if (categoryIndex === -1) {
      categoryIndex = profileCategories.length;
      profileCategories[categoryIndex] = {
        name: category.name,
        color: category.color,
        subcategories: ['Other'],
      };
    }
    markerProfileCategoryToCategory.set(markerCategoryIndex, categoryIndex);
  }

  const markerThreadsByTid = new Map<Tid, RawThread>(
    profileWithMarkers.threads.map((thread) => ['' + thread.tid, thread])
  );
  // console.log([...markerThreadsByTid.keys()]);

  // console.log(profile.threads.map((thread) => thread.tid));

  const stringIndexMarkerFieldsByDataType =
    computeStringIndexMarkerFieldsByDataType(profile.meta.markerSchema);

  const sampleThreadTidsWithoutCorrespondingMarkerThreads = new Set();

  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);
  const markerStringArray = profileWithMarkers.shared.stringArray;
  const keptThreads = [];
  for (const thread of profile.threads) {
    if (options.filterByProcessPrefix !== undefined) {
      if (!thread.processName!.startsWith(options.filterByProcessPrefix)) {
        continue;
      }
    }
    keptThreads.push(thread);
    const tid = thread.tid;
    const markerThread = markerThreadsByTid.get(tid);
    if (markerThread === undefined) {
      sampleThreadTidsWithoutCorrespondingMarkerThreads.add(tid);
      continue;
    }
    markerThreadsByTid.delete(tid);

    thread.markers = adjustMarkerTimestamps(markerThread.markers, timeDelta);
    for (let i = 0; i < thread.markers.length; i++) {
      thread.markers.category[i] = ensureExists(
        markerProfileCategoryToCategory.get(thread.markers.category[i])
      );
      thread.markers.name[i] = stringTable.indexForString(
        markerStringArray[thread.markers.name[i]]
      );
      const data = thread.markers.data[i];
      if (data !== null && data.type) {
        const markerType = data.type;
        const stringIndexMarkerFields =
          stringIndexMarkerFieldsByDataType.get(markerType);
        if (stringIndexMarkerFields !== undefined) {
          for (const fieldKey of stringIndexMarkerFields) {
            const stringIndex = (data as any)[fieldKey];
            if (typeof stringIndex === 'number') {
              const newStringIndex = stringTable.indexForString(
                markerStringArray[stringIndex]
              );
              (data as any)[fieldKey] = newStringIndex;
            }
          }
        }
      }
    }
  }

  profile.threads = keptThreads;

  // console.log(
  //   `Have ${markerThreadsByTid.size} marker threads left over which weren't slurped up by sample threads:`,
  //   [...markerThreadsByTid.keys()]
  // );
  // if (markerThreadsByTid.size !== 0) {
  //   console.log(
  //     `Have ${sampleThreadTidsWithoutCorrespondingMarkerThreads.size} sample threads which didn't find corresponding marker threads:`,
  //     [...sampleThreadTidsWithoutCorrespondingMarkerThreads]
  //   );
  // }

  if (options.outputFile.endsWith('.gz')) {
    fs.writeFileSync(
      options.outputFile,
      await compress(JSON.stringify(profile))
    );
  } else {
    fs.writeFileSync(options.outputFile, JSON.stringify(profile));
  }
}

export function makeOptionsFromArgv(processArgv: string[]): CliOptions {
  const argv = minimist(processArgv.slice(2));

  const hasSamplesHash =
    'samples-hash' in argv && typeof argv['samples-hash'] === 'string';
  const hasSamplesFile =
    'samples-file' in argv && typeof argv['samples-file'] === 'string';
  const hasMarkersHash =
    'markers-hash' in argv && typeof argv['markers-hash'] === 'string';
  const hasMarkersFile =
    'markers-file' in argv && typeof argv['markers-file'] === 'string';

  if (!hasSamplesHash && !hasSamplesFile) {
    throw new Error('Either --samples-file or --samples-hash must be supplied');
  }
  if (hasSamplesHash && hasSamplesFile) {
    throw new Error(
      'Only one of --samples-file or --samples-hash can be supplied'
    );
  }
  if (!hasMarkersHash && !hasMarkersFile) {
    throw new Error('Either --markers-file or --markers-hash must be supplied');
  }
  if (hasMarkersHash && hasMarkersFile) {
    throw new Error(
      'Only one of --markers-file or --markers-hash can be supplied'
    );
  }

  const samplesProf: ProfileSource = hasSamplesHash
    ? { type: 'HASH', hash: argv['samples-hash'] }
    : { type: 'FILE', file: argv['samples-file'] };
  const markersProf: ProfileSource = hasMarkersHash
    ? { type: 'HASH', hash: argv['markers-hash'] }
    : { type: 'FILE', file: argv['markers-file'] };

  return {
    samplesProf,
    markersProf,
    filterByProcessPrefix: argv['filter-by-process-prefix'],
    assumeSamplesProfileHasStartTimeZero: 'assume-samply' in argv,
    outputFile: argv['output-file'],
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
