/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';
import queryString from 'query-string';
import {
  processGeckoProfile,
  unserializeProfileOfArbitraryFormat,
} from 'firefox-profiler/profile-logic/process-profile';
import { SymbolStore } from 'firefox-profiler/profile-logic/symbol-store';
import {
  symbolicateProfile,
  applySymbolicationStep,
} from 'firefox-profiler/profile-logic/symbolication';
import * as MozillaSymbolicationAPI from 'firefox-profiler/profile-logic/mozilla-symbolication-api';
import { mergeProfilesForDiffing } from 'firefox-profiler/profile-logic/merge-compare';
import { decompress } from 'firefox-profiler/utils/gz';
import { expandUrl } from 'firefox-profiler/utils/shorten-url';
import { TemporaryError } from 'firefox-profiler/utils/errors';
import JSZip from 'jszip';
import {
  getSelectedThreadIndexesOrNull,
  getGlobalTrackOrder,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getLocalTrackOrderByPid,
  getLegacyThreadOrder,
  getLegacyHiddenThreads,
  getTimelineTrackOrganization,
  getProfileOrNull,
  getProfile,
  getView,
  getRelevantPagesForActiveTab,
} from 'firefox-profiler/selectors';
import {
  withHistoryReplaceStateAsync,
  stateFromLocation,
  ensureIsValidDataSource,
} from 'firefox-profiler/app-logic/url-handling';
import {
  initializeLocalTrackOrderByPid,
  initializeHiddenLocalTracksByPid,
  computeLocalTracksByPid,
  computeGlobalTracks,
  initializeGlobalTrackOrder,
  initializeSelectedThreadIndex,
  initializeHiddenGlobalTracks,
  getVisibleThreads,
} from 'firefox-profiler/profile-logic/tracks';
import { computeActiveTabTracks } from 'firefox-profiler/profile-logic/active-tab';
import { setDataSource } from './profile-view';
import { fatalError } from './errors';
import { GOOGLE_STORAGE_BUCKET } from 'firefox-profiler/app-logic/constants';

import type {
  RequestedLib,
  ImplementationFilter,
  TransformStacksPerThread,
  Action,
  ThunkAction,
  Dispatch,
  TimelineTrackOrganization,
  Profile,
  ThreadIndex,
  BrowsingContextID,
  Page,
  InnerWindowID,
  Pid,
  OriginsTimelineRoot,
} from 'firefox-profiler/types';

import type { SymbolicationStepInfo } from 'firefox-profiler/profile-logic/symbolication';
import {
  assertExhaustiveCheck,
  ensureExists,
} from 'firefox-profiler/utils/flow';

/**
 * This file collects all the actions that are used for receiving the profile in the
 * client and getting it into the processed format.
 */

export function triggerLoadingFromUrl(profileUrl: string): Action {
  return {
    type: 'TRIGGER_LOADING_FROM_URL',
    profileUrl,
  };
}

export function waitingForProfileFromAddon(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_ADDON',
  };
}

/**
 * Call this function once the profile has been fetched and pre-processed from whatever
 * source (url, addon, file, etc).
 */
export function loadProfile(
  profile: Profile,
  config: $Shape<{|
    timelineTrackOrganization: TimelineTrackOrganization,
    pathInZipFile: string,
    implementationFilter: ImplementationFilter,
    transformStacks: TransformStacksPerThread,
    geckoProfiler: $GeckoProfiler,
    skipSymbolication: boolean, // Please use this in tests only.
  |}> = {},
  initialLoad: boolean = false
): ThunkAction<Promise<void>> {
  return async dispatch => {
    if (profile.threads.length === 0) {
      console.error('This profile has no threads.', profile);
      dispatch(
        fatalError(
          new Error(
            'No threads were captured in this profile, there is nothing to display.'
          )
        )
      );
      return;
    }

    // We have a 'PROFILE_LOADED' dispatch here and a second dispatch for
    // `finalizeProfileView`. Normally this is an anti-pattern but that was
    // necessary for initial load url handling. We are not dispatching
    // `finalizeProfileView` here if it's initial load, instead are getting the
    // url, upgrading the url and then creating a UrlState that we can use
    // first. That is necessary because we need a UrlState inside `finalizeProfileView`.
    // If this is not the initial load, we are dispatching both of them.
    dispatch({
      type: 'PROFILE_LOADED',
      profile,
      pathInZipFile: config.pathInZipFile,
      implementationFilter: config.implementationFilter,
      transformStacks: config.transformStacks,
    });

    // During initial load, we are upgrading the URL and generating the UrlState
    // before finalizing profile view. That's why we are dispatching this action
    // after completing those steps inside `setupInitialUrlState`.
    if (initialLoad === false) {
      await dispatch(
        finalizeProfileView(
          config.geckoProfiler,
          config.timelineTrackOrganization,
          config.skipSymbolication
        )
      );
    }
  };
}

/**
 * This function will take the view information from the URL, such as hiding and sorting
 * information, and it will validate it against the profile. If there is no pre-existing
 * view information, this function will compute the defaults. There is a decent amount of
 * complexity to making all of these decisions, which has been collected in a bunch of
 * functions in the src/profile-logic/tracks.js file.
 *
 * Note: skipSymbolication is used in tests only, this is enforced.
 */
