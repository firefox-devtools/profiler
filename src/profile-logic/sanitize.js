/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { UniqueStringArray } from '../utils/unique-string-array';
import {
  getEmptyExtensions,
  shallowCloneRawMarkerTable,
  shallowCloneFuncTable,
} from './data-structures';
import { removeURLs } from '../utils/string';
import {
  removeNetworkMarkerURLs,
  removePrefMarkerPreferenceValues,
  sanitizeFileIOMarkerFilenamePath,
  filterRawMarkerTableToRangeWithMarkersToDelete,
  sanitizeExtensionTextMarker,
  sanitizeTextMarker,
} from './marker-data';
import { filterThreadSamplesToRange } from './profile-data';
import type {
  Profile,
  Thread,
  ThreadIndex,
  RemoveProfileInformation,
  StartEndRange,
  DerivedMarkerInfo,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
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
  derivedMarkerInfoForAllThreads: DerivedMarkerInfo[],
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

  const windowIdToBeSanitized = new Set();
  let pages = profile.pages;
  if (pages) {
    if (PIIToBeRemoved.shouldRemovePrivateBrowsingData) {
      // slicing here so that we can mutate it later.
      pages = pages.slice();

      for (let i = pages.length - 1; i >= 0; i--) {
        const page = pages[i];
        if (page.isPrivateBrowsing) {
          windowIdToBeSanitized.add(page.innerWindowID);
          pages.splice(i, 1);
        }
      }
    }

    if (PIIToBeRemoved.shouldRemoveUrls) {
      pages = pages.map((page, pageIndex) => ({
        ...page,
        url: removeURLs(page.url, `<Page #${pageIndex}>`),
      }));
    }
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
        derivedMarkerInfoForAllThreads[threadIndex],
        threadIndex,
        PIIToBeRemoved,
        windowIdToBeSanitized
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
 * this gets in the way of engineers profiling on nightly, or for profiles from
 * external tools. For a compromise between good data sanitization practices,
 * and not dropping useful information, only sanitize on release builds.
 */
export function getShouldSanitizeByDefault(profile: Profile): boolean {
  switch (profile.meta.updateChannel) {
    case 'esr':
    case 'release':
    case 'beta':
      return true;
    default:
      return false;
  }
}

/**
 * Take a thread with PII that user wants to be removed and remove the thread
 * data depending on that PII status.
 */
function sanitizeThreadPII(
  thread: Thread,
  derivedMarkerInfo: DerivedMarkerInfo,
  threadIndex: number,
  PIIToBeRemoved: RemoveProfileInformation,
  windowIdToBeSanitized: Set<number>
): Thread | null {
  if (PIIToBeRemoved.shouldRemoveThreads.has(threadIndex)) {
    // If this is a hidden thread, remove the thread immediately.
    // This will not remove the thread entry from the `threads` array right now
    // and just replace it with a `null` value. We filter out the null values
    // inside `serializeProfile` function.
    return null;
  }

  if (
    PIIToBeRemoved.shouldRemovePrivateBrowsingData &&
    thread.isPrivateBrowsing
  ) {
    // This thread contains only private browsing data and the user wants that
    // we remove it.
    return null;
  }

  // We need to update the stringTable. It's not possible with UniqueStringArray.
  const stringArray = thread.stringTable.serializeToArray();
  let markerTable = shallowCloneRawMarkerTable(thread.markers);

  // We iterate all the markers and remove/change data depending on the PII
  // status.
  const markersToDelete = new Set();
  if (
    PIIToBeRemoved.shouldRemoveUrls ||
    PIIToBeRemoved.shouldRemovePreferenceValues ||
    PIIToBeRemoved.shouldRemoveExtensions ||
    PIIToBeRemoved.shouldRemoveThreadsWithScreenshots.size > 0 ||
    PIIToBeRemoved.shouldRemovePrivateBrowsingData
  ) {
    for (let i = 0; i < markerTable.length; i++) {
      let currentMarker = markerTable.data[i];

      // Remove the all the preference values, if the user wants that.
      if (
        PIIToBeRemoved.shouldRemovePreferenceValues &&
        currentMarker &&
        currentMarker.type === 'PreferenceRead'
      ) {
        // Remove the preference value field from the marker payload.
        markerTable.data[i] = removePrefMarkerPreferenceValues(currentMarker);
      }

      // Remove the all network URLs if user wants to remove them.
      if (
        PIIToBeRemoved.shouldRemoveUrls &&
        currentMarker &&
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
        currentMarker.type === 'FileIO'
      ) {
        // Remove the filename path from marker payload.
        markerTable.data[i] = sanitizeFileIOMarkerFilenamePath(currentMarker);
      }

      if (
        PIIToBeRemoved.shouldRemoveUrls &&
        currentMarker &&
        currentMarker.type === 'Text'
      ) {
        // Sanitize all the name fields of text markers in case they contain URLs.
        markerTable.data[i] = sanitizeTextMarker(currentMarker);
        // Re-assign the value of currentMarker as the marker may be
        // sanitized again to remove extension ids.
        currentMarker = markerTable.data[i];
      }

      if (
        PIIToBeRemoved.shouldRemoveExtensions &&
        currentMarker &&
        currentMarker.type === 'Text'
      ) {
        const markerName = stringArray[markerTable.name[i]];
        // Sanitize extension ids out of known extension markers.
        markerTable.data[i] = sanitizeExtensionTextMarker(
          markerName,
          currentMarker
        );
      }

      // Remove the screenshots if the current thread index is in the
      // threadsWithScreenshots array
      if (
        PIIToBeRemoved.shouldRemoveThreadsWithScreenshots.has(threadIndex) &&
        currentMarker &&
        currentMarker.type === 'CompositorScreenshot'
      ) {
        const urlIndex = currentMarker.url;
        // We are mutating the stringArray here but it's okay to mutate since
        // we copied them at the beginning while converting the string table
        // to string array.
        stringArray[urlIndex] = '';
        markersToDelete.add(i);
      }

      if (PIIToBeRemoved.shouldRemovePrivateBrowsingData) {
        if (
          currentMarker &&
          currentMarker.type === 'Network' &&
          currentMarker.isPrivateBrowsing
        ) {
          // Remove network requests coming from private browsing sessions
          markersToDelete.add(i);
        }

        if (
          currentMarker &&
          currentMarker.innerWindowID &&
          windowIdToBeSanitized.has(currentMarker.innerWindowID)
        ) {
          // Remove any marker that we know they come from private browsing sessions
          markersToDelete.add(i);
        }
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
      derivedMarkerInfo,
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

  if (PIIToBeRemoved.shouldRemoveUrls && newThread['eTLD+1']) {
    // Remove the domain name of the isolated content process if it's provided
    // from the back-end.
    delete newThread['eTLD+1'];
  }

  if (
    PIIToBeRemoved.shouldRemovePrivateBrowsingData &&
    windowIdToBeSanitized.size > 0
  ) {
    // In this block, we'll remove everything related to frame table entries
    // that have the isPrivateBrowsing flag.

    // This map holds the information about the frame indexes that should be
    // sanitized, with their functions as a key, so that we can easily change
    // all frames if we need to.
    const sanitizedFuncIndexesToFrameIndex: Map<
      IndexIntoFuncTable,
      IndexIntoFrameTable[]
    > = new Map();
    // This set holds all func indexes that shouldn't be sanitized. This will be
    // intersected with the previous map's keys to know which functions need to
    // be split in 2.
    const funcIndexesToBeKept = new Set();

    const { frameTable, funcTable, resourceTable } = newThread;
    for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
      const innerWindowId = frameTable.innerWindowID[frameIndex];
      const funcIndex = frameTable.func[frameIndex];
      if (innerWindowId !== null && windowIdToBeSanitized.has(innerWindowId)) {
        // The function pointed by this frame should be sanitized.
        let sanitizedFrameIndexes =
          sanitizedFuncIndexesToFrameIndex.get(funcIndex);
        if (!sanitizedFrameIndexes) {
          sanitizedFrameIndexes = [];
          sanitizedFuncIndexesToFrameIndex.set(
            funcIndex,
            sanitizedFrameIndexes
          );
        }
        sanitizedFrameIndexes.push(frameIndex);
      } else {
        // The function pointed by this frame should be kept.
        funcIndexesToBeKept.add(funcIndex);
      }
    }

    if (sanitizedFuncIndexesToFrameIndex.size) {
      const resourcesToBeSanitized = new Set();

      const newFuncTable = (newThread.funcTable =
        shallowCloneFuncTable(funcTable));
      const newFrameTable = (newThread.frameTable = {
        ...frameTable,
        innerWindowID: frameTable.innerWindowID.slice(),
        func: frameTable.func.slice(),
        line: frameTable.line.slice(),
        column: frameTable.column.slice(),
      });

      for (const [
        funcIndex,
        frameIndexes,
      ] of sanitizedFuncIndexesToFrameIndex.entries()) {
        if (funcIndexesToBeKept.has(funcIndex)) {
          // This function is used by both private and non-private data, therefore
          // we split this function into 2 sanitized and unsanitized functions.
          const sanitizedFuncIndex = newFuncTable.length;
          newFuncTable.name.push(stringArray.length);
          stringArray.push(`<Func #${sanitizedFuncIndex}>`);
          newFuncTable.isJS.push(funcTable.isJS[funcIndex]);
          newFuncTable.relevantForJS.push(funcTable.isJS[funcIndex]);
          newFuncTable.resource.push(-1);
          newFuncTable.fileName.push(null);
          newFuncTable.lineNumber.push(null);
          newFuncTable.columnNumber.push(null);
          newFuncTable.length++;

          frameIndexes.forEach(
            (frameIndex) =>
              (newFrameTable.func[frameIndex] = sanitizedFuncIndex)
          );
        } else {
          // This function is used only by private data, so we can change it
          // directly.
          newFuncTable.name[funcIndex] = stringArray.length;
          stringArray.push(`<Func #${funcIndex}>`);

          newFuncTable.fileName[funcIndex] = null;
          if (newFuncTable.resource[funcIndex] >= 0) {
            resourcesToBeSanitized.add(newFuncTable.resource[funcIndex]);
          }
          newFuncTable.resource[funcIndex] = -1;
          newFuncTable.lineNumber[funcIndex] = null;
          newFuncTable.columnNumber[funcIndex] = null;
        }

        // In both cases, nullify some information in all frames.
        frameIndexes.forEach((frameIndex) => {
          newFrameTable.line[frameIndex] = null;
          newFrameTable.column[frameIndex] = null;
          newFrameTable.innerWindowID[frameIndex] = null;
        });
      }

      if (resourcesToBeSanitized.size) {
        const newResourceTable = (newThread.resourceTable = {
          ...resourceTable,
          lib: resourceTable.lib.slice(),
          name: resourceTable.name.slice(),
          host: resourceTable.host.slice(),
        });
        const remainingResources = new Set(newFuncTable.resource);
        for (const resourceIndex of resourcesToBeSanitized) {
          if (!remainingResources.has(resourceIndex)) {
            // This resource was used only by sanitized functions. Sanitize it
            // as well.
            newResourceTable.name[resourceIndex] = stringArray.length;
            stringArray.push(`<Resource #${resourceIndex}>`);
            newResourceTable.lib[resourceIndex] = undefined;
            newResourceTable.host[resourceIndex] = undefined;
          }
        }
      }
    }
  }

  // Remove the old stringTable and markerTable and replace it
  // with new updated ones.
  newThread.stringTable = new UniqueStringArray(stringArray);
  newThread.markers = markerTable;
  return newThread;
}
