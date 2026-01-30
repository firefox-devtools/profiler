/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/*
 * This file contains all functions that are needed to achieve profiles
 * comparison: how to merge profiles, how to diff them, etc.
 */

import { adjustMarkerTimestamps } from './process-profile';
import {
  getEmptyProfile,
  getEmptyResourceTable,
  getEmptyNativeSymbolTable,
  getEmptyFrameTable,
  getEmptyFuncTable,
  getEmptyRawStackTable,
  getEmptyRawMarkerTable,
  getEmptySamplesTableWithEventDelay,
  shallowCloneRawMarkerTable,
  getEmptySourceTable,
} from './data-structures';
import {
  filterRawThreadSamplesToRange,
  getTimeRangeForThread,
  getTimeRangeIncludingAllThreads,
  computeTimeColumnForRawSamplesTable,
  updateRawThreadStacks,
} from './profile-data';
import {
  filterRawMarkerTableToRange,
  deriveMarkersFromRawMarkerTable,
  correlateIPCMarkers,
} from './marker-data';
import { computeStringIndexMarkerFieldsByDataType } from './marker-schema';
import { ensureExists, getFirstItemFromSet } from '../utils/types';
import { StringTable } from '../utils/string-table';

import type {
  Profile,
  RawThread,
  IndexIntoCategoryList,
  CategoryList,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
  IndexIntoResourceTable,
  IndexIntoLibs,
  IndexIntoNativeSymbolTable,
  IndexIntoStackTable,
  IndexIntoStringTable,
  IndexIntoSourceTable,
  FuncTable,
  FrameTable,
  Lib,
  NativeSymbolTable,
  ResourceTable,
  RawSamplesTable,
  RawStackTable,
  SourceTable,
  UrlState,
  ImplementationFilter,
  TransformStacksPerThread,
  DerivedMarkerInfo,
  RawMarkerTable,
  MarkerPayload,
  Milliseconds,
  Tid,
  RawProfileSharedData,
  ProfileIndexTranslationMaps,
} from 'firefox-profiler/types';
import { translateTransformStack } from './transforms';

/**
 * This function is the entry point for this file. From a list of profile
 * sources and a list of states coming from URLs, it computes a new profile
 * that's composed of parts of the 2 source profiles.
 * It also computes a diffed profile as a last thread.
 * It returns this merged profile along the transforms and implementation
 * filters as decided by the source states.
 */
