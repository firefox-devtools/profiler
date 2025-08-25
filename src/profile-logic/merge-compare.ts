/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/*
 * This file contains all functions that are needed to achieve profiles
 * comparison: how to merge profiles, how to diff them, etc.
 */

import { stripIndent } from 'common-tags';

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
} from './data-structures';
import {
  filterRawThreadSamplesToRange,
  getTimeRangeForThread,
  getTimeRangeIncludingAllThreads,
  computeTimeColumnForRawSamplesTable,
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
  IndexIntoSamplesTable,
  IndexIntoStringTable,
  FuncTable,
  FrameTable,
  Lib,
  NativeSymbolTable,
  ResourceTable,
  RawSamplesTable,
  RawStackTable,
  UrlState,
  ImplementationFilter,
  TransformStacksPerThread,
  DerivedMarkerInfo,
  RawMarkerTable,
  MarkerPayload,
  MarkerIndex,
  Milliseconds,
  Tid,
} from 'firefox-profiler/types';

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

  // First let's merge categories. We'll use the resulting maps when
  // handling the thread data later.
  const {
    categories: newCategories,
    translationMaps: translationMapsForCategories,
  } = mergeCategories(profiles.map((profile) => profile.meta.categories));
  resultProfile.meta.categories = newCategories;

  const {
    stringArray: newStringArray,
    translationMaps: translationMapForStrings,
  } = mergeStringArrays(profiles.map((profile) => profile.shared.stringArray));

  // Then merge libs.
  const { libs: newLibs, translationMaps: translationMapsForLibs } = mergeLibs(
    profiles.map((profile) => profile.libs)
  );
  resultProfile.libs = newLibs;

  resultProfile.shared = {
    stringArray: newStringArray,
  };

  // Then we loop over all profiles and do the necessary changes according
  // to the states we computed earlier.
  const transformStacks: any = {};
  const implementationFilters: ImplementationFilter[] = [];
  // These may be needed for filtering markers.
  let ipcCorrelations;

  for (let i = 0; i < profileStates.length; i++) {
    const { profileName, profileSpecific } = profileStates[i];
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

    transformStacks[i] = profileSpecific.transforms[selectedThreadIndex];
    implementationFilters.push(profileSpecific.implementation);

    // We adjust the categories using the maps computed above.
    // TODO issue #2151: Also adjust subcategories.
    thread.frameTable = {
      ...thread.frameTable,
      category: adjustNullableCategories(
        thread.frameTable.category,
        translationMapsForCategories[i]
      ),
    };
    thread.funcTable = {
      ...thread.funcTable,
      name: adjustStringIndexes(
        thread.funcTable.name,
        translationMapForStrings[i]
      ),
      fileName: adjustNullableStringIndexes(
        thread.funcTable.fileName,
        translationMapForStrings[i]
      ),
    };
    thread.resourceTable = {
      ...thread.resourceTable,
      name: adjustStringIndexes(
        thread.resourceTable.name,
        translationMapForStrings[i]
      ),
      host: adjustNullableStringIndexes(
        thread.resourceTable.host,
        translationMapForStrings[i]
      ),
      lib: adjustResourceTableLibs(
        thread.resourceTable.lib,
        translationMapsForLibs[i]
      ),
    };
    thread.nativeSymbols = {
      ...thread.nativeSymbols,
      name: adjustStringIndexes(
        thread.nativeSymbols.name,
        translationMapForStrings[i]
      ),
      libIndex: adjustNativeSymbolLibs(
        thread.nativeSymbols.libIndex,
        translationMapsForLibs[i]
      ),
    };
    thread.markers = {
      ...thread.markers,
      name: adjustStringIndexes(
        thread.markers.name,
        translationMapForStrings[i]
      ),
      data: adjustMarkerDataStringIndexes(
        thread.markers.data,
        translationMapForStrings[i],
        stringIndexMarkerFieldsByDataType
      ),
    };

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
type TranslationMapForCategories = Map<
  IndexIntoCategoryList,
  IndexIntoCategoryList
>;
type TranslationMapForFuncs = Map<IndexIntoFuncTable, IndexIntoFuncTable>;
type TranslationMapForResources = Map<
  IndexIntoResourceTable,
  IndexIntoResourceTable
>;
type TranslationMapForNativeSymbols = Map<
  IndexIntoNativeSymbolTable,
  IndexIntoNativeSymbolTable
>;
type TranslationMapForFrames = Map<IndexIntoFrameTable, IndexIntoFrameTable>;
type TranslationMapForStacks = Map<IndexIntoStackTable, IndexIntoStackTable>;
type TranslationMapForLibs = Map<IndexIntoLibs, IndexIntoLibs>;
type TranslationMapForStrings = Map<IndexIntoStringTable, IndexIntoStringTable>;
type TranslationMapForSamples = Map<
  IndexIntoSamplesTable,
  IndexIntoSamplesTable
>;

/**
 * Merges several categories lists into one, resolving duplicates if necessary.
 * It returns a translation map that can be used in `adjustCategories` later.
 */
function mergeCategories(categoriesPerProfile: Array<CategoryList | void>): {
  categories: CategoryList;
  translationMaps: TranslationMapForCategories[];
} {
  const newCategories: CategoryList = [];
  const newCategoryIndexByName: Map<string, IndexIntoCategoryList> = new Map();

  const translationMaps = categoriesPerProfile.map((categories) => {
    const translationMap = new Map();

    if (!categories) {
      // Profiles that are imported may not have categories. Ignore it when attempting
      // to merge categories.
      return translationMap;
    }

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
      translationMap.set(i, newCategoryIndex);
    });

    return translationMap;
  });

  return { categories: newCategories, translationMaps };
}

