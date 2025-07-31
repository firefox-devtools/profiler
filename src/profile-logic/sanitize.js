/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import {
  getEmptyExtensions,
  shallowCloneRawMarkerTable,
  shallowCloneFuncTable,
} from './data-structures';
import { computeCompactedProfile } from './profile-compacting';
import { StringTable } from '../utils/string-table';
import { removeURLs } from '../utils/string';
import {
  removeNetworkMarkerURLs,
  removePrefMarkerPreferenceValues,
  filterRawMarkerTableToRangeWithMarkersToDelete,
  sanitizeExtensionTextMarker,
  sanitizeTextMarker,
  sanitizeFromMarkerSchema,
} from './marker-data';
import { getSchemaFromMarker } from './marker-schema';
import {
  filterRawThreadSamplesToRange,
  filterCounterSamplesToRange,
} from './profile-data';
import type {
  Profile,
  RawThread,
  ThreadIndex,
  RemoveProfileInformation,
  StartEndRange,
  DerivedMarkerInfo,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
  InnerWindowID,
  MarkerSchemaByName,
  RawCounter,
} from 'firefox-profiler/types';

export type SanitizeProfileResult = {
  +profile: Profile,
  +oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex> | null,
  +committedRanges: StartEndRange[] | null,
  +isSanitized: boolean,
};

/**
 * Take a processed profile with PII that user wants to be removed and remove the
 * thread data depending on that PII status. Look at `RemoveProfileInformation`
 * type definition if you want to learn what kind of information we are removing.
 */