export function mergeProfilesForDiffing(
  profiles: Profile[],
  profileStates: UrlState[]
): {
  profile: Profile;
  transformStacks: TransformStacksPerThread;
  implementationFilters: ImplementationFilter[];
} {
  if (profiles.length !== profileStates.length) {
    throw new Error(
      'Passed arrays do not have the same length. This should not happen.'
    );
  }
  if (!profiles.length) {
    throw new Error('There are no profiles to merge.');
  }

  const resultProfile = getEmptyProfile();

  // Copy over identical values for the ProfileMeta.
  for (const [key, value] of Object.entries(profiles[0].meta)) {
    // Do not copy over some properties though.
    // profilingStartTime and profilingEndTime, if present, are used to define
    // the root range directly. But because we adjust timestamps below in each
    // threads, these values won't be correct anymore.
    if (['profilingStartTime', 'profilingEndTime'].includes(key)) {
      continue;
    }
    if (profiles.every((profile) => (profile.meta as any)[key] === value)) {
      (resultProfile.meta as any)[key] = value;
    }
  }
  // Ensure it has a copy of the marker schema and categories, even though these could
  // be different between the two profiles.
  resultProfile.meta.markerSchema = profiles[0].meta.markerSchema;
  resultProfile.meta.categories = profiles[0].meta.categories;

  resultProfile.meta.interval = Math.min(
    ...profiles.map((profile) => profile.meta.interval)
  );

  // Precompute marker fields that need adjusting.
  const stringIndexMarkerFieldsByDataType =
    computeStringIndexMarkerFieldsByDataType(resultProfile.meta.markerSchema);

  // If all profiles have an unknown symbolication status, we keep this unknown
  // status for the combined profile. Otherwise, we mark the combined profile
  // symbolicated only if all profiles are, so that a symbolication process will
  // be kicked off if necessary.
  if (profiles.every((profile) => profile.meta.symbolicated === undefined)) {
    delete resultProfile.meta.symbolicated;
  } else {
    resultProfile.meta.symbolicated = profiles.every(
      (profile) => profile.meta.symbolicated
    );
  }

  // First, let's merge profile.meta.categories, profile.libs, and profile.shared.
  const {
    categories: newCategories,
    libs: newLibs,
    shared: newShared,
    translationMapsPerProfile,
  } = mergeSharedData(profiles);
  resultProfile.meta.categories = newCategories;
  resultProfile.libs = newLibs;
  resultProfile.shared = newShared;

  // Then we loop over all profiles and do the necessary changes according
  // to the states we computed earlier.
  const transformStacks: TransformStacksPerThread = {};
  const implementationFilters: ImplementationFilter[] = [];
  // These may be needed for filtering markers.
  let ipcCorrelations;

  for (let i = 0; i < profileStates.length; i++) {
    const { profileName, profileSpecific } = profileStates[i];
    const translationMaps = translationMapsPerProfile[i];
    const { oldStackToNewStackPlusOne, oldStringToNewStringPlusOne } =
      translationMaps;

    const selectedThreadIndexes = profileSpecific.selectedThreads;
    if (selectedThreadIndexes === null) {
      throw new Error(`No thread has been selected in profile ${i}`);
    }
    const selectedThreadIndex = getFirstItemFromSet(selectedThreadIndexes);
    if (selectedThreadIndexes.size !== 1 || selectedThreadIndex === undefined) {
      throw new Error(
        'Only one thread selection is currently supported for the comparison view.'
      );
    }
    const profile = profiles[i];
    let thread = { ...profile.threads[selectedThreadIndex] };

    transformStacks[i] = translateTransformStack(
      profileSpecific.transforms[selectedThreadIndex] ?? [],
      translationMaps
    );
    implementationFilters.push(profileSpecific.implementation);

    thread.markers = {
      ...thread.markers,
      name: adjustStringIndexes(
        thread.markers.name,
        oldStringToNewStringPlusOne
      ),
      data: adjustMarkerDataStringIndexes(
        thread.markers.data,
        oldStringToNewStringPlusOne,
        stringIndexMarkerFieldsByDataType
      ),
    };

    [thread] = updateRawThreadStacks([thread], (stackIndex) =>
      _mapNullableStack(stackIndex, oldStackToNewStackPlusOne)
    );

    // Make sure that screenshot markers make it into the merged profile, even
    // if they're not on the selected thread.
    thread.markers = getThreadMarkersAndScreenshotMarkers(
      profile.threads,
      thread
    );

    // We filter the profile using the range from the state for this profile.
    const zeroAt = getTimeRangeIncludingAllThreads(profile).start;
    const committedRange =
      profileSpecific.committedRanges && profileSpecific.committedRanges.pop();

    if (committedRange) {
      // Filtering markers in a thread happens with the derived markers, so they
      // will need to be computed.
      if (!ipcCorrelations) {
        ipcCorrelations = correlateIPCMarkers(profile.threads, profile.shared);
      }
      const derivedMarkerInfo = deriveMarkersFromRawMarkerTable(
        thread.markers,
        profile.shared.stringArray,
        thread.tid || 0,
        committedRange,
        ipcCorrelations
      );
      thread = _filterRawThreadToRange(
        thread,
        derivedMarkerInfo,
        committedRange.start + zeroAt,
        committedRange.end + zeroAt
      );
    }

    // We're reseting the thread's PID and TID to make sure we don't have any collision.
    thread.pid = `${thread.pid} from profile ${i + 1}`;
    thread.tid = `${thread.tid} from profile ${i + 1}`;
    thread.isMainThread = true;
    thread.processName = `${profileName || `Profile ${i + 1}`}: ${
      thread.processName || thread.name
    }`;

    // We adjust the various times so that the 2 profiles are aligned at the
    // start and the data is consistent.
    let startTimeAdjustment = 0;
    if (thread.samples.length) {
      const { time, timeDeltas } = thread.samples;
      if (time !== undefined) {
        startTimeAdjustment = -time[0];
      } else {
        startTimeAdjustment = -ensureExists(timeDeltas)[0];
      }
    } else if (thread.markers.length) {
      for (const startTime of thread.markers.startTime) {
        // Find the first marker startTime.
        if (startTime !== null) {
          startTimeAdjustment = -startTime;
          break;
        }
      }
    }

    thread.samples = _adjustSampleTimestamps(
      thread.samples,
      startTimeAdjustment
    );
    thread.markers = adjustMarkerTimestamps(
      thread.markers,
      startTimeAdjustment
    );
    thread.registerTime += startTimeAdjustment;
    thread.processStartupTime += startTimeAdjustment;
    if (thread.processShutdownTime !== null) {
      thread.processShutdownTime += startTimeAdjustment;
    }
    if (thread.unregisterTime !== null) {
      thread.unregisterTime += startTimeAdjustment;
    }

    // The loaded profiles will often have different lengths. We align the
    // start times in the block above, so this means the end times will be
    // different.
    // By setting `unregisterTime` here, the empty thread indicators will be
    // drawn, which will help the users visualizing the different lengths of
    // the loaded profiles.
    if (thread.processShutdownTime === null && thread.unregisterTime === null) {
      thread.unregisterTime = getTimeRangeForThread(
        thread,
        profile.meta.interval
      ).end;
    }

    resultProfile.threads.push(thread);
  }

  // We can import several profiles in this view, but the comparison thread
  // really makes sense when there's only 2 profiles.
  if (profiles.length === 2) {
    resultProfile.threads.push(
      getComparisonThread([
        {
          thread: resultProfile.threads[0],
          weightMultiplier:
            profiles[0].meta.interval / resultProfile.meta.interval,
        },
        {
          thread: resultProfile.threads[1],
          weightMultiplier:
            profiles[1].meta.interval / resultProfile.meta.interval,
        },
      ])
    );
  }

  // In merged profiles, we don't want to hide any threads: either they've been
  // explicitely selected by the user, or it's the diffing track.
  resultProfile.meta.initialVisibleThreads = resultProfile.threads.map(
    (_, i) => i
  );

  return { profile: resultProfile, implementationFilters, transformStacks };
}

/**
 * This is a small utility function that makes it easier to filter a thread
 * completely (both raw markers and samples). This is not part of the normal
 * filtering pipeline, but is used with comparison profiles.
 */
function _filterRawThreadToRange(
  thread: RawThread,
  derivedMarkerInfo: DerivedMarkerInfo,
  rangeStart: number,
  rangeEnd: number
): RawThread {
  thread = filterRawThreadSamplesToRange(thread, rangeStart, rangeEnd);
  thread.markers = filterRawMarkerTableToRange(
    thread.markers,
    derivedMarkerInfo,
    rangeStart,
    rangeEnd
  );
  return thread;
}

function _adjustSampleTimestamps(
  rawSamplesTable: RawSamplesTable,
  delta: Milliseconds
): RawSamplesTable {
  const { time, timeDeltas } = rawSamplesTable;
  if (time !== undefined) {
    return {
      ...rawSamplesTable,
      time: time.map((t) => t + delta),
    };
  }
  const newTimeDeltas = ensureExists(timeDeltas).slice();
  newTimeDeltas[0] += delta;
  return {
    ...rawSamplesTable,
    timeDeltas: newTimeDeltas,
  };
}
type TranslationMapForCategories = Int32Array;
type TranslationMapForFuncs = Int32Array;
type TranslationMapForResources = Int32Array;
type TranslationMapForNativeSymbols = Int32Array;
type TranslationMapForFrames = Int32Array;
type TranslationMapForStacks = Int32Array;
type TranslationMapForLibs = Int32Array;
type TranslationMapForStrings = Int32Array;
type TranslationMapForSources = Int32Array;

/**
 * Merges several categories lists into one, resolving duplicates if necessary.
 * It returns a translation map that can be used in `adjustCategories` later.
 */
