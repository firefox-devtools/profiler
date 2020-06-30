/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { UniqueStringArray } from '../utils/unique-string-array';
import {
  getEmptyExtensions,
  shallowCloneRawMarkerTable,
} from './data-structures';
import { removeURLs } from '../utils/string';
import {
  removeNetworkMarkerURLs,
  removePrefMarkerPreferenceValues,
  sanitizeFileIOMarkerFilenamePath,
  filterRawMarkerTableToRangeWithMarkersToDelete,
  sanitizeTextMarker,
} from './marker-data';
import { filterThreadSamplesToRange } from './profile-data';
import type {
  Profile,
  Thread,
  ThreadIndex,
  RemoveProfileInformation,
  StartEndRange,
} from 'firefox-profiler/types';

export type SanitizeProfileResult = {|
  +profile: Profile,
  +oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex> | null,
  +committedRanges: StartEndRange[] | null,
  +isSanitized: boolean,
|};

/**
 * Take a processed profile with PII that user wants to be removed and remove the
 * thread data depending on that PII status. Look at `RemoveProfileInformation`
 * type definition if you want to learn what kind of information we are removing.
 */
export function sanitizePII(
  profile: Profile,
  maybePIIToBeRemoved: RemoveProfileInformation | null
): SanitizeProfileResult {
  if (maybePIIToBeRemoved === null) {
    // Nothing is sanitized.
    return {
      profile,
      isSanitized: false,
      oldThreadIndexToNew: null,
      committedRanges: null,
    };
  }
  // Flow mistakenly thinks that PIIToBeRemoved could be null in the reduce functions
  // below, so instead re-bind it here.
  const PIIToBeRemoved = maybePIIToBeRemoved;
  const oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex> = new Map();

  let pages;
  if (profile.pages) {
    if (PIIToBeRemoved.shouldRemoveUrls) {
      pages = profile.pages.map((page, pageIndex) =>
        Object.assign({}, page, {
          url: removeURLs(page.url, true, `<Page #${pageIndex}>`),
        })
      );
    } else {
      pages = profile.pages;
    }
  } else {
    pages = undefined;
  }

  const newProfile = {
    ...profile,
    meta: {
      ...profile.meta,
      extensions: PIIToBeRemoved.shouldRemoveExtensions
        ? getEmptyExtensions()
        : profile.meta.extensions,
    },
    pages: pages,
    threads: profile.threads.reduce((acc, thread, threadIndex) => {
      const newThread: Thread | null = sanitizeThreadPII(
        thread,
        threadIndex,
        PIIToBeRemoved
      );

      // Filtering out the current thread if it's null.
      if (newThread !== null) {
        // Adding the thread to the `threads` list.
        oldThreadIndexToNew.set(threadIndex, acc.length);
        acc.push(newThread);
      }

      return acc;
    }, []),
    // Remove counters which belong to the removed counters.
    // Also adjust other counters to point to the right thread.
    counters: profile.counters
      ? profile.counters.reduce((acc, counter) => {
          const newThreadIndex = oldThreadIndexToNew.get(
            counter.mainThreadIndex
          );

          // Filtering out the counter if it's undefined.
          if (newThreadIndex !== undefined) {
            acc.push({
              ...counter,
              mainThreadIndex: newThreadIndex,
            });
          }

          return acc;
        }, [])
      : undefined,
    // Remove profilerOverhead which belong to the removed threads.
    // Also adjust other overheads to point to the right thread.
    profilerOverhead: profile.profilerOverhead
      ? profile.profilerOverhead.reduce((acc, overhead) => {
          const newThreadIndex = oldThreadIndexToNew.get(
            overhead.mainThreadIndex
          );

          // Filtering out the overhead if it's undefined.
          if (newThreadIndex !== undefined) {
            acc.push({
              ...overhead,
              mainThreadIndex: newThreadIndex,
            });
          }

          return acc;
        }, [])
      : undefined,
  };

  return {
    profile: newProfile,
    // Note that the profile was sanitized.
    isSanitized: true,
    // Provide a new empty committed range if needed.
    committedRanges: PIIToBeRemoved.shouldFilterToCommittedRange ? [] : null,
    // Only return the oldThreadIndexToNew if some threads are being removed. This
    // allows the UrlState to be dynamically updated.
    oldThreadIndexToNew:
      oldThreadIndexToNew.size === profile.threads.length
        ? null
        : oldThreadIndexToNew,
  };
}

/**
 * We want to protect users from unknowingly uploading sensitive data, however
 * this gets in the way of engineers profiling on nightly. For a compromise
 * between good data sanitization practices, and not dropping useful information,
 * do not sanitize on nightly and custom builds.
 */
export function getShouldSanitizeByDefault(profile: Profile): boolean {
  switch (profile.meta.updateChannel) {
    case 'default': // Custom builds.
    case 'nightly':
    case 'nightly-try':
    case 'nightly-autoland': // local build
      return false;
    default:
      return true;
  }
}
/**
 * Take a thread with PII that user wants to be removed and remove the thread
 * data depending on that PII status.
 */