export function finalizeProfileView(
  geckoProfiler?: $GeckoProfiler,
  timelineTrackOrganization?: TimelineTrackOrganization,
  skipSymbolication?: boolean
): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    if (skipSymbolication && process.env.NODE_ENV !== 'test') {
      throw new Error('Please do not use skipSymbolication outside of tests');
    }

    const profile = getProfileOrNull(getState());
    if (profile === null || getView(getState()).phase !== 'PROFILE_LOADED') {
      // Profile load was not successful. Do not continue.
      return;
    }

    // The selectedThreadIndex is only null for new profiles that haven't
    // been seen before. If it's non-null, then there is profile view information
    // encoded into the URL.
    const selectedThreadIndexes = getSelectedThreadIndexesOrNull(getState());
    const pages = profile.pages;
    if (!timelineTrackOrganization) {
      // Most likely we'll need to load the timeline track organization, as requested
      // by the URL, but tests can pass in a value.
      timelineTrackOrganization = getTimelineTrackOrganization(getState());
    }

    switch (timelineTrackOrganization.type) {
      case 'full':
        // The url state says this is a full view. We should compute and initialize
        // the state relevant to that state.
        dispatch(finalizeFullProfileView(profile, selectedThreadIndexes));
        break;
      case 'active-tab':
        if (pages) {
          dispatch(
            finalizeActiveTabProfileView(
              profile,
              selectedThreadIndexes,
              timelineTrackOrganization.browsingContextID
            )
          );
        } else {
          // Don't fully trust the URL, this view doesn't support the active tab based
          // view. Switch to fulll view.
          dispatch(finalizeFullProfileView(profile, selectedThreadIndexes));
        }

        break;
      case 'origins': {
        if (pages) {
          dispatch(
            finalizeOriginProfileView(profile, pages, selectedThreadIndexes)
          );
        } else {
          // Don't fully trust the URL, this view doesn't support the origins based
          // view. Switch to fulll view.
          dispatch(finalizeFullProfileView(profile, selectedThreadIndexes));
        }
        break;
      }
      default:
        throw assertExhaustiveCheck(
          timelineTrackOrganization,
          `Unhandled TimelineTrackOrganization type.`
        );
    }

    // Note we kick off symbolication only for the profiles we know for sure
    // that they weren't symbolicated.
    // We can skip the symbolication in tests if needed.
    if (!skipSymbolication && profile.meta.symbolicated === false) {
      const symbolStore = getSymbolStore(dispatch, geckoProfiler);
      if (symbolStore) {
        // Only symbolicate if a symbol store is available. In tests we may not
        // have access to IndexedDB.
        await doSymbolicateProfile(dispatch, profile, symbolStore);
      }
    }
  };
}

/**
 * Finalize the profile state for full view.
 * This function will take the view information from the URL, such as hiding and sorting
 * information, and it will validate it against the profile. If there is no pre-existing
 * view information, this function will compute the defaults.
 */
export function finalizeFullProfileView(
  profile: Profile,
  selectedThreadIndexes: Set<ThreadIndex> | null
): ThunkAction<void> {
  return (dispatch, getState) => {
    const hasUrlInfo = selectedThreadIndexes !== null;

    const globalTracks = computeGlobalTracks(profile);
    const globalTrackOrder = initializeGlobalTrackOrder(
      globalTracks,
      hasUrlInfo ? getGlobalTrackOrder(getState()) : null,
      getLegacyThreadOrder(getState())
    );
    let hiddenGlobalTracks = initializeHiddenGlobalTracks(
      globalTracks,
      profile,
      globalTrackOrder,
      hasUrlInfo ? getHiddenGlobalTracks(getState()) : null,
      getLegacyHiddenThreads(getState())
    );
    const localTracksByPid = computeLocalTracksByPid(profile);
    const localTrackOrderByPid = initializeLocalTrackOrderByPid(
      hasUrlInfo ? getLocalTrackOrderByPid(getState()) : null,
      localTracksByPid,
      getLegacyThreadOrder(getState())
    );
    let hiddenLocalTracksByPid = initializeHiddenLocalTracksByPid(
      hasUrlInfo ? getHiddenLocalTracksByPid(getState()) : null,
      localTracksByPid,
      profile,
      getLegacyHiddenThreads(getState())
    );
    let visibleThreadIndexes = getVisibleThreads(
      globalTracks,
      hiddenGlobalTracks,
      localTracksByPid,
      hiddenLocalTracksByPid
    );

    // This validity check can't be extracted into a separate function, as it needs
    // to update a lot of the local variables in this function.
    if (visibleThreadIndexes.length === 0) {
      // All threads are hidden, since this can't happen normally, revert them all.
      visibleThreadIndexes = profile.threads.map(
        (_, threadIndex) => threadIndex
      );
      hiddenGlobalTracks = new Set();
      const newHiddenTracksByPid = new Map();
      for (const [pid] of hiddenLocalTracksByPid) {
        newHiddenTracksByPid.set(pid, new Set());
      }
      hiddenLocalTracksByPid = newHiddenTracksByPid;
    }

    selectedThreadIndexes = initializeSelectedThreadIndex(
      selectedThreadIndexes,
      visibleThreadIndexes,
      profile
    );

    // If all of the local tracks were hidden for a process, and the main thread was
    // not recorded for that process, hide the (empty) process track as well.
    for (const [pid, localTracks] of localTracksByPid) {
      const hiddenLocalTracks = hiddenLocalTracksByPid.get(pid);
      if (!hiddenLocalTracks) {
        continue;
      }
      if (hiddenLocalTracks.size === localTracks.length) {
        // All of the local tracks were hidden.
        const globalTrackIndex = globalTracks.findIndex(
          globalTrack =>
            globalTrack.type === 'process' &&
            globalTrack.pid === pid &&
            globalTrack.mainThreadIndex === null
        );
        if (globalTrackIndex !== -1) {
          // An empty global track was found, hide it.
          hiddenGlobalTracks.add(globalTrackIndex);
        }
      }
    }

    dispatch({
      type: 'VIEW_FULL_PROFILE',
      selectedThreadIndexes,
      globalTracks,
      globalTrackOrder,
      hiddenGlobalTracks,
      localTracksByPid,
      hiddenLocalTracksByPid,
      localTrackOrderByPid,
    });
  };
}

