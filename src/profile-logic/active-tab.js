/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getThreadSelectors } from '../selectors/per-thread';
import { getThreadsKey } from './profile-data';
import { ensureExists } from '../utils/flow';
import { StringTable } from '../utils/string-table';

import type {
  State,
  ThreadIndex,
  Profile,
  InnerWindowID,
  Page,
  RawThread,
  ScreenshotPayload,
  ActiveTabTimeline,
  ActiveTabMainTrack,
} from 'firefox-profiler/types';

/**
 * Checks whether the tab filtered thread is empty or not.
 * We take a look at the sample and marker data to determine that.
 */
function isTabFilteredThreadEmpty(
  threadIndex: ThreadIndex,
  state: State
): boolean {
  // Have to get the thread selectors to look if the thread is empty or not.
  const threadSelectors = getThreadSelectors(threadIndex);
  const tabFilteredThread = threadSelectors.getActiveTabFilteredThread(state);
  // Check the samples first to see if they are all empty or not.
  for (const stackIndex of tabFilteredThread.samples.stack) {
    if (stackIndex !== null) {
      // Samples are not empty. Do not hide that thread.
      // We don't have to look at the markers because samples are not empty.
      return false;
    }
  }

  const tabFilteredMarkers =
    threadSelectors.getActiveTabFilteredMarkerIndexesWithoutGlobals(state);
  if (tabFilteredMarkers.length > 0) {
    // Thread has some markers in it. Don't hide and skip to the next global track.
    return false;
  }

  return true;
}

/**
 * Take a profile and figure out what active tab GlobalTracks it contains.
 * The returned array should contain only one thread and screenshot tracks
 */
export function computeActiveTabTracks(
  profile: Profile,
  relevantPages: Page[],
  state: State
): ActiveTabTimeline {
  // Global tracks that are certainly global tracks.
  // FIXME: We should revert back to full view if we failed to find a track
  // index for the main track.
  const mainTrackIndexes = [];
  const resources = [];
  const screenshots = [];
  const topmostInnerWindowIDs = getTopmostInnerWindowIDs(relevantPages);
  const innerWindowIDToPageMap = _getInnerWindowIDToPageMap(relevantPages);
  const { stringArray } = profile.shared;
  const stringTable = StringTable.withBackingArray(stringArray);

  const screenshotNameIndex = stringTable.indexForString(
    'CompositorScreenshot'
  );

  for (
    let threadIndex = 0;
    threadIndex < profile.threads.length;
    threadIndex++
  ) {
    const thread = profile.threads[threadIndex];
    const { markers } = thread;

    if (thread.isMainThread) {
      // This is a main thread, there is a possibility that it can be a global
      // track, check if the thread contains active tab data and add it to candidates if it does.

      if (isTopmostThread(thread, topmostInnerWindowIDs)) {
        // This is a topmost thread, add it to global tracks.
        mainTrackIndexes.push(threadIndex);
      } else {
        if (!isTabFilteredThreadEmpty(threadIndex, state)) {
          const resourceName = _getActiveTabResourceName(
            thread,
            innerWindowIDToPageMap
          );
          if (resourceName !== null) {
            resources.push({
              type: 'sub-frame',
              threadIndex,
              name: resourceName,
            });
          }
        }
      }
    } else {
      // This is not a main thread, it's not possible that this can be a global
      // track. Find out if that thread contains the active tab data, and add it
      // as a resource track if it does.
      if (!isTabFilteredThreadEmpty(threadIndex, state)) {
        const resourceName = _getActiveTabResourceName(
          thread,
          innerWindowIDToPageMap
        );
        if (resourceName !== null) {
          resources.push({
            type: 'thread',
            threadIndex,
            name: resourceName,
          });
        }
      }
    }

    // Check for screenshots.
    const windowIDs: Set<string> = new Set();
    if (screenshotNameIndex !== -1) {
      for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
        if (markers.name[markerIndex] === screenshotNameIndex) {
          // Coerce the payload to a screenshot one. Don't do a runtime check that
          // this is correct.
          const data: ScreenshotPayload = (markers.data[markerIndex]: any);
          windowIDs.add(data.windowID);
        }
      }
      for (const id of windowIDs) {
        screenshots.push({ type: 'screenshots', id, threadIndex });
      }
    }
  }

  const mainTrackIndexesSet = new Set(mainTrackIndexes);
  const mainTrack: ActiveTabMainTrack = {
    type: 'tab',
    threadIndexes: mainTrackIndexesSet,
    threadsKey: getThreadsKey(mainTrackIndexesSet),
  };
  const resourcesThreadsKey = getThreadsKey(
    new Set(resources.map((resource) => resource.threadIndex))
  );

  return { mainTrack, screenshots, resources, resourcesThreadsKey };
}