function mergeCategories(categoriesPerProfile: Array<CategoryList | void>): {
  categories: CategoryList;
  translationMaps: TranslationMapForCategories[];
} {
  const newCategories: CategoryList = [];
  const newCategoryIndexByName = new Map<string, IndexIntoCategoryList>();

  const translationMaps = categoriesPerProfile.map((categories) => {
    if (!categories) {
      // Profiles that are imported may not have categories. Ignore it when attempting
      // to merge categories.
      return new Int32Array(0);
    }

    const oldCategoryToNewCategoryPlusOne = new Int32Array(categories.length);

    categories.forEach((category, i) => {
      const { name } = category;
      let newCategoryIndex = newCategoryIndexByName.get(name);
      if (newCategoryIndex === undefined) {
        newCategoryIndex = newCategories.length;
        newCategories.push(category);
        newCategoryIndexByName.set(name, newCategoryIndex);
      } else {
        // We're assuming that newCategories[newCategoryIndex].subcategories
        // is the same list of strings as category.subcategories.
        // TODO issue #2151: merge the subcategories too, and make a
        // translationMap for those (per category), too.
      }
      oldCategoryToNewCategoryPlusOne[i] = newCategoryIndex + 1;
    });

    return oldCategoryToNewCategoryPlusOne;
  });

  return { categories: newCategories, translationMaps };
}

export function mergeSharedData(profiles: Profile[]): {
  categories: CategoryList;
  libs: Lib[];
  shared: RawProfileSharedData;
  translationMapsPerProfile: ProfileIndexTranslationMaps[];
} {
  const {
    categories: newCategories,
    translationMaps: translationMapsForCategories,
  } = mergeCategories(profiles.map((profile) => profile.meta.categories));

  const {
    stringArray: newStringArray,
    translationMaps: translationMapsForStrings,
  } = mergeStringArrays(profiles.map((profile) => profile.shared.stringArray));

  const { libs: newLibs, translationMaps: translationMapsForLibs } = mergeLibs(
    profiles.map((profile) => profile.libs)
  );

  const { sources: newSources, translationMaps: translationMapsForSources } =
    mergeSources(
      profiles.map((profile) => profile.shared.sources ?? null),
      translationMapsForStrings
    );
  const {
    resourceTable: newResourceTable,
    translationMaps: translationMapsForResources,
  } = mergeResourceTables(
    profiles,
    translationMapsForStrings,
    translationMapsForLibs
  );
  const {
    nativeSymbols: newNativeSymbols,
    translationMaps: translationMapsForNativeSymbols,
  } = mergeNativeSymbolTables(
    profiles,
    translationMapsForStrings,
    translationMapsForLibs
  );
  const { funcTable: newFuncTable, translationMaps: translationMapsForFuncs } =
    mergeFuncTables(
      profiles,
      translationMapsForResources,
      translationMapsForSources,
      translationMapsForStrings
    );
  const {
    frameTable: newFrameTable,
    translationMaps: translationMapsForFrames,
  } = mergeFrameTables(
    profiles,
    translationMapsForFuncs,
    translationMapsForNativeSymbols,
    translationMapsForCategories
  );
  const {
    stackTable: newStackTable,
    translationMaps: translationMapsForStacks,
  } = mergeStackTables(profiles, translationMapsForFrames);

  const newShared: RawProfileSharedData = {
    stackTable: newStackTable,
    frameTable: newFrameTable,
    funcTable: newFuncTable,
    nativeSymbols: newNativeSymbols,
    resourceTable: newResourceTable,
    stringArray: newStringArray,
    sources: newSources,
  };

  const translationMapsPerProfile = profiles.map((profile, i) => {
    const oldLibToNewLibPlusOne = translationMapsForLibs[i];
    const oldStringToNewStringPlusOne = translationMapsForStrings[i];
    const oldSourceToNewSourcePlusOne = translationMapsForSources[i];
    const oldResourceToNewResourcePlusOne = translationMapsForResources[i];
    const oldNativeSymbolToNewNativeSymbolPlusOne =
      translationMapsForNativeSymbols[i];
    const oldFuncToNewFuncPlusOne = translationMapsForFuncs[i];
    const oldFrameToNewFramePlusOne = translationMapsForFrames[i];
    const oldStackToNewStackPlusOne = translationMapsForStacks[i];
    const translationMaps: ProfileIndexTranslationMaps = {
      oldThreadIndexToNew: null,
      oldFuncCount: profile.shared.funcTable.length,
      newFuncCount: newFuncTable.length,
      oldLibToNewLibPlusOne,
      oldStringToNewStringPlusOne,
      oldSourceToNewSourcePlusOne,
      oldResourceToNewResourcePlusOne,
      oldNativeSymbolToNewNativeSymbolPlusOne,
      oldFuncToNewFuncPlusOne,
      oldFrameToNewFramePlusOne,
      oldStackToNewStackPlusOne,
    };
    return translationMaps;
  });

  return {
    categories: newCategories,
    libs: newLibs,
    shared: newShared,
    translationMapsPerProfile,
  };
}

function mergeStringArrays(stringArraysPerProfile: Array<string[]>): {
  stringArray: string[];
  translationMaps: TranslationMapForStrings[];
} {
  const newStringArray: string[] = [];
  const newStringTable = StringTable.withBackingArray(newStringArray);

  const translationMaps = stringArraysPerProfile.map((stringArray) => {
    const oldStringToNewStringPlusOne = new Int32Array(stringArray.length);
    for (let i = 0; i < stringArray.length; i++) {
      oldStringToNewStringPlusOne[i] =
        newStringTable.indexForString(stringArray[i]) + 1;
    }
    return oldStringToNewStringPlusOne;
  });

  return { stringArray: newStringArray, translationMaps };
}