/**
 * This is a small utility to extract the origin from a URL, to build the origins-based
 * profile view.
 */
function getOrigin(urlString: string): string {
  if (urlString.startsWith('chrome://')) {
    return urlString;
  }
  try {
    const url = new URL(urlString);
    if (url.origin === 'null') {
      // This can happen for "about:newtab"
      return urlString;
    }
    return url.origin;
  } catch {
    // This failed, maybe it's an internal URL.
    return urlString;
  }
}

/**
 * Finalize the profile state for the origin-based view. This is an experimental
 * view for fission. It's not turned on by default. Note, that this function
 * probably needs a lot of work to become more correct to handle everything,
 * so it shouldn't be trusted too much at this time.
 */
export function finalizeOriginProfileView(
  profile: Profile,
  pages: Page[],
  selectedThreadIndexes: Set<ThreadIndex> | null
): ThunkAction<void> {
  return dispatch => {
    const idToPage: Map<InnerWindowID, Page> = new Map();
    for (const page of pages) {
      idToPage.set(page.innerWindowID, page);
    }

    // TODO - A thread can have multiple pages. Ignore this for now.
    const pageOfThread: Array<Page | null> = [];
    // These maps essentially serve as a tuple of the InnerWindowID and ThreadIndex
    // that can be iterated through on a "for of" loop.
    const rootOrigins: Map<InnerWindowID, ThreadIndex> = new Map();
    const subOrigins: Map<InnerWindowID, ThreadIndex> = new Map();
    // The set of all thread indexes that do not have an origin associated with them.
    const noOrigins: Set<ThreadIndex> = new Set();

    // Populate the collections above by iterating through all of the threads.
    for (
      let threadIndex = 0;
      threadIndex < profile.threads.length;
      threadIndex++
    ) {
      const { frameTable } = profile.threads[threadIndex];

      let originFound = false;
      for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
        const innerWindowID = frameTable.innerWindowID[frameIndex];
        if (innerWindowID === null || innerWindowID === 0) {
          continue;
        }

        const page = idToPage.get(innerWindowID);
        if (!page) {
          // This should only happen if there is an error in the Gecko implementation.
          console.error('Could not find the page for an innerWindowID', {
            innerWindowID,
            pages,
          });
          break;
        }

        if (page.embedderInnerWindowID === 0) {
          rootOrigins.set(innerWindowID, threadIndex);
        } else {
          subOrigins.set(innerWindowID, threadIndex);
        }

        originFound = true;
        pageOfThread[threadIndex] = page;
        break;
      }

      if (!originFound) {
        pageOfThread[threadIndex] = null;
        noOrigins.add(threadIndex);
      }
    }

    // Build up the `originsTimelineRoots` variable and any relationships needed
    // for determining the structure of the threads in terms of their origins.
    const originsTimelineRoots: OriginsTimelineRoot[] = [];
    // This map can be used to take a thread with no origin information, and assign
    // it to some origin based on a shared PID.
    const pidToRootInnerWindowID: Map<Pid, InnerWindowID> = new Map();
    // The root is a root domain only.
    const innerWindowIDToRoot: Map<InnerWindowID, InnerWindowID> = new Map();
    for (const [innerWindowID, threadIndex] of rootOrigins) {
      const thread = profile.threads[threadIndex];
      const page = ensureExists(pageOfThread[threadIndex]);
      pidToRootInnerWindowID.set(thread.pid, innerWindowID);
      // These are all roots.
      innerWindowIDToRoot.set(innerWindowID, innerWindowID);
      originsTimelineRoots.push({
        type: 'origin',
        innerWindowID,
        threadIndex,
        page,
        origin: getOrigin(page.url),
        children: [],
      });
    }

    // Iterate and drain the sub origins from this set, and attempt to assign them
    // to a root origin. This needs to loop to handle arbitrary sub-iframe depths.
    const remainingSubOrigins = new Set([...subOrigins]);
    let lastRemaining = Infinity;
    while (lastRemaining !== remainingSubOrigins.size) {
      lastRemaining = remainingSubOrigins.size;
      for (const suborigin of remainingSubOrigins) {
        const [innerWindowID, threadIndex] = suborigin;
        const page = ensureExists(pageOfThread[threadIndex]);
        const rootInnerWindowID = innerWindowIDToRoot.get(
          page.embedderInnerWindowID
        );
        if (rootInnerWindowID === undefined) {
          // This root has not been found yet.
          continue;
        }
        const thread = profile.threads[threadIndex];
        pidToRootInnerWindowID.set(thread.pid, rootInnerWindowID);

        remainingSubOrigins.delete(suborigin);
        innerWindowIDToRoot.set(innerWindowID, rootInnerWindowID);
        const root = ensureExists(
          originsTimelineRoots.find(
            root => root.innerWindowID === rootInnerWindowID
          )
        );
        root.children.push({
          type: 'sub-origin',
          innerWindowID,
          threadIndex,
          origin: getOrigin(page.url),
          page,
        });
      }
    }

    // Try to blame a thread on another thread with an origin. If this doesn't work,
    // then add it to this originsTimelineNoOrigin array.
    const originsTimelineNoOrigin = [];
    for (const threadIndex of noOrigins) {
      const thread = profile.threads[threadIndex];
      const rootInnerWindowID = pidToRootInnerWindowID.get(thread.pid);
      const noOriginEntry = {
        type: 'no-origin',
        threadIndex,
      };
      if (rootInnerWindowID) {
        const root = ensureExists(
          originsTimelineRoots.find(
            root => root.innerWindowID === rootInnerWindowID
          )
        );
        root.children.push(noOriginEntry);
      } else {
        originsTimelineNoOrigin.push(noOriginEntry);
      }
    }

    dispatch({
      type: 'VIEW_ORIGINS_PROFILE',
      // TODO - We should pick the best selected thread.
      selectedThreadIndexes:
        selectedThreadIndexes === null ? new Set([0]) : selectedThreadIndexes,
      originsTimeline: [...originsTimelineNoOrigin, ...originsTimelineRoots],
    });
  };
}