export function sanitizePII(
  profile: Profile,
  derivedMarkerInfoForAllThreads: DerivedMarkerInfo[],
  maybePIIToBeRemoved: RemoveProfileInformation | null,
  markerSchemaByName: MarkerSchemaByName
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

  // This set keeps the ids to be removed when removing private browsing data.
  const windowIdFromPrivateBrowsing = new Set();

  let pages = profile.pages;
  if (pages) {
    if (PIIToBeRemoved.shouldRemovePrivateBrowsingData) {
      // slicing here so that we can mutate it later.
      pages = pages.slice();

      for (let i = pages.length - 1; i >= 0; i--) {
        const page = pages[i];

        let removePageEntry = false;
        if (
          PIIToBeRemoved.shouldRemovePrivateBrowsingData &&
          page.isPrivateBrowsing
        ) {
          // This page is removed if private browsing data should be removed and
          // it's coming from private browsing.
          windowIdFromPrivateBrowsing.add(page.innerWindowID);
          removePageEntry = true;
        }

        if (removePageEntry) {
          pages.splice(i, 1);
        }
      }
    }

    if (PIIToBeRemoved.shouldRemoveUrls) {
      pages = pages.map((page, pageIndex) => ({
        ...page,
        url: removeURLs(page.url, `<Page #${pageIndex}>`),
        // Remove the favicon data as it could reveal the url.
        favicon: null,
      }));
    }
  }

  let stringArray = profile.shared.stringArray;
  if (PIIToBeRemoved.shouldRemoveUrls) {
    // This is expensive but needs to be done somehow.
    // Maybe we can find something better here.
    stringArray = stringArray.map((s) => removeURLs(s));
  }
  const stringTable = StringTable.withBackingArray(stringArray);

  let removingCounters = false;
  const newProfile: Profile = {
    ...profile,
    meta: {
      ...profile.meta,
      extensions: PIIToBeRemoved.shouldRemoveExtensions
        ? getEmptyExtensions()
        : profile.meta.extensions,
    },
    pages: pages,
    shared: {
      stringArray,
    },
    threads: profile.threads.reduce((acc, thread, threadIndex) => {
      const newThread: RawThread | null = sanitizeThreadPII(
        thread,
        stringTable,
        derivedMarkerInfoForAllThreads[threadIndex],
        threadIndex,
        PIIToBeRemoved,
        windowIdFromPrivateBrowsing,
        markerSchemaByName
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
      ? profile.counters.reduce((acc, counter, counterIndex) => {
          if (PIIToBeRemoved.shouldRemoveCounters.has(counterIndex)) {
            removingCounters = true;
            return acc;
          }

          const newCounter: RawCounter | null = sanitizeCounterPII(
            counter,
            PIIToBeRemoved,
            oldThreadIndexToNew
          );

          // Filter out the counter completely if its thread has been removed.
          if (newCounter !== null) {
            acc.push(newCounter);
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

  if (PIIToBeRemoved.shouldFilterToCommittedRange !== null) {
    const { start, end } = PIIToBeRemoved.shouldFilterToCommittedRange;
    newProfile.meta.profilingStartTime = start;
    newProfile.meta.profilingEndTime = end;
  }

  return {
    profile: computeCompactedProfile(newProfile).profile,
    // Note that the profile was sanitized.
    isSanitized: true,
    // Provide a new empty committed range if needed.
    committedRanges: PIIToBeRemoved.shouldFilterToCommittedRange ? [] : null,
    // Only return the oldThreadIndexToNew if some tracks are being removed. This
    // allows the UrlState to be dynamically updated.
    oldThreadIndexToNew:
      oldThreadIndexToNew.size === profile.threads.length && !removingCounters
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
  thread: RawThread,
  stringTable: StringTable,
  derivedMarkerInfo: DerivedMarkerInfo,
  threadIndex: number,
  PIIToBeRemoved: RemoveProfileInformation,
  windowIdFromPrivateBrowsing: Set<InnerWindowID>,
  markerSchemaByName: MarkerSchemaByName
): RawThread | null {
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

      if (currentMarker && PIIToBeRemoved.shouldRemoveUrls) {
        // Use the schema to find some properties that need to be sanitized.
        const markerSchema = getSchemaFromMarker(
          markerSchemaByName,
          currentMarker
        );
        if (markerSchema) {
          currentMarker = markerTable.data[i] = sanitizeFromMarkerSchema(
            markerSchema,
            currentMarker
          );
        }

        // Remove the network URLs if user wants to remove them.
        if (currentMarker.type === 'Network') {
          // Remove the URI fields from marker payload.
          markerTable.data[i] = removeNetworkMarkerURLs(currentMarker);

          // Strip the URL from the marker name
          const requestStr = stringTable.getString(markerTable.name[i]);
          const sanitizedRequestStr = requestStr.replace(/:.*/, '');
          markerTable.name[i] = stringTable.indexForString(sanitizedRequestStr);
        }

        if (currentMarker.type === 'Text') {
          // Sanitize all the name fields of text markers in case they contain URLs.
          markerTable.data[i] = sanitizeTextMarker(currentMarker);
          // Re-assign the value of currentMarker as the marker may be
          // sanitized again to remove extension ids.
          currentMarker = markerTable.data[i];
        }
      }

      if (
        PIIToBeRemoved.shouldRemoveExtensions &&
        currentMarker &&
        currentMarker.type === 'Text'
      ) {
        const markerName = stringTable.getString(markerTable.name[i]);
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
          windowIdFromPrivateBrowsing.has(currentMarker.innerWindowID)
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
  let newThread: RawThread;
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

    // While we are here, we are also filtering the thread samples
    // to range.
    if (PIIToBeRemoved.shouldFilterToCommittedRange !== null) {
      const { start, end } = PIIToBeRemoved.shouldFilterToCommittedRange;
      if (
        thread.registerTime > end ||
        (thread.unregisterTime && thread.unregisterTime < start)
      ) {
        return null;
      }
      newThread = filterRawThreadSamplesToRange(thread, start, end);
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

  if (PIIToBeRemoved.shouldRemoveUrls && newThread['eTLD+1']) {
    // Remove the domain name of the isolated content process if it's provided
    // from the back-end.
    delete newThread['eTLD+1'];
  }

  if (windowIdFromPrivateBrowsing.size > 0) {
    // In this block, we'll remove everything related to frame table entries
    // that have a innerWindowID with a isPrivateBrowsing flag.

    // This map holds the information about the frame indexes that should be
    // sanitized, with their functions as a key, so that we can easily change
    // all frames if we need to.
    const sanitizedFuncIndexesToFrameIndex: Map<
      IndexIntoFuncTable,
      IndexIntoFrameTable[],
    > = new Map();
    // This set holds all func indexes that shouldn't be sanitized. This will be
    // intersected with the previous map's keys to know which functions need to
    // be split in 2.
    const funcIndexesToBeKept = new Set();

    const { frameTable, funcTable, resourceTable, stackTable, samples } =
      newThread;
    for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
      const innerWindowID = frameTable.innerWindowID[frameIndex];
      const funcIndex = frameTable.func[frameIndex];

      const isPrivateBrowsing =
        innerWindowID && windowIdFromPrivateBrowsing.has(innerWindowID);
      if (isPrivateBrowsing) {
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
          const name = stringTable.indexForString(
            `<Func #${sanitizedFuncIndex}>`
          );
          newFuncTable.name.push(name);
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
          const name = stringTable.indexForString(`<Func #${funcIndex}>`);
          newFuncTable.name[funcIndex] = name;

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
            const name = stringTable.indexForString(
              `<Resource #${resourceIndex}>`
            );
            newResourceTable.name[resourceIndex] = name;
            newResourceTable.lib[resourceIndex] = null;
            newResourceTable.host[resourceIndex] = null;
          }
        }
      }
    }

    // Now we'll remove samples related to the frames
    const newSamples = (newThread.samples = {
      ...samples,
      stack: samples.stack.slice(),
    });

    // First we'll loop the stack table and populate a typed array with a value
    // that is a flag that's inherited by children. This is possible because
    // when iterating we visit parents before their children.
    // There can be 3 values:
    // - 0 is neutral, this means this stack isn't private browsing and isn't
    //   the tab id we want to keep.
    // - 1 means that this stack comes from private browsing.
    // They won't be set if the related sanitization isn't set in PIIToBeRemoved.
    const stackFlags = new Uint8Array(stackTable.length);

    // Some constants to make it easier to read.
    const PRIVATE_BROWSING_STACK = 1;

    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefix = stackTable.prefix[stackIndex];
      if (prefix !== null) {
        // Inherit the prefix value
        stackFlags[stackIndex] = stackFlags[prefix];
        if (stackFlags[stackIndex] === PRIVATE_BROWSING_STACK) {
          // Because private browsing is the strongest value, we can skip
          // the rest of the processing.
          continue;
        }
      }

      const frameIndex = stackTable.frame[stackIndex];
      const innerWindowID = frameTable.innerWindowID[frameIndex];
      if (!innerWindowID) {
        continue;
      }

      const isPrivateBrowsing = windowIdFromPrivateBrowsing.has(innerWindowID);
      if (isPrivateBrowsing) {
        stackFlags[stackIndex] = PRIVATE_BROWSING_STACK;
      }
    }

    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      const stackIndex = samples.stack[sampleIndex];
      if (stackIndex === null) {
        continue;
      }

      const stackFlag = stackFlags[stackIndex];
      if (stackFlag === PRIVATE_BROWSING_STACK) {
        newSamples.stack[sampleIndex] = null;
        continue;
      }
    }
  }

  // Remove the old markerTable and replace it with the new updated one.
  newThread.markers = markerTable;

  // Have we removed everything from this thread?
  if (isThreadNonEmpty(newThread) || !isThreadNonEmpty(thread)) {
    return newThread;
  }

  // Otherwise, return null.
  return null;
}

// This returns true if the thread has at least a samples or a marker.
function isThreadNonEmpty(thread: RawThread): boolean {
  const hasMarkers = thread.markers.length > 0;
  if (hasMarkers) {
    // Return early so that we don't need to loop over samples.
    return true;
  }

  const hasSamples = thread.samples.stack.some(
    (stackIndex) => stackIndex !== null
  );

  return hasSamples;
}

/**
 * Sanitize the counter PII.
 *
 * - If the thread that the counter belongs to is removed, then remove the
 *   counter as well.
 * - If the time range is sanitized, then filter the counter samples to the
 *   sanitized time range.
 * - Update the thread index with the new thread index.
 */
function sanitizeCounterPII(
  counter: RawCounter,
  PIIToBeRemoved: RemoveProfileInformation,
  oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex>
): RawCounter | null {
  const newThreadIndex = oldThreadIndexToNew.get(counter.mainThreadIndex);
  if (newThreadIndex === undefined) {
    // Remove the counter completely if the thread that it belongs to is sanitized as well.
    return null;
  }

  // Sanitize the counter if the time range should be sanitized.
  let newCounter = counter;
  if (PIIToBeRemoved.shouldFilterToCommittedRange !== null) {
    const { start, end } = PIIToBeRemoved.shouldFilterToCommittedRange;
    newCounter = filterCounterSamplesToRange(newCounter, start, end);
  }

  return {
    ...newCounter,
    // Update the main thread index with the new thread index.
    mainThreadIndex: newThreadIndex,
  };
}