function mergeSources(
  sourcesPerProfile: Array<SourceTable | null>,
  translationMapsForStrings: TranslationMapForStrings[]
): {
  sources: SourceTable;
  translationMaps: TranslationMapForSources[];
} {
  const newSources = getEmptySourceTable();
  const mapOfInsertedSources = new Map<string, IndexIntoSourceTable>();

  const translationMaps = sourcesPerProfile.map((sources, profileIndex) => {
    if (!sources) {
      return new Int32Array(0);
    }

    const oldSourceToNewSourcePlusOne = new Int32Array(sources.length);
    const oldStringToNewStringPlusOne = translationMapsForStrings[profileIndex];

    for (let i = 0; i < sources.length; i++) {
      const uuid = sources.uuid[i];
      const originalUrlIndex = sources.filename[i];
      const newUrlIndex = oldStringToNewStringPlusOne[originalUrlIndex] - 1;

      const sourceKey = uuid ?? `null-uuid-${newUrlIndex}`;
      let insertedSourceIndex = mapOfInsertedSources.get(sourceKey);
      if (insertedSourceIndex === undefined) {
        // Add new source
        insertedSourceIndex = newSources.length;
        newSources.uuid[insertedSourceIndex] = uuid;
        newSources.filename[insertedSourceIndex] = newUrlIndex;
        newSources.length++;
        mapOfInsertedSources.set(sourceKey, insertedSourceIndex);
      }

      oldSourceToNewSourcePlusOne[i] = insertedSourceIndex + 1;
    }

    return oldSourceToNewSourcePlusOne;
  });

  return {
    sources: newSources,
    translationMaps,
  };
}

function adjustStringIndexes(
  stringIndexes: ReadonlyArray<IndexIntoStringTable>,
  oldStringToNewStringPlusOne: TranslationMapForStrings
): Array<IndexIntoStringTable> {
  return stringIndexes.map(
    (stringIndex) => oldStringToNewStringPlusOne[stringIndex] - 1
  );
}

function adjustMarkerDataStringIndexes(
  dataCol: ReadonlyArray<MarkerPayload | null>,
  oldStringToNewStringPlusOne: TranslationMapForStrings,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): Array<MarkerPayload | null> {
  return dataCol.map((data) => {
    if (!data || !data.type) {
      return data;
    }

    const stringIndexMarkerFields = stringIndexMarkerFieldsByDataType.get(
      data.type
    );
    if (stringIndexMarkerFields === undefined) {
      return data;
    }

    let newData: MarkerPayload = data;
    for (const fieldKey of stringIndexMarkerFields) {
      const stringIndex = (data as any)[fieldKey];
      if (typeof stringIndex === 'number') {
        newData = {
          ...newData,
          [fieldKey]: oldStringToNewStringPlusOne[stringIndex] - 1,
        } as any;
      }
    }
    return newData;
  });
}

/**
 * This combines the library lists from multiple profiles. It returns a merged
 * Lib array, along with a translation maps that can be used in other functions
 * when merging lib references in other tables.
 */
function mergeLibs(libsPerProfile: Lib[][]): {
  libs: Lib[];
  translationMaps: TranslationMapForLibs[];
} {
  const mapOfInsertedLibs = new Map<string, IndexIntoLibs>();

  const translationMaps: Array<TranslationMapForLibs> = [];
  const newLibTable: Lib[] = [];

  for (const libs of libsPerProfile) {
    const oldLibToNewLibPlusOne = new Int32Array(libs.length);

    libs.forEach((lib, i) => {
      const insertedLibKey = [lib.name, lib.debugName].join('#');
      const insertedLibIndex = mapOfInsertedLibs.get(insertedLibKey);
      if (insertedLibIndex !== undefined) {
        oldLibToNewLibPlusOne[i] = insertedLibIndex + 1;
        return;
      }

      oldLibToNewLibPlusOne[i] = newLibTable.length + 1;
      mapOfInsertedLibs.set(insertedLibKey, newLibTable.length);

      newLibTable.push(lib);
    });

    translationMaps.push(oldLibToNewLibPlusOne);
  }

  return { libs: newLibTable, translationMaps };
}

function _mapLib(
  libIndex: IndexIntoLibs,
  oldLibToNewLibPlusOne: TranslationMapForLibs
): IndexIntoLibs {
  return oldLibToNewLibPlusOne[libIndex] - 1;
}

function _mapNullableLib(
  libIndex: IndexIntoLibs | null,
  oldLibToNewLibPlusOne: TranslationMapForLibs
): IndexIntoLibs | null {
  return libIndex !== null ? oldLibToNewLibPlusOne[libIndex] - 1 : null;
}

function _mapString(
  stringIndex: IndexIntoStringTable,
  oldStringToNewStringPlusOne: TranslationMapForStrings
): IndexIntoStringTable {
  return oldStringToNewStringPlusOne[stringIndex] - 1;
}

function _mapNullableString(
  stringIndex: IndexIntoStringTable | null,
  oldStringToNewStringPlusOne: TranslationMapForStrings
): IndexIntoStringTable | null {
  return stringIndex !== null
    ? oldStringToNewStringPlusOne[stringIndex] - 1
    : null;
}

function _mapNullableSource(
  sourceIndex: IndexIntoSourceTable | null,
  oldSourceToNewSourcePlusOne: TranslationMapForSources
): IndexIntoStringTable | null {
  return sourceIndex !== null
    ? oldSourceToNewSourcePlusOne[sourceIndex] - 1
    : null;
}

function _mapFuncResource(
  resourceIndex: IndexIntoResourceTable | -1,
  oldResourceToNewResourcePlusOne: TranslationMapForResources
): IndexIntoResourceTable | -1 {
  if (resourceIndex === -1) {
    return -1;
  }
  return oldResourceToNewResourcePlusOne[resourceIndex] - 1;
}

function _mapFunc(
  funcIndex: IndexIntoFuncTable,
  oldFuncToNewFuncPlusOne: TranslationMapForFuncs
): IndexIntoFuncTable {
  return oldFuncToNewFuncPlusOne[funcIndex] - 1;
}

function _mapFrame(
  frameIndex: IndexIntoFrameTable,
  oldFrameToNewFramePlusOne: TranslationMapForFrames
): IndexIntoFrameTable {
  return oldFrameToNewFramePlusOne[frameIndex] - 1;
}

function _mapNullableNativeSymbol(
  nativeSymbolIndex: IndexIntoLibs | null,
  oldNativeSymbolToNewNativeSymbolPlusOne: TranslationMapForNativeSymbols
): IndexIntoLibs | null {
  if (nativeSymbolIndex === null) {
    return null;
  }
  return oldNativeSymbolToNewNativeSymbolPlusOne[nativeSymbolIndex] - 1;
}

