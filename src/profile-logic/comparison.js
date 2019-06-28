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
  adjustSampleTimestamps,
  adjustMarkerTimestamps,
} from './process-profile';
import {
  getEmptyProfile,
  getEmptyResourceTable,
  getEmptySamplesTable,
  getEmptyFrameTable,
  getEmptyFuncTable,
  getEmptyStackTable,
  getEmptyRawMarkerTable,
} from './data-structures';
import {
  filterThreadSamplesToRange,
  getTimeRangeForThread,
  getTimeRangeIncludingAllThreads,
} from './profile-data';
import { filterRawMarkerTableToRange } from './marker-data';
import { UniqueStringArray } from '../utils/unique-string-array';

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
} from '../types/profile';
import type { UrlState } from '../types/state';
import type { ImplementationFilter } from '../types/actions';
import type { TransformStacksPerThread } from '../types/transforms';

/**
 * This function is the entry point for this file. From a list of profile
 * sources and a list of states coming from URLs, it computes a new profile
 * that's composed of parts of the 2 source profiles.
 * It also computes a diffed profile as a last thread.
 * It returns this merged profile along the transforms and implementation
 * filters as decided by the source states.
 */
export function mergeProfiles(
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

  for (let i = 0; i < profileStates.length; i++) {
    const { profileSpecific } = profileStates[i];
    const selectedThreadIndex = profileSpecific.selectedThread;
    if (selectedThreadIndex === null) {
      throw new Error(`No thread has been selected in profile ${i}`);
    }
    const profile = profiles[i];
    let thread = profile.threads[selectedThreadIndex];
    transformStacks[i] = profileSpecific.transforms[selectedThreadIndex];
    implementationFilters.push(profileSpecific.implementation);

    // We adjust the categories using the maps computed above.
    // TODO: Also adjust subcategories.
    thread.stackTable.category = adjustCategories(
      thread.stackTable.category,
      translationMapsForCategories[i]
    );
    thread.frameTable.category = adjustNullableCategories(
      thread.frameTable.category,
      translationMapsForCategories[i]
    );

    // We filter the profile using the range from the state for this profile.
    const zeroAt = getTimeRangeIncludingAllThreads(profile).start;
    const committedRange =
      profileSpecific.committedRanges && profileSpecific.committedRanges.pop();

    if (committedRange) {
      thread = filterThreadToRange(
        thread,
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
    thread.samples = adjustSampleTimestamps(
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
  if (resultProfile.threads.length === 2) {
    resultProfile.threads.push(
      getComparisonThread(
        translationMapsForCategories,
        ...resultProfile.threads
      )
    );
  }

  return { profile: resultProfile, implementationFilters, transformStacks };
}

/**
 * This is a small utility function that makes it easier to filter a thread
 * completely (both markers and samples).
 */
function filterThreadToRange(
  thread: Thread,
  rangeStart: number,
  rangeEnd: number
): Thread {
  thread = filterThreadSamplesToRange(thread, rangeStart, rangeEnd);
  thread.markers = filterRawMarkerTableToRange(
    thread.markers,
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
        // TODO: merge the subcategories too, and make a translationMap for
        // those (per category), too.
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

      const funcKey = [name, newResourceIndex].join('#');
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
      newFuncTable.lineNumber.push(funcTable.lineNumber[i]);
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
 */
function combineFrameTables(
  translationMapsForCategories: TranslationMapForCategories[],
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
    const categoryTranslationMap = translationMapsForCategories[threadIndex];

    for (let i = 0; i < frameTable.length; i++) {
      const addressIndex = frameTable.address[i];
      const address =
        typeof addressIndex === 'number' && addressIndex >= 0
          ? stringTable.getString(addressIndex)
          : null;
      const category = frameTable.category[i];
      const newCategory =
        category === null ? null : categoryTranslationMap.get(category);
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

      newFrameTable.address.push(
        address === null ? -1 : newStringTable.indexForString(address)
      );
      newFrameTable.category.push(newCategory);
      newFrameTable.func.push(newFunc);
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
 */
function combineStackTables(
  translationMapsForCategories: TranslationMapForCategories[],
  translationMapsForFrames: TranslationMapForFrames[],
  threads: $ReadOnlyArray<Thread>
): { stackTable: StackTable, translationMaps: TranslationMapForStacks[] } {
  const translationMaps = [];
  const newStackTable = getEmptyStackTable();

  threads.forEach((thread, threadIndex) => {
    const { stackTable } = thread;
    const translationMap = new Map();
    const frameTranslationMap = translationMapsForFrames[threadIndex];
    const categoryTranslationMap = translationMapsForCategories[threadIndex];

    for (let i = 0; i < stackTable.length; i++) {
      const newFrameIndex = frameTranslationMap.get(stackTable.frame[i]);
      if (newFrameIndex === undefined) {
        throw new Error(stripIndent`
          We couldn't find the frame of stack ${i} in the translation map.
          This is a programming error.
        `);
      }
      const newCategory = categoryTranslationMap.get(stackTable.category[i]);
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
  { samples: samples1 }: Thread,
  { samples: samples2 }: Thread
): { samples: SamplesTable, translationMaps: TranslationMapForSamples[] } {
  const translationMaps = [new Map(), new Map()];
  const newSamples = getEmptySamplesTable();

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
      newSamples.responsiveness.push(samples1.responsiveness[i]);
      newSamples.time.push(samples1.time[i]);
      // We add the first thread with a negative duration, because this is the
      // base profile.
      newSamples.duration.push(-samples1.duration[i]);

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
      newSamples.responsiveness.push(samples2.responsiveness[j]);
      newSamples.time.push(samples2.time[j]);
      newSamples.duration.push(samples2.duration[j]);

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

/**
 * This function will compute a diffing thread from 2 different threads, using
 * all the previous functions.
 */
function getComparisonThread(
  translationMapsForCategories: TranslationMapForCategories[],
  thread1: Thread,
  thread2: Thread
): Thread {
  const newStringTable = new UniqueStringArray();

  const threads = [thread1, thread2];

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
    thread1,
    thread2
  );

  const mergedThread = {
    processType: 'comparison',
    processStartupTime: Math.min(
      thread1.processStartupTime,
      thread2.processStartupTime
    ),
    processShutdownTime:
      Math.max(
        thread1.processShutdownTime || 0,
        thread2.processShutdownTime || 0
      ) || null,
    registerTime: Math.min(thread1.registerTime, thread2.registerTime),
    unregisterTime:
      Math.max(thread1.unregisterTime || 0, thread2.unregisterTime || 0) ||
      null,
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
