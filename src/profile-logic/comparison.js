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
import { getEmptyProfile } from './data-structures';
import {
  filterThreadSamplesToRange,
  getTimeRangeForThread,
  getTimeRangeIncludingAllThreads,
} from './profile-data';
import { filterRawMarkerTableToRange } from './marker-data';

import type {
  Profile,
  Thread,
  IndexIntoCategoryList,
  CategoryList,
} from '../types/profile';
import type { UrlState } from '../types/state';
import type { ImplementationFilter } from '../types/actions';
import type { TransformStacksPerThread } from '../types/transforms';

export function mergeProfiles(
  profiles: Profile[],
  profileStates: UrlState[]
): {|
  profile: Profile,
  transformStacks: TransformStacksPerThread,
  implementationFilters: ImplementationFilter[],
|} {
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

  return { profile: resultProfile, implementationFilters, transformStacks };
}

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