/**
 * Finalize the profile state for active tab view.
 * This function will take the view information from the URL, such as hiding and sorting
 * information, and it will validate it against the profile. If there is no pre-existing
 * view information, this function will compute the defaults.
 */
export function finalizeActiveTabProfileView(
  profile: Profile,
  selectedThreadIndexes: Set<ThreadIndex> | null,
  browsingContextID: BrowsingContextID | null
): ThunkAction<void> {
  return (dispatch, getState) => {
    const relevantPages = getRelevantPagesForActiveTab(getState());
    const activeTabTimeline = computeActiveTabTracks(
      profile,
      relevantPages,
      getState()
    );

    if (selectedThreadIndexes === null) {
      // Select the main track if there is no selected thread.
      selectedThreadIndexes = new Set([
        ...activeTabTimeline.mainTrack.threadIndexes,
      ]);
    }

    dispatch({
      type: 'VIEW_ACTIVE_TAB_PROFILE',
      activeTabTimeline,
      selectedThreadIndexes,
      browsingContextID,
    });
  };
}

/**
 * Re-compute the profile view data. That's used to be able to switch between
 * full and active tab view.
 */
export function changeTimelineTrackOrganization(
  timelineTrackOrganization: TimelineTrackOrganization
): ThunkAction<void> {
  return (dispatch, getState) => {
    const profile = getProfile(getState());
    // We are resetting the selected thread index, because we are not sure if
    // the selected thread will be availabe in the next view.
    const selectedThreadIndexes = new Set([0]);
    dispatch({
      type: 'DATA_RELOAD',
    });

    switch (timelineTrackOrganization.type) {
      case 'full':
        // The url state says this is a full view. We should compute and initialize
        // the state relevant to that state.
        dispatch(finalizeFullProfileView(profile, selectedThreadIndexes));
        break;
      case 'active-tab':
        // The url state says this is an active tab view. We should compute and
        // initialize the state relevant to that state.
        dispatch(
          finalizeActiveTabProfileView(
            profile,
            selectedThreadIndexes,
            timelineTrackOrganization.browsingContextID
          )
        );
        break;
      case 'origins': {
        const pages = ensureExists(
          profile.pages,
          'There was no page information in the profile.'
        );
        dispatch(
          finalizeOriginProfileView(profile, pages, selectedThreadIndexes)
        );
        break;
      }
      default:
        throw assertExhaustiveCheck(
          timelineTrackOrganization,
          `Unhandled TimelineTrackOrganization type.`
        );
    }
  };
}

/**
 * Symbolication normally happens when a profile is first loaded. This function
 * provides the ability to kick off symbolication again after it has already been
 * attempted once.
 */
export function resymbolicateProfile(): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const symbolStore = getSymbolStore(dispatch);
    const profile = getProfile(getState());
    if (!symbolStore) {
      throw new Error(
        'There was no symbol store when attempting to re-symbolicate.'
      );
    }
    await doSymbolicateProfile(dispatch, profile, symbolStore);
  };
}

// Previously `loadProfile` and `finalizeProfileView` functions were a single
// function called `viewProfile`. Then we had to split it because of the changes
// of url/profile loading mechanism. We kept the `viewProfile` function with the
// same functionality as previous `viewProfile` because many of the tests use this.
// This function will simply call `loadProfile` (and `finalizeProfileView` inside
// `loadProfile`) and wait until symbolication finishes.
export function viewProfile(
  profile: Profile,
  config: $Shape<{|
    timelineTrackOrganization: TimelineTrackOrganization,
    pathInZipFile: string,
    implementationFilter: ImplementationFilter,
    transformStacks: TransformStacksPerThread,
    geckoProfiler: $GeckoProfiler,
    skipSymbolication: boolean,
  |}> = {}
): ThunkAction<Promise<void>> {
  return async dispatch => {
    await dispatch(loadProfile(profile, config, false));
  };
}

export function requestingSymbolTable(requestedLib: RequestedLib): Action {
  return {
    type: 'REQUESTING_SYMBOL_TABLE',
    requestedLib,
  };
}

export function receivedSymbolTableReply(requestedLib: RequestedLib): Action {
  return {
    type: 'RECEIVED_SYMBOL_TABLE_REPLY',
    requestedLib,
  };
}

export function startSymbolicating(): Action {
  return {
    type: 'START_SYMBOLICATING',
  };
}

export function doneSymbolicating(): Action {
  return { type: 'DONE_SYMBOLICATING' };
}