function _mapNullableCategory(
  categoryIndex: IndexIntoCategoryList | null,
  oldCategoryToNewCategoryPlusOne: TranslationMapForCategories
): IndexIntoCategoryList | null {
  if (categoryIndex === null) {
    return null;
  }
  return oldCategoryToNewCategoryPlusOne[categoryIndex] - 1;
}

function _mapNullableStack(
  stackIndex: IndexIntoStackTable | null,
  oldStackToNewStackPlusOne: TranslationMapForStacks
): IndexIntoStackTable | null {
  return stackIndex !== null ? oldStackToNewStackPlusOne[stackIndex] - 1 : null;
}

/**
 * This combines the resource tables for a list of profiles. It returns the new
 * resource table with the translation maps to be used in subsequent merging
 * functions.
 */
function mergeResourceTables(
  profiles: ReadonlyArray<Profile>,
  translationMapsForStrings: TranslationMapForStrings[],
  translationMapsForLibs: TranslationMapForLibs[]
): {
  resourceTable: ResourceTable;
  translationMaps: TranslationMapForResources[];
} {
  const mapOfInsertedResources = new Map<string, IndexIntoResourceTable>();
  const translationMaps: TranslationMapForResources[] = [];
  const newResourceTable = getEmptyResourceTable();

  profiles.forEach((profile, profileIndex) => {
    const oldLibToNewLibPlusOne = translationMapsForLibs[profileIndex];
    const oldStringToNewStringPlusOne = translationMapsForStrings[profileIndex];
    const { resourceTable } = profile.shared;
    const oldResourceToNewResourcePlusOne = new Int32Array(
      resourceTable.length
    );

    for (let i = 0; i < resourceTable.length; i++) {
      const libIndex = _mapNullableLib(
        resourceTable.lib[i],
        oldLibToNewLibPlusOne
      );
      const nameIndex = _mapString(
        resourceTable.name[i],
        oldStringToNewStringPlusOne
      );
      const hostIndex = _mapNullableString(
        resourceTable.host[i],
        oldStringToNewStringPlusOne
      );
      const type = resourceTable.type[i];

      // Duplicate search.
      const resourceKey = [nameIndex, type].join('#');
      const insertedResourceIndex = mapOfInsertedResources.get(resourceKey);
      if (insertedResourceIndex !== undefined) {
        oldResourceToNewResourcePlusOne[i] = insertedResourceIndex + 1;
        continue;
      }

      oldResourceToNewResourcePlusOne[i] = newResourceTable.length + 1;
      mapOfInsertedResources.set(resourceKey, newResourceTable.length);

      newResourceTable.lib.push(libIndex);
      newResourceTable.name.push(nameIndex);
      newResourceTable.host.push(hostIndex);
      newResourceTable.type.push(type);
      newResourceTable.length++;
    }

    translationMaps.push(oldResourceToNewResourcePlusOne);
  });

  return { resourceTable: newResourceTable, translationMaps };
}

/**
 * This combines the nativeSymbols tables for the profiles.
 */
function mergeNativeSymbolTables(
  profiles: ReadonlyArray<Profile>,
  translationMapsForStrings: TranslationMapForStrings[],
  translationMapsForLibs: TranslationMapForLibs[]
): {
  nativeSymbols: NativeSymbolTable;
  translationMaps: TranslationMapForNativeSymbols[];
} {
  const mapOfInsertedNativeSymbols: Map<string, IndexIntoNativeSymbolTable> =
    new Map();
  const translationMaps: TranslationMapForNativeSymbols[] = [];
  const newNativeSymbols = getEmptyNativeSymbolTable();

  profiles.forEach((profile, profileIndex) => {
    const oldLibToNewLibPlusOne = translationMapsForLibs[profileIndex];
    const oldStringToNewStringPlusOne = translationMapsForStrings[profileIndex];
    const { nativeSymbols } = profile.shared;
    const oldNativeSymbolToNewNativeSymbolPlusOne = new Int32Array(
      nativeSymbols.length
    );

    for (let i = 0; i < nativeSymbols.length; i++) {
      const libIndex = _mapLib(
        nativeSymbols.libIndex[i],
        oldLibToNewLibPlusOne
      );
      const nameIndex = _mapString(
        nativeSymbols.name[i],
        oldStringToNewStringPlusOne
      );
      const address = nativeSymbols.address[i];
      const functionSize = nativeSymbols.functionSize[i];

      // Duplicate search.
      const nativeSymbolKey = [nameIndex, address].join('#');
      const insertedNativeSymbolIndex =
        mapOfInsertedNativeSymbols.get(nativeSymbolKey);
      if (insertedNativeSymbolIndex !== undefined) {
        oldNativeSymbolToNewNativeSymbolPlusOne[i] =
          insertedNativeSymbolIndex + 1;
        continue;
      }

      oldNativeSymbolToNewNativeSymbolPlusOne[i] = newNativeSymbols.length + 1;
      mapOfInsertedNativeSymbols.set(nativeSymbolKey, newNativeSymbols.length);

      newNativeSymbols.libIndex.push(libIndex);
      newNativeSymbols.name.push(nameIndex);
      newNativeSymbols.address.push(address);
      newNativeSymbols.functionSize.push(functionSize);

      newNativeSymbols.length++;
    }

    translationMaps.push(oldNativeSymbolToNewNativeSymbolPlusOne);
  });

  return { nativeSymbols: newNativeSymbols, translationMaps };
}

/**
 * This combines the function tables for a list of profiles. It returns the new
 * function table with the translation maps to be used in subsequent merging
 * functions.
 */
