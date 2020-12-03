/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/*
 * This file contains all functions that are needed to achieve profiles
 * comparison: how to merge profiles, how to diff them, etc.
 */

import { stripIndent } from 'common-tags';

import {
  adjustTableTimestamps,
  adjustMarkerTimestamps,
} from './process-profile';
import {
  getEmptyProfile,
  getEmptyResourceTable,
  getEmptyFrameTable,
  getEmptyFuncTable,
  getEmptyStackTable,
  getEmptyRawMarkerTable,
  getEmptySamplesTableWithEventDelay,
} from './data-structures';
import {
  filterThreadSamplesToRange,
  getTimeRangeForThread,
  getTimeRangeIncludingAllThreads,
} from './profile-data';
import {
  filterRawMarkerTableToRange,
  deriveMarkersFromRawMarkerTable,
  correlateIPCMarkers,
} from './marker-data';
import { UniqueStringArray } from '../utils/unique-string-array';
import { ensureExists, getFirstItemFromSet } from '../utils/flow';

import type {
  Profile,
  Thread,
  IndexIntoCategoryList,
  CategoryList,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
  IndexIntoResourceTable,
  IndexIntoLibs,
  IndexIntoStackTable,
  IndexIntoSamplesTable,
  FuncTable,
  FrameTable,
  Lib,
  ResourceTable,
  StackTable,
  SamplesTable,
  UrlState,
  ImplementationFilter,
  TransformStacksPerThread,
  Milliseconds,
  DerivedMarkerInfo,
  RawMarkerTable,
  MarkerIndex,
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
): {|
  profile: Profile,
  transformStacks: TransformStacksPerThread,
  implementationFilters: ImplementationFilter[],
|} {
  if (profiles.length !== profileStates.length) {
    throw new Error(
      'Passed arrays do not have the same length. This should not happen.'
    );
  }
  if (!profiles.length) {
    throw new Error('There are no profiles to merge.');
  }

  const resultProfile = getEmptyProfile();
  resultProfile.meta.interval = Math.min(
    ...profiles.map(profile => profile.meta.interval)
  );

  // If all profiles have an unknown symbolication status, we keep this unknown
  // status for the combined profile. Otherwise, we mark the combined profile
  // symbolicated only if all profiles are, so that a symbolication process will
  // be kicked off if necessary.
  if (profiles.every(profile => profile.meta.symbolicated === undefined)) {
    delete resultProfile.meta.symbolicated;
  } else {
    resultProfile.meta.symbolicated = profiles.every(
      profile => profile.meta.symbolicated
    );
  }

  // First let's merge categories. We'll use the resulting maps when
  // handling the thread data later.
  const {
    categories: newCategories,
    translationMaps: translationMapsForCategories,
  } = mergeCategories(profiles.map(profile => profile.meta.categories));
  resultProfile.meta.categories = newCategories;

  // Then we loop over all profiles and do the necessary changes according
  // to the states we computed earlier.
  const transformStacks = {};
  const implementationFilters = [];
  // These may be needed for filtering markers.
  let ipcCorrelations;

  for (let i = 0; i < profileStates.length; i++) {
    const { profileSpecific } = profileStates[i];
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
    thread.stackTable = {
      ...thread.stackTable,
      category: adjustCategories(
        thread.stackTable.category,
        translationMapsForCategories[i]
      ),
    };
    thread.frameTable = {
      ...thread.frameTable,
      category: adjustNullableCategories(
        thread.frameTable.category,
        translationMapsForCategories[i]
      ),
    };

    //Screenshot markers is in different threads of the imported profile.
    //These markers are extracted and merged here using the mergeScreenshotMarkers().

    const { markerTable } = mergeScreenshotMarkers(profile.threads, thread);
    thread.markers = { ...thread.markers, ...markerTable };

    // We filter the profile using the range from the state for this profile.
    const zeroAt = getTimeRangeIncludingAllThreads(profile).start;
    const committedRange =
      profileSpecific.committedRanges && profileSpecific.committedRanges.pop();

    if (committedRange) {
      // Filtering markers in a thread happens with the derived markers, so they
      // will need to be computed.
      if (!ipcCorrelations) {
        ipcCorrelations = correlateIPCMarkers(profile.threads);
      }
      const derivedMarkerInfo = deriveMarkersFromRawMarkerTable(
        thread.markers,
        thread.stringTable,
        thread.tid || 0,
        committedRange,
        ipcCorrelations
      );
      thread = filterThreadToRange(
        thread,
        derivedMarkerInfo,
        committedRange.start + zeroAt,
        committedRange.end + zeroAt
      );
    }

    // We're reseting the thread's PID to make sure we don't have any collision.
    thread.pid = `${thread.pid} from profile ${i + 1}`;
    thread.processName = `Profile ${i + 1}: ${thread.processName ||
      thread.name}`;

    // We adjust the various times so that the 2 profiles are aligned at the
    // start and the data is consistent.
    const startTimeAdjustment = -thread.samples.time[0];
    thread.samples = adjustTableTimestamps(thread.samples, startTimeAdjustment);
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
      getComparisonThread(translationMapsForCategories, [
        {
          thread: resultProfile.threads[0],
          interval: profiles[0].meta.interval,
        },
        {
          thread: resultProfile.threads[1],
          interval: profiles[1].meta.interval,
        },
      ])
    );
  }

  return { profile: resultProfile, implementationFilters, transformStacks };
}