// Apply all the individual "symbolication steps" from symbolicationStepsPerThread
// to the current profile, as one redux action.
// We combine steps into one redux action in order to avoid unnecessary renders.
// When symbolication results arrive, we often get a very high number of individual
// symbolication updates. If we dispatched all of them as individual redux actions,
// we would cause React to re-render synchronously for each action, and the profile
// selectors called from rendering would do expensive work, most of which would never
// reach the screen because it would be invalidated by the next symbolication update.
// So we queue up symbolication steps and run the update from requestIdleCallback.
export function bulkProcessSymbolicationSteps(
  symbolicationStepsPerThread: Map<ThreadIndex, SymbolicationStepInfo[]>
): ThunkAction<void> {
  return (dispatch, getState) => {
    const { threads } = getProfile(getState());
    const oldFuncToNewFuncMaps = new Map();
    const symbolicatedThreads = threads.map((oldThread, threadIndex) => {
      const symbolicationSteps = symbolicationStepsPerThread.get(threadIndex);
      if (symbolicationSteps === undefined) {
        return oldThread;
      }
      const oldFuncToNewFuncMap = new Map();
      let thread = oldThread;
      for (const symbolicationStep of symbolicationSteps) {
        thread = applySymbolicationStep(
          thread,
          symbolicationStep,
          oldFuncToNewFuncMap
        );
      }
      oldFuncToNewFuncMaps.set(threadIndex, oldFuncToNewFuncMap);
      return thread;
    });
    dispatch({
      type: 'BULK_SYMBOLICATION',
      oldFuncToNewFuncMaps,
      symbolicatedThreads,
    });
  };
}

let requestIdleCallbackPolyfill: (
  callback: () => void,
  _opts?: { timeout: number }
) => mixed;

if (typeof window === 'object' && window.requestIdleCallback) {
  requestIdleCallbackPolyfill = window.requestIdleCallback;
} else if (typeof process === 'object' && process.nextTick) {
  // Node environment
  requestIdleCallbackPolyfill = process.nextTick;
} else {
  requestIdleCallbackPolyfill = callback => setTimeout(callback, 0);
}

// Queues up symbolication steps and bulk-processes them from requestIdleCallback,
// in order to improve UI responsiveness during symbolication.
class SymbolicationStepQueue {
  _updates: Map<ThreadIndex, SymbolicationStepInfo[]>;
  _updateObservers: Array<() => void>;
  _requestedUpdate: boolean;

  constructor() {
    this._updates = new Map();
    this._updateObservers = [];
    this._requestedUpdate = false;
  }

  _scheduleUpdate(dispatch) {
    // Only request an update if one hasn't already been scheduled.
    if (!this._requestedUpdate) {
      requestIdleCallbackPolyfill(() => this._dispatchUpdate(dispatch), {
        timeout: 2000,
      });
      this._requestedUpdate = true;
    }
  }

  _dispatchUpdate(dispatch) {
    const updates = this._updates;
    const observers = this._updateObservers;
    this._updates = new Map();
    this._updateObservers = [];
    this._requestedUpdate = false;

    dispatch(bulkProcessSymbolicationSteps(updates));

    for (const observer of observers) {
      observer();
    }
  }

  enqueueSingleSymbolicationStep(
    dispatch: Dispatch,
    threadIndex: ThreadIndex,
    symbolicationStepInfo: SymbolicationStepInfo,
    completionHandler: () => void
  ) {
    this._scheduleUpdate(dispatch);
    let threadSteps = this._updates.get(threadIndex);
    if (threadSteps === undefined) {
      threadSteps = [];
      this._updates.set(threadIndex, threadSteps);
    }
    threadSteps.push(symbolicationStepInfo);
    this._updateObservers.push(completionHandler);
  }
}

const _symbolicationStepQueueSingleton = new SymbolicationStepQueue();

/**
 * If the profile object we got from the add-on is an ArrayBuffer, convert it
 * to a gecko profile object by parsing the JSON.
 */
async function _unpackGeckoProfileFromAddon(profile) {
  // Note: the following check will work for array buffers coming from another
  // global. This happens especially with tests but could happen in the future
  // in Firefox too.
  if (Object.prototype.toString.call(profile) === '[object ArrayBuffer]') {
    const profileBytes = new Uint8Array(profile);
    let decompressedProfile;
    // Check for the gzip magic number in the header. If we find it, decompress
    // the data first.
    if (profileBytes[0] === 0x1f && profileBytes[1] === 0x8b) {
      decompressedProfile = await decompress(profileBytes);
    } else {
      decompressedProfile = profile;
    }

    const textDecoder = new TextDecoder();
    return JSON.parse(textDecoder.decode(decompressedProfile));
  }
  return profile;
}

async function getProfileFromAddon(
  dispatch: Dispatch,
  geckoProfiler: $GeckoProfiler
): Promise<Profile> {
  dispatch(waitingForProfileFromAddon());

  // XXX update state to show that we're connected to the profiler addon
  const rawGeckoProfile = await geckoProfiler.getProfile();
  const unpackedProfile = await _unpackGeckoProfileFromAddon(rawGeckoProfile);
  const profile = processGeckoProfile(unpackedProfile);
  await dispatch(loadProfile(profile, { geckoProfiler }));

  return profile;
}

function getSymbolStore(
  dispatch: Dispatch,
  geckoProfiler?: $GeckoProfiler
): SymbolStore | null {
  if (!window.indexedDB) {
    // We could be running in a test environment with no indexedDB support. Do not
    // return a symbol store in this case.
    return null;
  }
  // Note, the database name still references the old project name, "perf.html". It was
  // left the same as to not invalidate user's information.
  const symbolStore = new SymbolStore('perf-html-async-storage', {
    requestSymbolsFromServer: requests => {
      for (const { lib } of requests) {
        dispatch(requestingSymbolTable(lib));
      }
      return MozillaSymbolicationAPI.requestSymbols(requests).map(
        async (libPromise, i) => {
          try {
            const result = libPromise;
            dispatch(receivedSymbolTableReply(requests[i].lib));
            return result;
          } catch (error) {
            dispatch(receivedSymbolTableReply(requests[i].lib));
            throw error;
          }
        }
      );
    },
    requestSymbolTableFromAddon: async lib => {
      if (!geckoProfiler) {
        throw new Error("There's no connection to the gecko profiler add-on.");
      }

      const { debugName, breakpadId } = lib;
      dispatch(requestingSymbolTable(lib));
      try {
        const symbolTable = await geckoProfiler.getSymbolTable(
          debugName,
          breakpadId
        );
        dispatch(receivedSymbolTableReply(lib));
        return symbolTable;
      } catch (error) {
        dispatch(receivedSymbolTableReply(lib));
        throw error;
      }
    },
  });

  return symbolStore;
}