function mergeFuncTables(
  profiles: ReadonlyArray<Profile>,
  translationMapsForResources: TranslationMapForResources[],
  translationMapsForSources: TranslationMapForSources[],
  translationMapsForStrings: TranslationMapForStrings[]
): { funcTable: FuncTable; translationMaps: TranslationMapForFuncs[] } {
  const mapOfInsertedFuncs = new Map<string, IndexIntoFuncTable>();
  const translationMaps: TranslationMapForFuncs[] = [];
  const newFuncTable = getEmptyFuncTable();

  profiles.forEach((profile, profileIndex) => {
    const { funcTable } = profile.shared;
    const oldResourceToNewResourcePlusOne =
      translationMapsForResources[profileIndex];
    const oldStringToNewStringPlusOne = translationMapsForStrings[profileIndex];
    const oldSourceToNewSourcePlusOne = translationMapsForSources[profileIndex];
    const oldFuncToNewFuncPlusOne = new Int32Array(funcTable.length);

    for (let i = 0; i < funcTable.length; i++) {
      const sourceIndex = _mapNullableSource(
        funcTable.source[i],
        oldSourceToNewSourcePlusOne
      );
      const resourceIndex = _mapFuncResource(
        funcTable.resource[i],
        oldResourceToNewResourcePlusOne
      );
      const nameIndex = _mapString(
        funcTable.name[i],
        oldStringToNewStringPlusOne
      );
      const lineNumber = funcTable.lineNumber[i];

      // Entries in this table can be either:
      // 1. native: in that case they'll have a resource index and a name. The
      //    name should be unique in a specific resource.
      // 2. JS: they'll have a resource index and a name too, but the name is
      //    not garanteed to be unique in a resource. That's why we use the line
      //    number as well.
      // 3. Label frames: they have no resource, only a name. So we can't do
      //    better than this.
      const funcKey = [nameIndex, resourceIndex, lineNumber].join('#');
      const insertedFuncIndex = mapOfInsertedFuncs.get(funcKey);
      if (insertedFuncIndex !== undefined) {
        oldFuncToNewFuncPlusOne[i] = insertedFuncIndex + 1;
        continue;
      }
      mapOfInsertedFuncs.set(funcKey, newFuncTable.length);
      oldFuncToNewFuncPlusOne[i] = newFuncTable.length + 1;

      newFuncTable.isJS.push(funcTable.isJS[i]);
      newFuncTable.name.push(nameIndex);
      newFuncTable.resource.push(resourceIndex);
      newFuncTable.relevantForJS.push(funcTable.relevantForJS[i]);
      newFuncTable.source.push(sourceIndex);
      newFuncTable.lineNumber.push(lineNumber);
      newFuncTable.columnNumber.push(funcTable.columnNumber[i]);

      newFuncTable.length++;
    }

    translationMaps.push(oldFuncToNewFuncPlusOne);
  });

  return { funcTable: newFuncTable, translationMaps };
}

/**
 * This combines the frame tables for a list of profiles. It returns the new
 * frame table with the translation maps to be used in subsequent merging
 * functions.
 * Note that we don't try to merge the frames of the source profiles, because
 * that's not needed to get a diffing call tree.
 */
function mergeFrameTables(
  profiles: ReadonlyArray<Profile>,
  translationMapsForFuncs: TranslationMapForFuncs[],
  translationMapsForNativeSymbols: TranslationMapForNativeSymbols[],
  translationMapsForCategories: TranslationMapForCategories[]
): { frameTable: FrameTable; translationMaps: TranslationMapForFrames[] } {
  const translationMaps: TranslationMapForFrames[] = [];
  const newFrameTable = getEmptyFrameTable();

  profiles.forEach((profile, profileIndex) => {
    const { frameTable } = profile.shared;
    const oldFuncToNewFuncPlusOne = translationMapsForFuncs[profileIndex];
    const oldNativeSymbolToNewNativeSymbolPlusOne =
      translationMapsForNativeSymbols[profileIndex];
    const oldCategoryToNewCategoryPlusOne =
      translationMapsForCategories[profileIndex];
    const oldFrameToNewFramePlusOne = new Int32Array(frameTable.length);

    for (let i = 0; i < frameTable.length; i++) {
      const func = _mapFunc(frameTable.func[i], oldFuncToNewFuncPlusOne);
      const nativeSymbol = _mapNullableNativeSymbol(
        frameTable.nativeSymbol[i],
        oldNativeSymbolToNewNativeSymbolPlusOne
      );
      const category = _mapNullableCategory(
        frameTable.category[i],
        oldCategoryToNewCategoryPlusOne
      );
      // TODO issue #2151: Also adjust subcategories.
      const subcategory = frameTable.subcategory[i];

      newFrameTable.address.push(frameTable.address[i]);
      newFrameTable.inlineDepth.push(frameTable.inlineDepth[i]);
      newFrameTable.category.push(category);
      newFrameTable.subcategory.push(subcategory);
      newFrameTable.nativeSymbol.push(nativeSymbol);
      newFrameTable.func.push(func);
      newFrameTable.innerWindowID.push(frameTable.innerWindowID[i]);
      newFrameTable.line.push(frameTable.line[i]);
      newFrameTable.column.push(frameTable.column[i]);

      oldFrameToNewFramePlusOne[i] = newFrameTable.length + 1;
      newFrameTable.length++;
    }

    translationMaps.push(oldFrameToNewFramePlusOne);
  });

  return { frameTable: newFrameTable, translationMaps };
}

/**
 * This combines the stack tables for a list of profiles. It returns the new
 * stack table with the translation maps to be used in subsequent merging
 * functions.
 * Note that we don't try to merge the stacks of the source profiles, because
 * that's not needed to get a diffing call tree.
 */
function mergeStackTables(
  profiles: ReadonlyArray<Profile>,
  translationMapsForFrames: TranslationMapForFrames[]
): { stackTable: RawStackTable; translationMaps: TranslationMapForStacks[] } {
  const translationMaps: TranslationMapForStacks[] = [];
  const newStackTable = getEmptyRawStackTable();

  profiles.forEach((profile, profileIndex) => {
    const { stackTable } = profile.shared;
    const oldFrameToNewFramePlusOne = translationMapsForFrames[profileIndex];
    const oldStackToNewStackPlusOne = new Int32Array(stackTable.length);

    for (let i = 0; i < stackTable.length; i++) {
      const frameIndex = _mapFrame(
        stackTable.frame[i],
        oldFrameToNewFramePlusOne
      );
      const prefix = stackTable.prefix[i];
      const newPrefix =
        prefix === null ? null : oldStackToNewStackPlusOne[prefix] - 1;

      newStackTable.frame.push(frameIndex);
      newStackTable.prefix.push(newPrefix);

      oldStackToNewStackPlusOne[i] = newStackTable.length + 1;
      newStackTable.length++;
    }

    translationMaps.push(oldStackToNewStackPlusOne);
  });

  return { stackTable: newStackTable, translationMaps };
}