function sanitizeThreadPII(
  thread: Thread,
  threadIndex: number,
  PIIToBeRemoved: RemoveProfileInformation
): Thread | null {
  if (PIIToBeRemoved.shouldRemoveThreads.has(threadIndex)) {
    // If this is a hidden thread, remove the thread immediately.
    // This will not remove the thread entry from the `threads` array right now
    // and just replace it with a `null` value. We filter out the null values
    // inside `serializeProfile` function.
    return null;
  }
  // Deep copying the thread since we are gonna mutate it and we don't want to alter
  // current thread.
  // We need to update the stringTable. It's not possible with UniqueStringArray.
  const stringArray = thread.stringTable.serializeToArray();
  let markerTable = shallowCloneRawMarkerTable(thread.markers);

  // We iterate all the markers and remove/change data depending on the PII
  // status.
  const markersToDelete = new Set();
  if (
    PIIToBeRemoved.shouldRemoveUrls ||
    PIIToBeRemoved.shouldRemovePreferenceValues ||
    PIIToBeRemoved.shouldRemoveThreadsWithScreenshots.size > 0
  ) {
    for (let i = 0; i < markerTable.length; i++) {
      const currentMarker = markerTable.data[i];

      // Remove the all the preference values, if the user wants that.
      if (
        PIIToBeRemoved.shouldRemovePreferenceValues &&
        currentMarker &&
        currentMarker.type &&
        currentMarker.type === 'PreferenceRead'
      ) {
        // Remove the preference value field from the marker payload.
        markerTable.data[i] = removePrefMarkerPreferenceValues(currentMarker);
      }

      // Remove the all network URLs if user wants to remove them.
      if (
        PIIToBeRemoved.shouldRemoveUrls &&
        currentMarker &&
        currentMarker.type &&
        currentMarker.type === 'Network'
      ) {
        // Remove the URI fields from marker payload.
        markerTable.data[i] = removeNetworkMarkerURLs(currentMarker);

        // Strip the URL from the marker name
        const stringIndex = markerTable.name[i];
        stringArray[stringIndex] = stringArray[stringIndex].replace(/:.*/, '');
      }

      // Remove the all OS paths from FileIO markers if user wants to remove them.
      if (
        PIIToBeRemoved.shouldRemoveUrls &&
        currentMarker &&
        currentMarker.type &&
        currentMarker.type === 'FileIO'
      ) {
        // Remove the filename path from marker payload.
        markerTable.data[i] = sanitizeFileIOMarkerFilenamePath(currentMarker);
      }

      if (
        PIIToBeRemoved.shouldRemoveUrls &&
        currentMarker &&
        currentMarker.type &&
        currentMarker.type === 'Text'
      ) {
        // Sanitize all the name fields of text markers in case they contain URLs.
        markerTable.data[i] = sanitizeTextMarker(currentMarker);
      }

      // Remove the screenshots if the current thread index is in the
      // threadsWithScreenshots array
      if (
        PIIToBeRemoved.shouldRemoveThreadsWithScreenshots.has(threadIndex) &&
        currentMarker &&
        currentMarker.type &&
        currentMarker.type === 'CompositorScreenshot'
      ) {
        const urlIndex = currentMarker.url;
        // We are mutating the stringArray here but it's okay to mutate since
        // we copied them at the beginning while converting the string table
        // to string array.
        stringArray[urlIndex] = '';
        markersToDelete.add(i);
      }
    }
  }

  // After iterating (or not iterating at all) the markers, if we have some
  // markers we want to delete or user wants to delete the full time range,
  // reconstruct the marker table and samples table without unwanted information.
  // Creating a new thread variable since we are gonna mutate samples here.
  let newThread: Thread;
  if (
    markersToDelete.size > 0 ||
    PIIToBeRemoved.shouldFilterToCommittedRange !== null
  ) {
    // Filter marker table with given range and marker indexes array.
    markerTable = filterRawMarkerTableToRangeWithMarkersToDelete(
      markerTable,
      markersToDelete,
      PIIToBeRemoved.shouldFilterToCommittedRange
    ).rawMarkerTable;

    // While we are here, we are also filterig the thread samples
    // to range.
    if (PIIToBeRemoved.shouldFilterToCommittedRange !== null) {
      const { start, end } = PIIToBeRemoved.shouldFilterToCommittedRange;
      newThread = filterThreadSamplesToRange(thread, start, end);
    } else {
      // Copying the thread even if we don't filter samples because we are gonna
      // change some fields later.
      newThread = { ...thread };
    }
  } else {
    // Copying the thread even if we don't filter samples because we are gonna
    // change some fields later.
    newThread = { ...thread };
  }

  // This is expensive but needs to be done somehow.
  // Maybe we can find something better here.
  if (PIIToBeRemoved.shouldRemoveUrls) {
    for (let i = 0; i < stringArray.length; i++) {
      stringArray[i] = removeURLs(stringArray[i]);
    }
  }

  // Remove the old stringTable and markerTable and replace it
  // with new updated ones.
  newThread.stringTable = new UniqueStringArray(stringArray);
  newThread.markers = markerTable;
  return newThread;
}