export async function doSymbolicateProfile(
  dispatch: Dispatch,
  profile: Profile,
  symbolStore: SymbolStore
) {
  dispatch(startSymbolicating());

  const completionPromises = [];

  await symbolicateProfile(
    profile,
    symbolStore,
    (
      threadIndex: ThreadIndex,
      symbolicationStepInfo: SymbolicationStepInfo
    ) => {
      completionPromises.push(
        new Promise(resolve => {
          _symbolicationStepQueueSingleton.enqueueSingleSymbolicationStep(
            dispatch,
            threadIndex,
            symbolicationStepInfo,
            resolve
          );
        })
      );
    }
  );

  await Promise.all(completionPromises);

  dispatch(doneSymbolicating());
}

export function retrieveProfileFromAddon(): ThunkAction<Promise<void>> {
  return async dispatch => {
    try {
      const timeoutId = setTimeout(() => {
        dispatch(
          temporaryError(
            new TemporaryError(oneLine`
            We were unable to connect to the Gecko profiler add-on within thirty seconds.
            This might be because the profile is big or your machine is slower than usual.
            Still waiting...
          `)
          )
        );
      }, 30000);
      const geckoProfiler = await window.geckoProfilerPromise;
      clearTimeout(timeoutId);

      await getProfileFromAddon(dispatch, geckoProfiler);
    } catch (error) {
      dispatch(fatalError(error));
      console.error(error);
    }
  };
}

export function waitingForProfileFromStore(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_STORE',
  };
}

export function waitingForProfileFromUrl(profileUrl?: string): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_URL',
    profileUrl,
  };
}

export function receiveZipFile(zip: JSZip): Action {
  return {
    type: 'RECEIVE_ZIP_FILE',
    zip,
  };
}

export function temporaryError(error: TemporaryError): Action {
  return {
    type: 'TEMPORARY_ERROR',
    error,
  };
}

function _wait(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

type FetchProfileArgs = {
  url: string,
  onTemporaryError: TemporaryError => void,
  // Allow tests to capture the reported error, but normally use console.error.
  reportError?: (...data: Array<any>) => void,
};

type ProfileOrZip = {
  profile?: any,
  zip?: JSZip,
};

/**
 * Tries to fetch a profile on `url`. If the profile is not found,
 * `onTemporaryError` is called with an appropriate error, we wait 1 second, and
 * then tries again. If we still can't find the profile after 11 tries, the
 * returned promise is rejected with a fatal error.
 * If we can retrieve the profile properly, the returned promise is resolved
 * with the JSON.parsed profile.
 */
export async function _fetchProfile(
  args: FetchProfileArgs
): Promise<ProfileOrZip> {
  const MAX_WAIT_SECONDS = 10;
  let i = 0;
  const { url, onTemporaryError } = args;
  // Allow tests to capture the reported error, but normally use console.error.
  const reportError = args.reportError || console.error;

  while (true) {
    const response = await fetch(url);
    // Case 1: successful answer.
    if (response.ok) {
      return _extractProfileOrZipFromResponse(url, response, reportError);
    }

    // case 2: unrecoverable error.
    if (response.status !== 403) {
      throw new Error(oneLine`
        Could not fetch the profile on remote server.
        Response was: ${response.status} ${response.statusText}.
      `);
    }

    // case 3: 403 errors can be transient while a profile is uploaded.

    if (i++ === MAX_WAIT_SECONDS) {
      // In the last iteration we don't send a temporary error because we'll
      // throw an error right after the while loop.
      break;
    }

    onTemporaryError(
      new TemporaryError(
        'Profile not found on remote server.',
        { count: i, total: MAX_WAIT_SECONDS + 1 } // 11 tries during 10 seconds
      )
    );

    await _wait(1000);
  }

  throw new Error(oneLine`
    Could not fetch the profile on remote server:
    still not found after ${MAX_WAIT_SECONDS} seconds.
  `);
}

/**
 * Deduce the file type from a url and content type. Third parties can give us
 * arbitrary information, so make sure that we try out best to extract the proper
 * information about it.
 */
function _deduceContentType(
  url: string,
  contentType: string | null
): 'application/json' | 'application/zip' | null {
  if (contentType === 'application/zip' || contentType === 'application/json') {
    return contentType;
  }
  if (url.match(/\.zip$/)) {
    return 'application/zip';
  }
  if (url.match(/\.json/)) {
    return 'application/json';
  }
  return null;
}

/**
 * This function guesses the correct content-type (even if one isn't sent) and then
 * attempts to use the proper method to extract the response.
 */
async function _extractProfileOrZipFromResponse(
  url: string,
  response: Response,
  reportError: (...data: Array<any>) => void
): Promise<ProfileOrZip> {
  const contentType = _deduceContentType(
    url,
    response.headers.get('content-type')
  );
  switch (contentType) {
    case 'application/zip':
      return {
        zip: await _extractZipFromResponse(response, reportError),
      };
    case 'application/json':
    case null:
      // The content type is null if it is unknown, or an unsupported type. Go ahead
      // and try to process it as a profile.
      return {
        profile: await _extractJsonFromResponse(
          response,
          reportError,
          contentType
        ),
      };
    default:
      throw new Error(`Unhandled file type: ${(contentType: empty)}`);
  }
}

/**
 * Attempt to load a zip file from a third party. This process can fail, so make sure
 * to handle and report the error if it does.
 */
async function _extractZipFromResponse(
  response: Response,
  reportError: (...data: Array<any>) => void
): Promise<JSZip> {
  const buffer = await response.arrayBuffer();
  try {
    const zip = await JSZip.loadAsync(buffer);
    // Catch the error if unable to load the zip.
    return zip;
  } catch (error) {
    const message = 'Unable to unzip the zip file.';
    reportError(message);
    reportError('Error:', error);
    reportError('Fetch response:', response);
    throw new Error(
      `${message} The full error information has been printed out to the DevTool’s console.`
    );
  }
}

/**
 * Don't trust third party responses, try and handle a variety of responses gracefully.
 */
async function _extractJsonFromResponse(
  response: Response,
  reportError: (...data: Array<any>) => void,
  fileType: 'application/json' | null
): Promise<any> {
  try {
    // Don't check the content-type, but attempt to parse the response as JSON.
    const json = await response.json();
    // Catch the error if unable to parse the JSON.
    return json;
  } catch (error) {
    // Change the error message depending on the circumstance:
    let message;
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      message = 'The network request to load the profile was aborted.';
    } else if (fileType === 'application/json') {
      message = 'The profile’s JSON could not be decoded.';
    } else {
      message = oneLine`
        The profile could not be downloaded and decoded. This does not look like a supported file
        type.
      `;
    }

    // Provide helpful debugging information to the console.
    reportError(message);
    reportError('JSON parsing error:', error);
    reportError('Fetch response:', response);

    throw new Error(
      `${message} The full error information has been printed out to the DevTool’s console.`
    );
  }
}