function mergeStringArrays(stringArraysPerProfile: Array<string[]>): {
  stringArray: string[];
  translationMaps: TranslationMapForStrings[];
} {
  const newStringArray: string[] = [];
  const newStringTable = StringTable.withBackingArray(newStringArray);

  const translationMaps = stringArraysPerProfile.map((stringArray) => {
    const translationMap = new Map();
    for (let i = 0; i < stringArray.length; i++) {
      translationMap.set(i, newStringTable.indexForString(stringArray[i]));
    }
    return translationMap;
  });

  return { stringArray: newStringArray, translationMaps };
}

/**
 * Adjusts the category indices in a category list using a translation map.
 */
function adjustResourceTableLibs(
  libs: Array<IndexIntoLibs | null>, // type of ResourceTable.libs
  translationMap: TranslationMapForLibs
): Array<IndexIntoLibs | null> {
  return libs.map((lib) => {
    if (lib === null) {
      return lib;
    }
    const result = translationMap.get(lib);
    if (result === undefined) {
      throw new Error(
        stripIndent`
          Lib with index ${lib} hasn't been found in the translation map.
          This shouldn't happen and indicates a bug in the profiler's code.
        `
      );
    }
    return result;
  });
}

// Same as above, but without the " | null" in the type, to make flow happy.
function adjustNativeSymbolLibs(
  libs: Array<IndexIntoLibs>, // type of ResourceTable.libs
  translationMap: TranslationMapForLibs
): Array<IndexIntoLibs> {
  return libs.map((lib) => {
    const result = translationMap.get(lib);
    if (result === undefined) {
      throw new Error(
        stripIndent`
          Lib with index ${lib} hasn't been found in the translation map.
          This shouldn't happen and indicates a bug in the profiler's code.
        `
      );
    }
    return result;
  });
}

/**
 * Adjusts the category indices in a category list using a translation map.
 * This is just like the previous function, except the input and output arrays
 * can have null values. There are 2 different functions to keep our type
 * safety.
 */
function adjustNullableCategories(
  categories: ReadonlyArray<IndexIntoCategoryList | null>,
  translationMap: TranslationMapForCategories
): Array<IndexIntoCategoryList | null> {
  return categories.map((category) => {
    if (category === null) {
      return null;
    }
    const result = translationMap.get(category);
    if (result === undefined) {
      throw new Error(
        stripIndent`
          Category with index ${category} hasn't been found in the translation map.
          This shouldn't happen and indicates a bug in the profiler's code.
        `
      );
    }
    return result;
  });
}