/**
 * This is a small utility function that makes it easier to filter a thread
 * completely (both raw markers and samples). This is not part of the normal
 * filtering pipeline, but is used with comparison profiles.
 */
function filterThreadToRange(
  thread: Thread,
  derivedMarkerInfo: DerivedMarkerInfo,
  rangeStart: number,
  rangeEnd: number
): Thread {
  thread = filterThreadSamplesToRange(thread, rangeStart, rangeEnd);
  thread.markers = filterRawMarkerTableToRange(
    thread.markers,
    derivedMarkerInfo,
    rangeStart,
    rangeEnd
  );
  return thread;
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
type TranslationMapForFrames = Map<IndexIntoFrameTable, IndexIntoFrameTable>;
type TranslationMapForStacks = Map<IndexIntoStackTable, IndexIntoStackTable>;
type TranslationMapForLibs = Map<IndexIntoLibs, IndexIntoLibs>;
type TranslationMapForSamples = Map<
  IndexIntoSamplesTable,
  IndexIntoSamplesTable
>;

/**
 * Merges several categories lists into one, resolving duplicates if necessary.
 * It returns a translation map that can be used in `adjustCategories` later.
 */
function mergeCategories(
  categoriesPerThread: CategoryList[]
): {|
  categories: CategoryList,
  translationMaps: TranslationMapForCategories[],
|} {
  const newCategories = [];
  const translationMaps = [];
  const newCategoryIndexByName: Map<string, IndexIntoCategoryList> = new Map();

  categoriesPerThread.forEach(categories => {
    const translationMap = new Map();
    translationMaps.push(translationMap);

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
  });

  return { categories: newCategories, translationMaps };
}

/**
 * Adjusts the category indices in a category list using a translation map.
 */
function adjustCategories(
  categories: $ReadOnlyArray<IndexIntoCategoryList>,
  translationMap: TranslationMapForCategories
): Array<IndexIntoCategoryList> {
  return categories.map(category => {
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

/**
 * Adjusts the category indices in a category list using a translation map.
 * This is just like the previous function, except the input and output arrays
 * can have null values. There are 2 different functions to keep our type
 * safety.
 */
function adjustNullableCategories(
  categories: $ReadOnlyArray<IndexIntoCategoryList | null>,
  translationMap: TranslationMapForCategories
): Array<IndexIntoCategoryList | null> {
  return categories.map(category => {
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

/**
 * This combines the library tables for a list of threads. It returns a merged
 * Lib array, along with a translation maps that can be used in other functions
 * when merging lib references in other tables.
 */
function combineLibTables(
  threads: $ReadOnlyArray<Thread>
): { libs: Lib[], translationMaps: TranslationMapForLibs[] } {
  const mapOfInsertedLibs: Map<string, IndexIntoLibs> = new Map();

  const translationMaps = [];
  const newLibTable = [];

  threads.forEach(thread => {
    const translationMap = new Map();
    const { libs } = thread;

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
  });

  return { libs: newLibTable, translationMaps };
}

/**
 * This combines the resource tables for a list of threads. It returns the new
 * resource table with the translation maps to be used in subsequent merging
 * functions.
 */
function combineResourceTables(
  translationMapsForLibs: TranslationMapForLibs[],
  newStringTable: UniqueStringArray,
  threads: $ReadOnlyArray<Thread>
): {
  resourceTable: ResourceTable,
  translationMaps: TranslationMapForResources[],
} {
  const mapOfInsertedResources: Map<string, IndexIntoResourceTable> = new Map();
  const translationMaps = [];
  const newResourceTable = getEmptyResourceTable();

  threads.forEach((thread, threadIndex) => {
    const translationMap = new Map();
    const { resourceTable, stringTable } = thread;
    const libTranslationMap = translationMapsForLibs[threadIndex];

    for (let i = 0; i < resourceTable.length; i++) {
      const libIndex = resourceTable.lib[i];
      const newLibIndex =
        typeof libIndex === 'number' && libIndex >= 0
          ? libTranslationMap.get(libIndex)
          : null;
      if (newLibIndex === undefined) {
        throw new Error(stripIndent`
          We couldn't find the lib of resource ${i} in the translation map.
          This is a programming error.
        `);
      }

      const nameIndex = resourceTable.name[i];
      const newName = nameIndex >= 0 ? stringTable.getString(nameIndex) : null;

      const hostIndex = resourceTable.host[i];
      const newHost =
        typeof hostIndex === 'number' && hostIndex >= 0
          ? stringTable.getString(hostIndex)
          : undefined;

      const type = resourceTable.type[i];

      // Duplicate search.
      const resourceKey = [newLibIndex, newName || '', type].join('#');
      const insertedResourceIndex = mapOfInsertedResources.get(resourceKey);
      if (insertedResourceIndex !== undefined) {
        translationMap.set(i, insertedResourceIndex);
        continue;
      }

      translationMap.set(i, newResourceTable.length);
      mapOfInsertedResources.set(resourceKey, newResourceTable.length);

      newResourceTable.lib.push(newLibIndex);
      newResourceTable.name.push(
        newName === null ? -1 : newStringTable.indexForString(newName)
      );
      newResourceTable.host.push(
        newHost === undefined
          ? undefined
          : newStringTable.indexForString(newHost)
      );
      newResourceTable.type.push(type);

      newResourceTable.length++;
    }

    translationMaps.push(translationMap);
  });

  return { resourceTable: newResourceTable, translationMaps };
}

/**
 * This combines the function tables for a list of threads. It returns the new
 * function table with the translation maps to be used in subsequent merging
 * functions.
 */
function combineFuncTables(
  translationMapsForResources: TranslationMapForResources[],
  newStringTable: UniqueStringArray,
  threads: $ReadOnlyArray<Thread>
): { funcTable: FuncTable, translationMaps: TranslationMapForFuncs[] } {
  const mapOfInsertedFuncs: Map<string, IndexIntoFuncTable> = new Map();
  const translationMaps = [];
  const newFuncTable = getEmptyFuncTable();

  threads.forEach((thread, threadIndex) => {
    const { funcTable, stringTable } = thread;
    const translationMap = new Map();
    const resourceTranslationMap = translationMapsForResources[threadIndex];

    for (let i = 0; i < funcTable.length; i++) {
      const fileNameIndex = funcTable.fileName[i];
      const fileName =
        typeof fileNameIndex === 'number'
          ? stringTable.getString(fileNameIndex)
          : null;
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
      const name = stringTable.getString(funcTable.name[i]);
      const lineNumber = funcTable.lineNumber[i];

      // Entries in this table can be either:
      // 1. native: in that case they'll have a resource index and a name. The
      //    name should be unique in a specific resource.
      // 2. JS: they'll have a resource index and a name too, but the name is
      //    not garanteed to be unique in a resource. That's why we use the line
      //    number as well.
      // 3. Label frames: they have no resource, only a name. So we can't do
      //    better than this.
      const funcKey = [name, newResourceIndex, lineNumber].join('#');
      const insertedFuncIndex = mapOfInsertedFuncs.get(funcKey);
      if (insertedFuncIndex !== undefined) {
        translationMap.set(i, insertedFuncIndex);
        continue;
      }
      mapOfInsertedFuncs.set(funcKey, newFuncTable.length);
      translationMap.set(i, newFuncTable.length);

      newFuncTable.address.push(funcTable.address[i]);
      newFuncTable.isJS.push(funcTable.isJS[i]);
      newFuncTable.name.push(newStringTable.indexForString(name));
      newFuncTable.resource.push(newResourceIndex);
      newFuncTable.relevantForJS.push(funcTable.relevantForJS[i]);
      newFuncTable.fileName.push(
        fileName === null ? null : newStringTable.indexForString(fileName)
      );
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
  translationMapsForCategories: TranslationMapForCategories[] | null,
  translationMapsForFuncs: TranslationMapForFuncs[],
  newStringTable: UniqueStringArray,
  threads: $ReadOnlyArray<Thread>
): { frameTable: FrameTable, translationMaps: TranslationMapForFrames[] } {
  const translationMaps = [];
  const newFrameTable = getEmptyFrameTable();

  threads.forEach((thread, threadIndex) => {
    const { frameTable, stringTable } = thread;
    const translationMap = new Map();
    const funcTranslationMap = translationMapsForFuncs[threadIndex];
    const getNewCategory = category => {
      if (translationMapsForCategories === null) {
        // Translation map is not provided, return the category itself.
        return category;
      }
      const categoryTranslationMap = translationMapsForCategories[threadIndex];
      return categoryTranslationMap.get(category);
    };

    for (let i = 0; i < frameTable.length; i++) {
      const category = frameTable.category[i];
      const newCategory = category === null ? null : getNewCategory(category);
      if (newCategory === undefined) {
        throw new Error(stripIndent`
          We couldn't find the category of frame ${i} in the translation map.
          This is a programming error.
        `);
      }

      const newFunc = funcTranslationMap.get(frameTable.func[i]);
      if (newFunc === undefined) {
        throw new Error(stripIndent`
          We couldn't find the function of frame ${i} in the translation map.
          This is a programming error.
        `);
      }

      const implementationIndex = frameTable.implementation[i];
      const implementation =
        typeof implementationIndex === 'number'
          ? stringTable.getString(implementationIndex)
          : null;

      newFrameTable.address.push(frameTable.address[i]);
      newFrameTable.category.push(newCategory);
      // TODO issue #2151: we assume that subcategory strings are the same if
      // the category is the same, and have no translation maps. But we should
      // really implement one.
      newFrameTable.subcategory.push(frameTable.subcategory[i]);
      newFrameTable.func.push(newFunc);
      newFrameTable.innerWindowID.push(frameTable.innerWindowID[i]);
      newFrameTable.implementation.push(
        implementation === null
          ? null
          : newStringTable.indexForString(implementation)
      );
      newFrameTable.line.push(frameTable.line[i]);
      newFrameTable.column.push(frameTable.column[i]);
      newFrameTable.optimizations.push(frameTable.optimizations[i]);

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
  translationMapsForCategories: TranslationMapForCategories[] | null,
  translationMapsForFrames: TranslationMapForFrames[],
  threads: $ReadOnlyArray<Thread>
): { stackTable: StackTable, translationMaps: TranslationMapForStacks[] } {
  const translationMaps = [];
  const newStackTable = getEmptyStackTable();

  threads.forEach((thread, threadIndex) => {
    const { stackTable } = thread;
    const translationMap = new Map();
    const frameTranslationMap = translationMapsForFrames[threadIndex];
    const getNewCategory = category => {
      if (translationMapsForCategories === null) {
        // Translation map is not provided, return the category itself.
        return category;
      }
      const categoryTranslationMap = translationMapsForCategories[threadIndex];
      return categoryTranslationMap.get(category);
    };

    for (let i = 0; i < stackTable.length; i++) {
      const newFrameIndex = frameTranslationMap.get(stackTable.frame[i]);
      if (newFrameIndex === undefined) {
        throw new Error(stripIndent`
          We couldn't find the frame of stack ${i} in the translation map.
          This is a programming error.
        `);
      }
      const newCategory = getNewCategory(stackTable.category[i]);
      if (newCategory === undefined) {
        throw new Error(stripIndent`
          We couldn't find the category of stack ${i} in the translation map.
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
      newStackTable.category.push(newCategory);
      // TODO issue #2151: we assume that subcategory strings are the same if
      // the category is the same, and have no translation maps. But we should
      // really implement one.
      newStackTable.subcategory.push(stackTable.subcategory[i]);
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
  threadsAndIntervals: [ThreadAndInterval, ThreadAndInterval]
): { samples: SamplesTable, translationMaps: TranslationMapForSamples[] } {
  const translationMaps = [new Map(), new Map()];
  const [
    {
      thread: { samples: samples1 },
      interval: interval1,
    },
    {
      thread: { samples: samples2 },
      interval: interval2,
    },
  ] = threadsAndIntervals;

  const newWeight = [];
  const newSamples = {
    ...getEmptySamplesTableWithEventDelay(),
    weight: newWeight,
  };

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
      (j >= samples2.length || samples1.time[i] < samples2.time[j]);

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
      newSamples.eventDelay.push(null);
      newSamples.time.push(samples1.time[i]);
      // We add the first thread with a negative weight, because this is the
      // base profile.
      newWeight.push(-interval1);

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
      newSamples.eventDelay.push(null);
      newSamples.time.push(samples2.time[j]);
      newWeight.push(interval2);

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

type ThreadAndInterval = {|
  thread: Thread,
  interval: Milliseconds,
|};

/**
 * This function will compute a diffing thread from 2 different threads, using
 * all the previous functions.
 */
function getComparisonThread(
  translationMapsForCategories: TranslationMapForCategories[],
  threadsAndIntervals: [ThreadAndInterval, ThreadAndInterval]
): Thread {
  const newStringTable = new UniqueStringArray();

  const threads = threadsAndIntervals.map(item => item.thread);

  const {
    libs: newLibTable,
    translationMaps: translationMapsForLibs,
  } = combineLibTables(threads);
  const {
    resourceTable: newResourceTable,
    translationMaps: translationMapsForResources,
  } = combineResourceTables(translationMapsForLibs, newStringTable, threads);
  const {
    funcTable: newFuncTable,
    translationMaps: translationMapsForFuncs,
  } = combineFuncTables(translationMapsForResources, newStringTable, threads);
  const {
    frameTable: newFrameTable,
    translationMaps: translationMapsForFrames,
  } = combineFrameTables(
    translationMapsForCategories,
    translationMapsForFuncs,
    newStringTable,
    threads
  );
  const {
    stackTable: newStackTable,
    translationMaps: translationMapsForStacks,
  } = combineStackTables(
    translationMapsForCategories,
    translationMapsForFrames,
    threads
  );
  const { samples: newSamples } = combineSamplesDiffing(
    translationMapsForStacks,
    threadsAndIntervals
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
    tid: undefined,
    samples: newSamples,
    markers: getEmptyRawMarkerTable(),
    stackTable: newStackTable,
    frameTable: newFrameTable,
    stringTable: newStringTable,
    libs: newLibTable,
    funcTable: newFuncTable,
    resourceTable: newResourceTable,
  };

  return mergedThread;
}

/**
 * Merge threads inside a profile.
 * The threads should belong to the same profile because unlike mergeProfilesForDiffing,
 * this does not merge the profile level information like metadata, categories etc.
 * TODO: Overlapping threads will not look great due to #2783.
 */
export function mergeThreads(threads: Thread[]): Thread {
  const newStringTable = new UniqueStringArray();

  // Combine the table we would need.
  const {
    libs: newLibTable,
    translationMaps: translationMapsForLibs,
  } = combineLibTables(threads);
  const {
    resourceTable: newResourceTable,
    translationMaps: translationMapsForResources,
  } = combineResourceTables(translationMapsForLibs, newStringTable, threads);
  const {
    funcTable: newFuncTable,
    translationMaps: translationMapsForFuncs,
  } = combineFuncTables(translationMapsForResources, newStringTable, threads);
  const {
    frameTable: newFrameTable,
    translationMaps: translationMapsForFrames,
  } = combineFrameTables(
    null,
    translationMapsForFuncs,
    newStringTable,
    threads
  );
  const {
    stackTable: newStackTable,
    translationMaps: translationMapsForStacks,
  } = combineStackTables(null, translationMapsForFrames, threads);

  // Combine the samples for merging.
  const newSamples = combineSamplesForMerging(
    translationMapsForStacks,
    threads
  );

  const { markerTable: newMarkers } = mergeMarkers(threads, newStringTable);

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
    tid: undefined,
    samples: newSamples,
    markers: newMarkers,
    stackTable: newStackTable,
    frameTable: newFrameTable,
    stringTable: newStringTable,
    libs: newLibTable,
    funcTable: newFuncTable,
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
  threads: Thread[]
): SamplesTable {
  const sampleTables = threads.map(thread => thread.samples);
  // This is the array that holds the latest processed sample index for each
  // thread's samplesTable.
  const sampleIndexes = Array(sampleTables.length).fill(0);
  // Creating a new empty samples table to fill.
  const newSamples = getEmptySamplesTableWithEventDelay();

  while (true) {
    let selectedSamplesTableIndex: number | null = null;
    let time = Infinity;
    // 1. Find out which sample to consume.
    // Iterate over all the sample tables and pick the one with earliest sample.
    // TODO: We have this for loop inside the while loop which makes this
    // function's complexity O(n*m), where n is total sample count and m is the
    // thread count to merge. Possibly we can try to make this faster by reducing
    // the complexity.
    for (
      let sampleTablesIndex = 0;
      sampleTablesIndex < sampleTables.length;
      sampleTablesIndex++
    ) {
      const currentSamplesTable = sampleTables[sampleTablesIndex];
      const currentSamplesIndex = sampleIndexes[sampleTablesIndex];
      const currentSampleTime = currentSamplesTable.time[currentSamplesIndex];
      if (
        currentSamplesIndex < currentSamplesTable.length &&
        currentSampleTime < time
      ) {
        selectedSamplesTableIndex = sampleTablesIndex;
        time = currentSampleTime;
      }
    }

    if (selectedSamplesTableIndex === null) {
      // All samples from every thread have been consumed.
      break;
    }

    // 2. Add the earliest sample to the new sample table.
    const currentSamplesTable = sampleTables[selectedSamplesTableIndex];
    const oldSampleIndex: number = sampleIndexes[selectedSamplesTableIndex];

    const stackIndex: number | null = currentSamplesTable.stack[oldSampleIndex];
    const newStackIndex =
      stackIndex === null
        ? null
        : translationMapsForStacks[selectedSamplesTableIndex].get(stackIndex);
    if (newStackIndex === undefined) {
      throw new Error(stripIndent`
          We couldn't find the stack of sample ${oldSampleIndex} in the translation map.
          This is a programming error.
        `);
    }
    newSamples.stack.push(newStackIndex);
    // It doesn't make sense to combine event delay values. We need to use jank markers
    // from independent threads instead.
    ensureExists(newSamples.eventDelay).push(null);
    newSamples.time.push(currentSamplesTable.time[oldSampleIndex]);

    newSamples.length++;
    sampleIndexes[selectedSamplesTableIndex]++;
  }

  return newSamples;
}

type TranslationMapForMarkers = Map<MarkerIndex, MarkerIndex>;

/**
 * Merge markers from different threads. And update the new string table while doing it.
 */
function mergeMarkers(
  threads: Thread[],
  newStringTable: UniqueStringArray
): {
  markerTable: RawMarkerTable,
  translationMaps: TranslationMapForMarkers[],
} {
  const newMarkerTable = getEmptyRawMarkerTable();
  const translationMaps = [];

  threads.forEach(thread => {
    const translationMap = new Map();
    const { markers, stringTable } = thread;

    for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      // We need to move the name string to the new string table if doesn't exist.
      const nameIndex = markers.name[markerIndex];
      const newName = nameIndex >= 0 ? stringTable.getString(nameIndex) : null;

      // Move marker data to the new marker table.
      newMarkerTable.data.push(markers.data[markerIndex]);
      newMarkerTable.name.push(
        newName === null ? -1 : newStringTable.indexForString(newName)
      );
      newMarkerTable.startTime.push(markers.startTime[markerIndex]);
      newMarkerTable.endTime.push(markers.endTime[markerIndex]);
      newMarkerTable.phase.push(markers.phase[markerIndex]);
      newMarkerTable.category.push(markers.category[markerIndex]);

      // Set the translation map and increase the table length.
      translationMap.set(markerIndex, newMarkerTable.length);
      newMarkerTable.length++;
    }

    translationMaps.push(translationMap);
  });

  return { markerTable: newMarkerTable, translationMaps };
}

/**
 * Merge screenshot markers from different threads. And update the target threads string table while doing it.
 */
function mergeScreenshotMarkers(
  threads: Thread[],
  targetThread: Thread
): {
  markerTable: RawMarkerTable,
  translationMaps: TranslationMapForMarkers[],
} {
  const targetMarkerTable = { ...targetThread.markers };
  const translationMaps = [];

  threads.forEach(thread => {
    if (thread.stringTable.hasString('CompositorScreenshot')) {
      const translationMap = new Map();
      const { markers, stringTable } = thread;

      for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
        const data = markers.data[markerIndex];

        if (data !== null && data.type === 'CompositorScreenshot') {
          // We need to move the name string to the new string table if doesn't exist.
          const nameIndex = markers.name[markerIndex];
          const newName =
            nameIndex >= 0 ? stringTable.getString(nameIndex) : null;

          // We need to move the url string to the new string table if doesn't exist.
          const urlIndex = data.url;
          const newUrl = urlIndex >= 0 ? stringTable.getString(urlIndex) : null;

          // Move compositor screenshot marker data to the new marker table.
          const compositorScreenshotMarkerData = {
            ...data,
          };
          compositorScreenshotMarkerData.url =
            newUrl === null
              ? -1
              : targetThread.stringTable.indexForString(newUrl);

          targetMarkerTable.data.push(compositorScreenshotMarkerData);
          targetMarkerTable.name.push(
            newName === null
              ? -1
              : targetThread.stringTable.indexForString(newName)
          );
          targetMarkerTable.startTime.push(markers.startTime[markerIndex]);
          targetMarkerTable.endTime.push(markers.endTime[markerIndex]);
          targetMarkerTable.phase.push(markers.phase[markerIndex]);
          targetMarkerTable.category.push(markers.category[markerIndex]);

          // Set the translation map and increase the table length.
          translationMap.set(markerIndex, targetMarkerTable.length);
          targetMarkerTable.length++;
        }
      }
      translationMaps.push(translationMap);
    }
  });

  return { markerTable: targetMarkerTable, translationMaps };
}