export function getProfileUrlForHash(hash: string): string {
  // See https://cloud.google.com/storage/docs/access-public-data
  // The URL is https://storage.googleapis.com/<BUCKET>/<FILEPATH>.
  // https://<BUCKET>.storage.googleapis.com/<FILEPATH> seems to also work but
  // is not documented nowadays.

  // By convention, "profile-store" is the name of our bucket, and the file path
  // is the hash we receive in the URL.
  return `https://storage.googleapis.com/${GOOGLE_STORAGE_BUCKET}/${hash}`;
}

export function retrieveProfileFromStore(
  hash: string,
  initialLoad: boolean = false
): ThunkAction<Promise<void>> {
  return retrieveProfileOrZipFromUrl(getProfileUrlForHash(hash), initialLoad);
}

/**
 * Runs a fetch on a URL, and downloads the file. If it's JSON, then it attempts
 * to process the profile. If it's a zip file, it tries to unzip it, and save it
 * into the store so that the user can then choose which file to load.
 */
export function retrieveProfileOrZipFromUrl(
  profileUrl: string,
  initialLoad: boolean = false
): ThunkAction<Promise<void>> {
  return async function(dispatch) {
    dispatch(waitingForProfileFromUrl(profileUrl));

    try {
      const response = await _fetchProfile({
        url: profileUrl,
        onTemporaryError: (e: TemporaryError) => {
          dispatch(temporaryError(e));
        },
      });

      const serializedProfile = response.profile;
      const zip = response.zip;
      if (serializedProfile) {
        const profile = await unserializeProfileOfArbitraryFormat(
          serializedProfile
        );
        if (profile === undefined) {
          throw new Error('Unable to parse the profile.');
        }

        await dispatch(loadProfile(profile, {}, initialLoad));
      } else if (zip) {
        await dispatch(receiveZipFile(zip));
      } else {
        throw new Error(
          'Expected to receive a zip file or profile from _fetchProfile.'
        );
      }
    } catch (error) {
      dispatch(fatalError(error));
    }
  };
}

export function waitingForProfileFromFile(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_FILE',
  };
}

function _fileReader(input: File) {
  const reader = new FileReader();
  const promise = new Promise((resolve, reject) => {
    // Flow's definition for FileReader doesn't handle the polymorphic nature of
    // reader.result very well, as its definition is <string | ArrayBuffer>.
    // Here we ensure type safety by returning the proper Promise type from the
    // methods below.
    reader.onload = () => resolve((reader.result: any));
    reader.onerror = () => reject(reader.error);
  });

  return {
    asText(): Promise<string> {
      reader.readAsText(input);
      return promise;
    },

    asArrayBuffer(): Promise<ArrayBuffer> {
      reader.readAsArrayBuffer(input);
      return promise;
    },
  };
}

/**
 * Multiple file formats are supported. Look at the file type and try and
 * parse the contents according to its type.
 */