/**
 * Gets the relevant pages and returns a set of InnerWindowIDs of topmost frames.
 */
function getTopmostInnerWindowIDs(relevantPages: Page[]): Set<InnerWindowID> {
  const topmostInnerWindowIDs = [];

  for (const page of relevantPages) {
    if (page.embedderInnerWindowID === 0) {
      topmostInnerWindowIDs.push(page.innerWindowID);
    }
  }

  return new Set(topmostInnerWindowIDs);
}

/**
 * Check if the thread is a topmost thread or not.
 * Topmost thread means the thread that belongs to the browser tab itself and not the iframe.
 */
function isTopmostThread(
  thread: RawThread,
  topmostInnerWindowIDs: Set<InnerWindowID>
): boolean {
  const { frameTable, markers } = thread;
  for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
    const innerWindowID = frameTable.innerWindowID[frameIndex];
    if (innerWindowID !== null && topmostInnerWindowIDs.has(innerWindowID)) {
      return true;
    }
  }

  for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
    const data = markers.data[markerIndex];
    if (
      data &&
      data.innerWindowID &&
      // Do not look at the network markers because they are not reliable. Some
      // network markers of an iframe comes from the parent frame. Therefore, their
      // innerWindowID will be the parent window's innerWindowID.
      data.type !== 'Network' &&
      topmostInnerWindowIDs.has(data.innerWindowID)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the name of active tab resource track.
 * It can be either a sub-frame or a regular thread.
 * If it fails to find a name, returns null.
 */
function _getActiveTabResourceName(
  thread: RawThread,
  innerWindowIDToPageMap: Map<InnerWindowID, Page>
): string | null {
  if (thread.isMainThread) {
    // This is a sub-frame.
    // Get the first innerWindowID inside the thread that's also present of innerWindowIDToPageMap.
    let firstInnerWindowID = ensureExists(thread.frameTable.innerWindowID).find(
      (innerWindowID) =>
        innerWindowID &&
        innerWindowID !== 0 &&
        innerWindowIDToPageMap.has(innerWindowID)
    );
    if (firstInnerWindowID === undefined || firstInnerWindowID === null) {
      const markerData = thread.markers.data.find((data) => {
        if (
          data &&
          data.innerWindowID &&
          data.innerWindowID !== 0 &&
          // Network markers are not reliable because they can point to their parent frame.
          data.type !== 'Network'
        ) {
          // about:blank and about:newtab pages are special and we are skipping if we
          // find them, so we can get the real resource name.
          const page = innerWindowIDToPageMap.get(data.innerWindowID);
          return (
            // During a page load, iframes usually start with an about:blank page
            // and then they navigate to the url. While it's in about:blank, we
            // might catch some markers. We would like to exclude them because
            // `about:blank` name doesn't bring any value as a resource name and
            // we would prefer to display the _real_ url instead which is
            // captured after the about:blank.
            // FIXME: I think we initially added `about:newtab` here to exclude
            // the "new tab page -> website" navigation from showing the
            // `about:newtab` all the time. But I don't think we have to worry
            // about this for iframes. So maybe remove this?
            page && page.url !== 'about:blank' && page.url !== 'about:newtab'
          );
        }
        return false;
      });
      if (markerData && markerData.innerWindowID) {
        firstInnerWindowID = markerData.innerWindowID;
      }
    }

    if (firstInnerWindowID === undefined || firstInnerWindowID === null) {
      // Since we excluded the about:blank and about:newtab pages, we might fail
      // to find a valid innerWindowID. This might happen when an ad blocker
      // blocks an iframe and therefore it fails to load. In that case, we
      // should return null.
      return null;
    }

    const page = ensureExists(innerWindowIDToPageMap.get(firstInnerWindowID));
    return page.url;
  }

  // This is a thread, return its name.
  return thread.name;
}

/**
 * Returns an InnerWindowID to Page map to easily access using InnerWindowIDs.
 */
function _getInnerWindowIDToPageMap(pages: Page[]): Map<InnerWindowID, Page> {
  const innerWindowIDToPageMap = new Map();
  for (const page of pages) {
    innerWindowIDToPageMap.set(page.innerWindowID, page);
  }
  return innerWindowIDToPageMap;
}