function adjustStringIndexes(
  stringIndexes: ReadonlyArray<IndexIntoStringTable>,
  translationMap: TranslationMapForStrings
): Array<IndexIntoStringTable> {
  return stringIndexes.map((stringIndex) => {
    const newStringIndex = translationMap.get(stringIndex);
    if (newStringIndex === undefined) {
      throw new Error(
        stripIndent`
          String with index ${stringIndex} hasn't been found in the translation map.
          This shouldn't happen and indicates a bug in the profiler's code.
        `
      );
    }
    return newStringIndex;
  });
}

function adjustMarkerDataStringIndexes(
  dataCol: ReadonlyArray<MarkerPayload | null>,
  translationMap: TranslationMapForStrings,
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
        const newStringIndex = translationMap.get(stringIndex);
        if (newStringIndex === undefined) {
          throw new Error(
            stripIndent`
              String with index ${stringIndex} hasn't been found in the translation map.
              This shouldn't happen and indicates a bug in the profiler's code.
            `
          );
        }
        newData = {
          ...newData,
          [fieldKey]: newStringIndex,
        } as any;
      }
    }
    return newData;
  });
}

function adjustNullableStringIndexes(
  stringIndexes: ReadonlyArray<IndexIntoStringTable | null>,
  translationMap: TranslationMapForStrings
): Array<IndexIntoStringTable | null> {
  return stringIndexes.map((stringIndex) => {
    if (stringIndex === null) {
      return null;
    }
    const newStringIndex = translationMap.get(stringIndex);
    if (newStringIndex === undefined) {
      throw new Error(
        stripIndent`
          String with index ${stringIndex} hasn't been found in the translation map.
          This shouldn't happen and indicates a bug in the profiler's code.
        `
      );
    }
    return newStringIndex;
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
  const mapOfInsertedLibs: Map<string, IndexIntoLibs> = new Map();

  const translationMaps: Array<Map<IndexIntoLibs, IndexIntoLibs>> = [];
  const newLibTable: Lib[] = [];

  for (const libs of libsPerProfile) {
    const translationMap = new Map();

    libs.forEach((lib, i) => {
      const insertedLibKey = [lib.name, lib.debugName].join('#');
      const insertedLibIndex = mapOfInsertedLibs.get(insertedLibKey);
      if (insertedLibIndex !== undefined) {
        translationMap.set(i, insertedLibIndex);
        return;
      }

      translationMap.set(i, newLibTable.length);
      mapOfInsertedLibs.set(insertedLibKey, newLibTable.length);

      newLibTable.push(lib);
    });

    translationMaps.push(translationMap);
  }

  return { libs: newLibTable, translationMaps };
}

/**
 * This combines the resource tables for a list of threads. It returns the new
 * resource table with the translation maps to be used in subsequent merging
 * functions.
 */
function combineResourceTables(threads: ReadonlyArray<RawThread>): {
  resourceTable: ResourceTable;
  translationMaps: TranslationMapForResources[];
} {
  const mapOfInsertedResources: Map<string, IndexIntoResourceTable> = new Map();
  const translationMaps: TranslationMapForResources[] = [];
  const newResourceTable = getEmptyResourceTable();

  threads.forEach((thread) => {
    const translationMap = new Map();
    const { resourceTable } = thread;

    for (let i = 0; i < resourceTable.length; i++) {
      const libIndex = resourceTable.lib[i];
      const nameIndex = resourceTable.name[i];
      const hostIndex = resourceTable.host[i];
      const type = resourceTable.type[i];

      // Duplicate search.
      const resourceKey = [nameIndex, type].join('#');
      const insertedResourceIndex = mapOfInsertedResources.get(resourceKey);
      if (insertedResourceIndex !== undefined) {
        translationMap.set(i, insertedResourceIndex);
        continue;
      }

      translationMap.set(i, newResourceTable.length);
      mapOfInsertedResources.set(resourceKey, newResourceTable.length);

      newResourceTable.lib.push(libIndex);
      newResourceTable.name.push(nameIndex);
      newResourceTable.host.push(hostIndex);
      newResourceTable.type.push(type);
      newResourceTable.length++;
    }

    translationMaps.push(translationMap);
  });

  return { resourceTable: newResourceTable, translationMaps };
}

/**
 * This combines the nativeSymbols tables for the threads.
 */
function combineNativeSymbolTables(threads: ReadonlyArray<RawThread>): {
  nativeSymbols: NativeSymbolTable;
  translationMaps: TranslationMapForNativeSymbols[];
} {
  const mapOfInsertedNativeSymbols: Map<string, IndexIntoNativeSymbolTable> =
    new Map();
  const translationMaps: TranslationMapForNativeSymbols[] = [];
  const newNativeSymbols = getEmptyNativeSymbolTable();

  threads.forEach((thread) => {
    const translationMap = new Map();
    const { nativeSymbols } = thread;

    for (let i = 0; i < nativeSymbols.length; i++) {
      const libIndex = nativeSymbols.libIndex[i];
      const nameIndex = nativeSymbols.name[i];
      const address = nativeSymbols.address[i];
      const functionSize = nativeSymbols.functionSize[i];

      // Duplicate search.
      const nativeSymbolKey = [nameIndex, address].join('#');
      const insertedNativeSymbolIndex =
        mapOfInsertedNativeSymbols.get(nativeSymbolKey);
      if (insertedNativeSymbolIndex !== undefined) {
        translationMap.set(i, insertedNativeSymbolIndex);
        continue;
      }

      translationMap.set(i, newNativeSymbols.length);
      mapOfInsertedNativeSymbols.set(nativeSymbolKey, newNativeSymbols.length);

      newNativeSymbols.libIndex.push(libIndex);
      newNativeSymbols.name.push(nameIndex);
      newNativeSymbols.address.push(address);
      newNativeSymbols.functionSize.push(functionSize);

      newNativeSymbols.length++;
    }

    translationMaps.push(translationMap);
  });

  return { nativeSymbols: newNativeSymbols, translationMaps };
}

/**
 * This combines the function tables for a list of threads. It returns the new
 * function table with the translation maps to be used in subsequent merging
 * functions.
 */
function combineFuncTables(
  translationMapsForResources: TranslationMapForResources[],
  threads: ReadonlyArray<RawThread>
): { funcTable: FuncTable; translationMaps: TranslationMapForFuncs[] } {
  const mapOfInsertedFuncs: Map<string, IndexIntoFuncTable> = new Map();
  const translationMaps: TranslationMapForFuncs[] = [];
  const newFuncTable = getEmptyFuncTable();

  threads.forEach((thread, threadIndex) => {
    const { funcTable } = thread;
    const translationMap = new Map();
    const resourceTranslationMap = translationMapsForResources[threadIndex];

    for (let i = 0; i < funcTable.length; i++) {
      const fileNameIndex = funcTable.fileName[i];
      const resourceIndex = funcTable.resource[i];
      const newResourceIndex =
        resourceIndex >= 0
          ? resourceTranslationMap.get(funcTable.resource[i])
          : -1;
      if (newResourceIndex === undefined) {
        throw new Error(stripIndent`
          We couldn't find the resource of func ${i} in the translation map.
          This is a programming error.
        `);
      }
      const nameIndex = funcTable.name[i];
      const lineNumber = funcTable.lineNumber[i];

      // Entries in this table can be either:
      // 1. native: in that case they'll have a resource index and a name. The
      //    name should be unique in a specific resource.
      // 2. JS: they'll have a resource index and a name too, but the name is
      //    not garanteed to be unique in a resource. That's why we use the line
      //    number as well.
      // 3. Label frames: they have no resource, only a name. So we can't do
      //    better than this.
      const funcKey = [nameIndex, newResourceIndex, lineNumber].join('#');
      const insertedFuncIndex = mapOfInsertedFuncs.get(funcKey);
      if (insertedFuncIndex !== undefined) {
        translationMap.set(i, insertedFuncIndex);
        continue;
      }
      mapOfInsertedFuncs.set(funcKey, newFuncTable.length);
      translationMap.set(i, newFuncTable.length);

      newFuncTable.isJS.push(funcTable.isJS[i]);
      newFuncTable.name.push(nameIndex);
      newFuncTable.resource.push(newResourceIndex);
      newFuncTable.relevantForJS.push(funcTable.relevantForJS[i]);
      newFuncTable.fileName.push(fileNameIndex);
      newFuncTable.lineNumber.push(lineNumber);
      newFuncTable.columnNumber.push(funcTable.columnNumber[i]);

      newFuncTable.length++;
    }

    translationMaps.push(translationMap);
  });

  return { funcTable: newFuncTable, translationMaps };
}

/**
 * This combines the frame tables for a list of threads. It returns the new
 * frame table with the translation maps to be used in subsequent merging
 * functions.
 * Note that we don't try to merge the frames of the source threads, because
 * that's not needed to get a diffing call tree.
 */
function combineFrameTables(
  translationMapsForFuncs: TranslationMapForFuncs[],
  translationMapsForNativeSymbols: TranslationMapForNativeSymbols[],
  threads: ReadonlyArray<RawThread>
): { frameTable: FrameTable; translationMaps: TranslationMapForFrames[] } {
  const translationMaps: TranslationMapForFrames[] = [];
  const newFrameTable = getEmptyFrameTable();

  threads.forEach((thread, threadIndex) => {
    const { frameTable } = thread;
    const translationMap = new Map();
    const funcTranslationMap = translationMapsForFuncs[threadIndex];
    const nativeSymbolTranslationMap =
      translationMapsForNativeSymbols[threadIndex];

    for (let i = 0; i < frameTable.length; i++) {
      const newFunc = funcTranslationMap.get(frameTable.func[i]);
      if (newFunc === undefined) {
        throw new Error(stripIndent`
          We couldn't find the function of frame ${i} in the translation map.
          This is a programming error.
        `);
      }

      const nativeSymbol = frameTable.nativeSymbol[i];
      const newNativeSymbol =
        nativeSymbol === null
          ? null
          : nativeSymbolTranslationMap.get(nativeSymbol);
      if (newNativeSymbol === undefined) {
        throw new Error(stripIndent`
          We couldn't find the nativeSymbol of frame ${i} in the translation map.
          This is a programming error.
        `);
      }

      newFrameTable.address.push(frameTable.address[i]);
      newFrameTable.inlineDepth.push(frameTable.inlineDepth[i]);
      newFrameTable.category.push(frameTable.category[i]);
      newFrameTable.subcategory.push(frameTable.subcategory[i]);
      newFrameTable.nativeSymbol.push(newNativeSymbol);
      newFrameTable.func.push(newFunc);
      newFrameTable.innerWindowID.push(frameTable.innerWindowID[i]);
      newFrameTable.line.push(frameTable.line[i]);
      newFrameTable.column.push(frameTable.column[i]);

      translationMap.set(i, newFrameTable.length);
      newFrameTable.length++;
    }

    translationMaps.push(translationMap);
  });

  return { frameTable: newFrameTable, translationMaps };
}

/**
 * This combines the stack tables for a list of threads. It returns the new
 * stack table with the translation maps to be used in subsequent merging
 * functions.
 * Note that we don't try to merge the stacks of the source threads, because
 * that's not needed to get a diffing call tree.
 */
function combineStackTables(
  translationMapsForFrames: TranslationMapForFrames[],
  threads: ReadonlyArray<RawThread>
): { stackTable: RawStackTable; translationMaps: TranslationMapForStacks[] } {
  const translationMaps: TranslationMapForStacks[] = [];
  const newStackTable = getEmptyRawStackTable();

  threads.forEach((thread, threadIndex) => {
    const { stackTable } = thread;
    const translationMap = new Map();
    const frameTranslationMap = translationMapsForFrames[threadIndex];

    for (let i = 0; i < stackTable.length; i++) {
      const newFrameIndex = frameTranslationMap.get(stackTable.frame[i]);
      if (newFrameIndex === undefined) {
        throw new Error(stripIndent`
          We couldn't find the frame of stack ${i} in the translation map.
          This is a programming error.
        `);
      }

      const prefix = stackTable.prefix[i];
      const newPrefix = prefix === null ? null : translationMap.get(prefix);
      if (newPrefix === undefined) {
        throw new Error(stripIndent`
          We couldn't find the prefix of stack ${i} in the translation map.
          This is a programming error.
        `);
      }

      newStackTable.frame.push(newFrameIndex);
      newStackTable.prefix.push(newPrefix);

      translationMap.set(i, newStackTable.length);
      newStackTable.length++;
    }

    translationMaps.push(translationMap);
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
  translationMapsForStacks: TranslationMapForStacks[],
  threadsAndWeightMultipliers: [
    ThreadAndWeightMultiplier,
    ThreadAndWeightMultiplier,
  ]
): { samples: RawSamplesTable; translationMaps: TranslationMapForSamples[] } {
  const translationMaps = [new Map(), new Map()];
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
      const stackIndex = samples1.stack[i];
      const newStackIndex =
        stackIndex === null
          ? null
          : translationMapsForStacks[0].get(stackIndex);
      if (newStackIndex === undefined) {
        throw new Error(stripIndent`
          We couldn't find the stack of sample ${i} in the translation map.
          This is a programming error.
        `);
      }
      newSamples.stack.push(newStackIndex);
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

      translationMaps[0].set(i, newSamples.length);
      newSamples.length++;
      i++;
    } else {
      // Next sample is from thread 2.
      const stackIndex = samples2.stack[j];
      const newStackIndex =
        stackIndex === null
          ? null
          : translationMapsForStacks[1].get(stackIndex);
      if (newStackIndex === undefined) {
        throw new Error(stripIndent`
          We couldn't find the stack of sample ${j} in the translation map.
          This is a programming error.
        `);
      }
      newSamples.stack.push(newStackIndex);
      // Diffing event delay values doesn't make sense since interleaved values
      // of eventDelay/responsiveness don't mean anything.
      newSamples.eventDelay!.push(null);
      newSamples.time!.push(samples2Time[j]);
      newThreadId.push(samples2.threadId ? samples2.threadId[j] : tid2);
      const sampleWeight = samples2.weight ? samples2.weight[j] : 1;
      newWeight.push(weightMultiplier2 * sampleWeight);

      translationMaps[1].set(j, newSamples.length);
      newSamples.length++;
      j++;
    }
  }

  return {
    samples: newSamples,
    translationMaps,
  };
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

  const {
    resourceTable: newResourceTable,
    translationMaps: translationMapsForResources,
  } = combineResourceTables(threads);
  const {
    nativeSymbols: newNativeSymbols,
    translationMaps: translationMapsForNativeSymbols,
  } = combineNativeSymbolTables(threads);
  const { funcTable: newFuncTable, translationMaps: translationMapsForFuncs } =
    combineFuncTables(translationMapsForResources, threads);
  const {
    frameTable: newFrameTable,
    translationMaps: translationMapsForFrames,
  } = combineFrameTables(
    translationMapsForFuncs,
    translationMapsForNativeSymbols,
    threads
  );
  const {
    stackTable: newStackTable,
    translationMaps: translationMapsForStacks,
  } = combineStackTables(translationMapsForFrames, threads);
  const { samples: newSamples } = combineSamplesDiffing(
    translationMapsForStacks,
    threadsAndWeightMultipliers
  );

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
    stackTable: newStackTable,
    frameTable: newFrameTable,
    funcTable: newFuncTable,
    resourceTable: newResourceTable,
    nativeSymbols: newNativeSymbols,
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
  // Combine the table we would need.
  const {
    resourceTable: newResourceTable,
    translationMaps: translationMapsForResources,
  } = combineResourceTables(threads);
  const {
    nativeSymbols: newNativeSymbols,
    translationMaps: translationMapsForNativeSymbols,
  } = combineNativeSymbolTables(threads);
  const { funcTable: newFuncTable, translationMaps: translationMapsForFuncs } =
    combineFuncTables(translationMapsForResources, threads);
  const {
    frameTable: newFrameTable,
    translationMaps: translationMapsForFrames,
  } = combineFrameTables(
    translationMapsForFuncs,
    translationMapsForNativeSymbols,
    threads
  );
  const {
    stackTable: newStackTable,
    translationMaps: translationMapsForStacks,
  } = combineStackTables(translationMapsForFrames, threads);

  // Combine the samples for merging.
  const newSamples = combineSamplesForMerging(
    translationMapsForStacks,
    threads
  );

  const { markerTable: newMarkers } = mergeMarkers(
    translationMapsForStacks,
    threads
  );

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
    stackTable: newStackTable,
    frameTable: newFrameTable,
    funcTable: newFuncTable,
    nativeSymbols: newNativeSymbols,
    resourceTable: newResourceTable,
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
function combineSamplesForMerging(
  translationMapsForStacks: TranslationMapForStacks[],
  threads: RawThread[]
): RawSamplesTable {
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

    const stackIndex: number | null =
      sourceThreadSamples.stack[sourceThreadSampleIndex];
    const newStackIndex =
      stackIndex === null
        ? null
        : translationMapsForStacks[sourceThreadIndex].get(stackIndex);
    if (newStackIndex === undefined) {
      throw new Error(stripIndent`
          We couldn't find the stack of sample ${sourceThreadSampleIndex} in the translation map.
          This is a programming error.
        `);
    }
    newSamples.stack.push(newStackIndex);
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

type TranslationMapForMarkers = Map<MarkerIndex, MarkerIndex>;

/**
 * Merge markers from different threads. And update the new string table while doing it.
 */
function mergeMarkers(
  translationMapsForStacks: TranslationMapForStacks[],
  threads: RawThread[]
): {
  markerTable: RawMarkerTable;
  translationMaps: TranslationMapForMarkers[];
} {
  const newThreadId: Tid[] = [];
  const newMarkerTable = { ...getEmptyRawMarkerTable(), threadId: newThreadId };

  const translationMaps: TranslationMapForMarkers[] = [];

  threads.forEach((thread, threadIndex) => {
    const translationMapForStacks = translationMapsForStacks[threadIndex];
    const translationMap = new Map();
    const { markers } = thread;

    for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      // We need to move the name string to the new string table if doesn't exist.
      const nameIndex = markers.name[markerIndex];

      // Move marker data to the new marker table
      const oldData = markers.data[markerIndex];

      if (oldData && 'cause' in oldData && oldData.cause) {
        // The old data has a cause, we need to convert the stack.
        const oldStack = oldData.cause.stack;
        const newStack = translationMapForStacks.get(oldStack);
        if (newStack === undefined) {
          throw new Error(
            `Missing old stack entry ${oldStack} in the translation map.`
          );
        }

        newMarkerTable.data.push({
          ...oldData,
          cause: {
            ...oldData.cause,
            stack: newStack,
          },
        });
      } else {
        newMarkerTable.data.push(oldData);
      }

      newMarkerTable.name.push(nameIndex);
      newMarkerTable.startTime.push(markers.startTime[markerIndex]);
      newMarkerTable.endTime.push(markers.endTime[markerIndex]);
      newMarkerTable.phase.push(markers.phase[markerIndex]);
      newMarkerTable.category.push(markers.category[markerIndex]);
      newThreadId.push(
        markers.threadId
          ? (markers.threadId[markerIndex] ?? thread.tid)
          : thread.tid
      );

      // Set the translation map and increase the table length.
      translationMap.set(markerIndex, newMarkerTable.length);
      newMarkerTable.length++;
    }

    translationMaps.push(translationMap);
  });

  return { markerTable: newMarkerTable, translationMaps };
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