export function retrieveProfileFromFile(
  file: File,
  // Allow tests to inject a custom file reader to bypass the DOM APIs.
  fileReader: typeof _fileReader = _fileReader
): ThunkAction<Promise<void>> {
  return async dispatch => {
    // Notify the UI that we are loading and parsing a profile. This can take
    // a little bit of time.
    dispatch(waitingForProfileFromFile());

    try {
      switch (file.type) {
        case 'application/gzip':
        case 'application/x-gzip':
          // Parse a single profile that has been gzipped.
          {
            const buffer = await fileReader(file).asArrayBuffer();
            const arrayBuffer = new Uint8Array(buffer);
            const decompressedArrayBuffer = await decompress(arrayBuffer);
            const textDecoder = new TextDecoder();
            const text = await textDecoder.decode(decompressedArrayBuffer);
            const profile = await unserializeProfileOfArbitraryFormat(text);
            if (profile === undefined) {
              throw new Error('Unable to parse the profile.');
            }

            await withHistoryReplaceStateAsync(async () => {
              await dispatch(viewProfile(profile));
            });
          }
          break;
        case 'application/zip':
          // Open a zip file in the zip file viewer
          {
            const buffer = await fileReader(file).asArrayBuffer();
            const zip = await JSZip.loadAsync(buffer);
            await dispatch(receiveZipFile(zip));
          }
          break;
        default: {
          // Plain uncompressed profile files can have file names with uncommon
          // extensions (eg .profile). So we can't rely on the mime type to
          // decide how to handle them. We'll try to parse them as a plain JSON
          // file.
          const text = await fileReader(file).asText();
          const profile = await unserializeProfileOfArbitraryFormat(text);
          if (profile === undefined) {
            throw new Error('Unable to parse the profile.');
          }

          await withHistoryReplaceStateAsync(async () => {
            await dispatch(viewProfile(profile));
          });
        }
      }
    } catch (error) {
      dispatch(fatalError(error));
    }
  };
}

/**
 * This action retrieves several profiles and push them into 1 profile using the
 * information contained in the query.
 */
export function retrieveProfilesToCompare(
  profileViewUrls: string[],
  initialLoad: boolean = false
): ThunkAction<Promise<void>> {
  return async dispatch => {
    dispatch(waitingForProfileFromUrl());

    try {
      // First we get a state from each URL. From these states we'll get all the
      // data we need to fetch and process the profiles.
      const profileStates = await Promise.all(
        profileViewUrls.map(async url => {
          if (
            url.startsWith('https://perfht.ml/') ||
            url.startsWith('https://share.firefox.dev/') ||
            url.startsWith('https://bit.ly/')
          ) {
            url = await expandUrl(url);
          }
          return stateFromLocation(new URL(url));
        })
      );

      const hasSupportedDatasources = profileStates.every(
        state => state.dataSource === 'public'
      );
      if (!hasSupportedDatasources) {
        throw new Error(
          'Only public uploaded profiles are supported by the comparison function.'
        );
      }

      // Then we retrieve the profiles from the online store, and unserialize
      // and process them if needed.
      const promises = profileStates.map(async ({ hash }) => {
        const profileUrl = getProfileUrlForHash(hash);
        const response = await _fetchProfile({
          url: profileUrl,
          onTemporaryError: (e: TemporaryError) => {
            dispatch(temporaryError(e));
          },
        });
        const serializedProfile = response.profile;
        if (!serializedProfile) {
          throw new Error('Expected to receive a profile from _fetchProfile');
        }

        const profile = unserializeProfileOfArbitraryFormat(serializedProfile);
        return profile;
      });

      // Once all profiles have been fetched and unserialized, we can start
      // pushing them to a brand new profile. This resulting profile will keep
      // only the 2 selected threads from the 2 profiles.
      const profiles = await Promise.all(promises);

      const {
        profile: resultProfile,
        implementationFilters,
        transformStacks,
      } = mergeProfilesForDiffing(profiles, profileStates);

      // We define an implementationFilter if both profiles agree with the value.
      let implementationFilter;
      if (implementationFilters[0] === implementationFilters[1]) {
        implementationFilter = implementationFilters[0];
      }

      await dispatch(
        loadProfile(
          resultProfile,
          {
            transformStacks,
            implementationFilter,
          },
          initialLoad
        )
      );
    } catch (error) {
      dispatch(fatalError(error));
    }
  };
}

// This function takes location(most probably `window.location`) as parameter
// and loads the profile in that given location, then returns the profile data.
// This function is being used to get the initial profile data before upgrading
// the url and processing the UrlState.
export function getProfilesFromRawUrl(
  location: Location
): ThunkAction<Promise<Profile | null>> {
  return async (dispatch, getState) => {
    const pathParts = location.pathname.split('/').filter(d => d);
    let dataSource = ensureIsValidDataSource(pathParts[0]);
    if (dataSource === 'from-file') {
      // Redirect to 'none' if `dataSource` is 'from-file' since initial urls can't
      // be 'from-file' and needs to be redirected to home page.
      dataSource = 'none';
    }
    dispatch(setDataSource(dataSource));

    switch (dataSource) {
      case 'from-addon':
      case 'unpublished':
        // We don't need to `await` the result because there's no url upgrading
        // when retrieving the profile from the addon and we don't need to wait
        // for the process. Moreover we don't want to wait for the end of
        // symbolication and rather want to show the UI as soon as we get
        // the profile data.
        dispatch(retrieveProfileFromAddon());
        break;
      case 'public':
        await dispatch(retrieveProfileFromStore(pathParts[1], true));
        break;
      case 'from-url':
        await dispatch(
          retrieveProfileOrZipFromUrl(decodeURIComponent(pathParts[1]), true)
        );
        break;
      case 'compare': {
        const query = queryString.parse(location.search.substr(1), {
          arrayFormat: 'bracket', // This uses parameters with brackets for arrays.
        });
        if (Array.isArray(query.profiles)) {
          await dispatch(retrieveProfilesToCompare(query.profiles, true));
        }
        break;
      }
      case 'uploaded-recordings':
      case 'none':
      case 'from-file':
      case 'local':
        // There is no profile to download for these datasources.
        break;
      default:
        throw assertExhaustiveCheck(
          dataSource,
          `Unknown dataSource ${dataSource}.`
        );
    }

    // Profile may be null only for the `from-addon` dataSource since we do
    // not `await` for retrieveProfileFromAddon function.
    return getProfileOrNull(getState());
  };
}