/**
 * This combines the sample tables for 2 threads. The samples for the first
 * thread are added in a negative way while the samples for the second thread
 * are added in a positive way, so that they will be diffed when computing the
 * call tree and the various other timings in the app.
 * It returns the new sample table with the translation maps to be used in
 * subsequent merging functions, if necessary.
 */
function combineSamplesDiffing(
  threadsAndWeightMultipliers: [
    ThreadAndWeightMultiplier,
    ThreadAndWeightMultiplier,
  ]
): RawSamplesTable {
  const [
    {
      thread: { samples: samples1, tid: tid1 },
      weightMultiplier: weightMultiplier1,
    },
    {
      thread: { samples: samples2, tid: tid2 },
      weightMultiplier: weightMultiplier2,
    },
  ] = threadsAndWeightMultipliers;

  const newWeight: number[] = [];
  const newThreadId: Tid[] = [];
  const newSamples = {
    ...getEmptySamplesTableWithEventDelay(),
    weight: newWeight,
    threadId: newThreadId,
  };

  const samples1Time = computeTimeColumnForRawSamplesTable(samples1);
  const samples2Time = computeTimeColumnForRawSamplesTable(samples2);

  let i = 0;
  let j = 0;
  while (i < samples1.length || j < samples2.length) {
    // We take the next sample from thread 1 if:
    // - We still have samples in thread 1 AND
    // - EITHER:
    //   + there's no samples left in thread 2
    //   + looking at the next samples for each thread, the earliest is from thread 1.
    // Otherwise we take the next samples from thread 2 until we run out of samples.
    const nextSampleIsFromThread1 =
      i < samples1.length &&
      (j >= samples2.length || samples1Time[i] < samples2Time[j]);

    if (nextSampleIsFromThread1) {
      // Next sample is from thread 1.
      newSamples.stack.push(samples1.stack[i]);
      // Diffing event delay values doesn't make sense since interleaved values
      // of eventDelay/responsiveness don't mean anything.
      newSamples.eventDelay!.push(null);
      newSamples.time!.push(samples1Time[i]);
      newThreadId.push(samples1.threadId ? samples1.threadId[i] : tid1);
      // TODO (issue #3151): Figure out a way to diff CPU usage numbers.
      // We add the first thread with a negative weight, because this is the
      // base profile.
      const sampleWeight = samples1.weight ? samples1.weight[i] : 1;
      newWeight.push(-weightMultiplier1 * sampleWeight);

      newSamples.length++;
      i++;
    } else {
      // Next sample is from thread 2.
      newSamples.stack.push(samples2.stack[j]);
      // Diffing event delay values doesn't make sense since interleaved values
      // of eventDelay/responsiveness don't mean anything.
      newSamples.eventDelay!.push(null);
      newSamples.time!.push(samples2Time[j]);
      newThreadId.push(samples2.threadId ? samples2.threadId[j] : tid2);
      const sampleWeight = samples2.weight ? samples2.weight[j] : 1;
      newWeight.push(weightMultiplier2 * sampleWeight);

      newSamples.length++;
      j++;
    }
  }

  return newSamples;
}

type ThreadAndWeightMultiplier = {
  thread: RawThread;
  weightMultiplier: number;
};

/**
 * This function will compute a diffing thread from 2 different threads, using
 * all the previous functions. The threads have already been adjusted in such a
 * way that they can live inside the same profile, for example their category
 * indexes have been adjusted to point into the shared profile's category list.
 */
function getComparisonThread(
  threadsAndWeightMultipliers: [
    ThreadAndWeightMultiplier,
    ThreadAndWeightMultiplier,
  ]
): RawThread {
  const threads = threadsAndWeightMultipliers.map((item) => item.thread);

  const newSamples = combineSamplesDiffing(threadsAndWeightMultipliers);

  const mergedThread = {
    processType: 'comparison',
    processStartupTime: Math.min(
      threads[0].processStartupTime,
      threads[1].processStartupTime
    ),
    processShutdownTime:
      Math.max(
        threads[0].processShutdownTime || 0,
        threads[1].processShutdownTime || 0
      ) || null,
    registerTime: Math.min(threads[0].registerTime, threads[1].registerTime),
    unregisterTime:
      Math.max(
        threads[0].unregisterTime || 0,
        threads[1].unregisterTime || 0
      ) || null,
    pausedRanges: [],
    name: 'Diff between 1 and 2',
    pid: 'Diff between 1 and 2',
    tid: 'Diff between 1 and 2',
    isMainThread: true,
    samples: newSamples,
    markers: getEmptyRawMarkerTable(),
  };

  return mergedThread;
}

/**
 * Merge threads inside a profile.
 * The threads should belong to the same profile because unlike mergeProfilesForDiffing,
 * this does not merge the profile level information like metadata, categories etc.
 * TODO: Overlapping threads will not look great due to #2783.
 */
export function mergeThreads(threads: RawThread[]): RawThread {
  const newSamples = combineSamplesForMerging(threads);
  const newMarkers = mergeMarkers(threads);

  let processStartupTime = Infinity;
  let processShutdownTime = -Infinity;
  let registerTime = Infinity;
  let unregisterTime = -Infinity;
  for (const thread of threads) {
    processStartupTime = Math.min(
      thread.processStartupTime,
      processStartupTime
    );
    processShutdownTime = Math.max(
      thread.processShutdownTime || Infinity,
      processShutdownTime
    );
    registerTime = Math.min(thread.registerTime, registerTime);
    unregisterTime = Math.max(
      thread.unregisterTime || Infinity,
      unregisterTime
    );
  }

  const mergedThread = {
    processType: 'merged',
    processStartupTime,
    processShutdownTime:
      processShutdownTime === Infinity ? null : processShutdownTime,
    registerTime,
    unregisterTime: unregisterTime === Infinity ? null : unregisterTime,
    pausedRanges: [],
    name: 'Merged thread',
    pid: 'Merged thread',
    tid: 'Merged thread',
    isMainThread: true,
    samples: newSamples,
    markers: newMarkers,
  };

  return mergedThread;
}

/**
 * This combines the sample tables for multiple threads.
 * This is similar to combineSamplesDiffing function, but differently, this
 * function adds all the samples as a positive value so they all add up in the end.
 * And it does not handle different interval values since threads should belong to
 * the same profile.
 * It returns the new sample table with the translation maps to be used in
 * subsequent merging functions, if necessary.
 */
function combineSamplesForMerging(threads: RawThread[]): RawSamplesTable {
  const samplesPerThread: RawSamplesTable[] = threads.map(
    (thread) => thread.samples
  );
  const sampleTimesPerThread: Milliseconds[][] = samplesPerThread.map(
    computeTimeColumnForRawSamplesTable
  );
  // This is the array that holds the latest processed sample index for each
  // thread's samplesTable.
  const nextSampleIndexPerThread: number[] = Array(
    samplesPerThread.length
  ).fill(0);
  // This array will contain the source thread ids. It will be added to the
  // samples table after the loop.
  const newThreadId: Tid[] = [];
  // Creating a new empty samples table to fill.
  const newSamples = {
    ...getEmptySamplesTableWithEventDelay(),
    threadId: newThreadId,
  };

  while (true) {
    let earliestNextSampleThreadIndex: number | null = null;
    let earliestNextSampleTime = Infinity;
    // 1. Find out which sample to consume.
    // Iterate over all the sample tables and pick the one with earliest sample.
    // TODO: We have this for loop inside the while loop which makes this
    // function's complexity O(n*m), where n is total sample count and m is the
    // thread count to merge. Possibly we can try to make this faster by reducing
    // the complexity.
    for (
      let threadIndex = 0;
      threadIndex < samplesPerThread.length;
      threadIndex++
    ) {
      const samples = samplesPerThread[threadIndex];
      const sampleIndex = nextSampleIndexPerThread[threadIndex];
      if (sampleIndex >= samples.length) {
        continue;
      }

      const currentSampleTime = sampleTimesPerThread[threadIndex][sampleIndex];
      if (currentSampleTime < earliestNextSampleTime) {
        earliestNextSampleThreadIndex = threadIndex;
        earliestNextSampleTime = currentSampleTime;
      }
    }

    if (earliestNextSampleThreadIndex === null) {
      // All samples from every thread have been consumed.
      break;
    }

    // 2. Add the earliest sample to the new sample table.
    const sourceThreadIndex = earliestNextSampleThreadIndex;
    const sourceThreadSamples = samplesPerThread[sourceThreadIndex];
    const sourceThreadSamplesTimeCol = sampleTimesPerThread[sourceThreadIndex];
    const sourceThreadSampleIndex: number =
      nextSampleIndexPerThread[sourceThreadIndex];

    newSamples.stack.push(sourceThreadSamples.stack[sourceThreadSampleIndex]);
    // It doesn't make sense to combine event delay values. We need to use jank markers
    // from independent threads instead.
    ensureExists(newSamples.eventDelay).push(null);
    newSamples.time!.push(sourceThreadSamplesTimeCol[sourceThreadSampleIndex]);
    newThreadId.push(
      sourceThreadSamples.threadId
        ? sourceThreadSamples.threadId[sourceThreadSampleIndex]
        : threads[sourceThreadIndex].tid
    );

    newSamples.length++;
    nextSampleIndexPerThread[sourceThreadIndex]++;
  }

  return newSamples;
}

/**
 * Merge markers from different threads. And update the new string table while doing it.
 */
function mergeMarkers(threads: RawThread[]): RawMarkerTable {
  const newThreadId: Array<Tid | null> = [];
  const newMarkerTable: RawMarkerTable = {
    ...getEmptyRawMarkerTable(),
    threadId: newThreadId,
  };

  threads.forEach((thread) => {
    const { markers } = thread;

    for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      newMarkerTable.name.push(markers.name[markerIndex]);
      newMarkerTable.data.push(markers.data[markerIndex]);
      newMarkerTable.startTime.push(markers.startTime[markerIndex]);
      newMarkerTable.endTime.push(markers.endTime[markerIndex]);
      newMarkerTable.phase.push(markers.phase[markerIndex]);
      newMarkerTable.category.push(markers.category[markerIndex]);
      newThreadId.push(
        markers.threadId ? markers.threadId[markerIndex] : thread.tid
      );
      newMarkerTable.length++;
    }
  });

  return newMarkerTable;
}

/**
 * Returns a RawMarkerTable which contains all the markers from targetThread,
 * as well as any CompositorScreenshot markers found on any other threads.
 *
 * `targetThread` is expected to be one of the threads in `threads`.
 */
function getThreadMarkersAndScreenshotMarkers(
  threads: RawThread[],
  targetThread: RawThread
): RawMarkerTable {
  const targetMarkerTable = shallowCloneRawMarkerTable(targetThread.markers);

  // Find screenshot markers in the other threads and add them to the target thread.
  for (const thread of threads) {
    if (thread === targetThread) {
      // Skip the target thread itself, otherwise any screenshot markers on the target
      // thread would be duplicated in the combined marker table.
      continue;
    }

    const { markers } = thread;

    for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      const data = markers.data[markerIndex];
      if (data === null || data.type !== 'CompositorScreenshot') {
        continue;
      }
      targetMarkerTable.data.push(data);
      targetMarkerTable.name.push(markers.name[markerIndex]);
      targetMarkerTable.startTime.push(markers.startTime[markerIndex]);
      targetMarkerTable.endTime.push(markers.endTime[markerIndex]);
      targetMarkerTable.phase.push(markers.phase[markerIndex]);
      targetMarkerTable.category.push(markers.category[markerIndex]);
      if (targetMarkerTable.threadId) {
        targetMarkerTable.threadId.push(
          markers.threadId ? markers.threadId[markerIndex] : thread.tid
        );
      }

      // Set the translation map and increase the table length.
      targetMarkerTable.length++;
    }
  }

  return targetMarkerTable;
}
