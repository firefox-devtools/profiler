/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { oneLine } from 'common-tags';
import queryString from 'query-string';
import JSZip from 'jszip';
import {
  insertExternalMarkersIntoProfile,
  insertExternalPowerCountersIntoProfile,
  processGeckoProfile,
  unserializeProfileOfArbitraryFormat,
} from 'firefox-profiler/profile-logic/process-profile';
import { SymbolStore } from 'firefox-profiler/profile-logic/symbol-store';
import {
  symbolicateProfile,
  applySymbolicationSteps,
} from 'firefox-profiler/profile-logic/symbolication';
import * as MozillaSymbolicationAPI from 'firefox-profiler/profile-logic/mozilla-symbolication-api';
import { mergeProfilesForDiffing } from 'firefox-profiler/profile-logic/merge-compare';
import { decompress, isGzip } from 'firefox-profiler/utils/gz';
import { expandUrl } from 'firefox-profiler/utils/shorten-url';
import { TemporaryError } from 'firefox-profiler/utils/errors';
import { isLocalURL } from 'firefox-profiler/utils/url';
import {
  getSelectedThreadIndexesOrNull,
  getGlobalTrackOrder,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getLocalTrackOrderByPid,
  getLegacyThreadOrder,
  getLegacyHiddenThreads,
  getProfileOrNull,
  getProfile,
  getView,
  getSymbolServerUrl,
  getBrowserConnection,
} from 'firefox-profiler/selectors';
import {
  getSelectedTab,
  getTabFilter,
} from 'firefox-profiler/selectors/url-state';
import {
  getTabToThreadIndexesMap,
  getThreadActivityScores,
} from 'firefox-profiler/selectors/profile';
import {
  withHistoryReplaceStateAsync,
  withHistoryReplaceStateSync,
  stateFromLocation,
  ensureIsValidDataSource,
} from 'firefox-profiler/app-logic/url-handling';
import { tabsShowingSampleData } from 'firefox-profiler/app-logic/tabs-handling';
import {
  initializeLocalTrackOrderByPid,
  computeLocalTracksByPid,
  computeGlobalTracks,
  initializeGlobalTrackOrder,
  initializeSelectedThreadIndex,
  tryInitializeHiddenTracksLegacy,
  tryInitializeHiddenTracksFromUrl,
  computeDefaultHiddenTracks,
  getVisibleThreads,
} from 'firefox-profiler/profile-logic/tracks';
import { setDataSource } from './profile-view';
import { fatalError } from './errors';
import { batchLoadDataUrlIcons } from './icons';
import { GOOGLE_STORAGE_BUCKET } from 'firefox-profiler/app-logic/constants';
import {
  determineTimelineType,
  hasUsefulSamples,
} from 'firefox-profiler/profile-logic/profile-data';

import type {
  RequestedLib,
  ImplementationFilter,
  TransformStacksPerThread,
  Action,
  ThunkAction,
  Dispatch,
  Profile,
  ThreadIndex,
  TabID,
  PageList,
  MixedObject,
} from 'firefox-profiler/types';

import type {
  FuncToFuncsMap,
  SymbolicationStepInfo,
} from '../profile-logic/symbolication';
import { assertExhaustiveCheck } from '../utils/flow';
import { bytesToBase64DataUrl } from 'firefox-profiler/utils/base64';
import type {
  BrowserConnection,
  BrowserConnectionStatus,
} from '../app-logic/browser-connection';
import type { LibSymbolicationRequest } from '../profile-logic/symbol-store';

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

export function waitingForProfileFromBrowser(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_BROWSER',
  };
}

/**
 * Call this function once the profile has been fetched and pre-processed from whatever
 * source (url, browser, file, etc).
 */
export function loadProfile(
  profile: Profile,
  config: Partial<{
    pathInZipFile: string;
    implementationFilter: ImplementationFilter;
    transformStacks: TransformStacksPerThread;
    browserConnection: BrowserConnection | null;
    skipSymbolication: boolean; // Please use this in tests only.
  }> = {},
  initialLoad: boolean = false
): ThunkAction<Promise<void>> {
  return async (dispatch) => {
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
    } as Action);

    // During initial load, we are upgrading the URL and generating the UrlState
    // before finalizing profile view. That's why we are dispatching this action
    // after completing those steps inside `setupInitialUrlState`.
    if (initialLoad === false) {
      await dispatch(
        finalizeProfileView(
          config.browserConnection ?? null,
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
  browserConnection: BrowserConnection | null = null,
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

    dispatch(finalizeFullProfileView(profile, selectedThreadIndexes));

    let faviconsPromise = null;
    if (browserConnection && pages && pages.length > 0) {
      faviconsPromise = retrievePageFaviconsFromBrowser(
        dispatch,
        pages,
        browserConnection
      );
    }

    // Note we kick off symbolication only for the profiles we know for sure
    // that they weren't symbolicated.
    // We can skip the symbolication in tests if needed.
    let symbolicationPromise = null;
    if (!skipSymbolication && profile.meta.symbolicated === false) {
      const symbolStore = getSymbolStore(
        dispatch,
        getSymbolServerUrl(getState()),
        browserConnection
      );
      if (symbolStore) {
        // Only symbolicate if a symbol store is available. In tests we may not
        // have access to IndexedDB.
        symbolicationPromise = doSymbolicateProfile(
          dispatch,
          profile,
          symbolStore
        );
      }
    }

    await Promise.all([faviconsPromise, symbolicationPromise]);
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
  maybeSelectedThreadIndexes: Set<ThreadIndex> | null
): ThunkAction<void> {
  return (dispatch, getState) => {
    const hasUrlInfo = maybeSelectedThreadIndexes !== null;

    const tabToThreadIndexesMap = getTabToThreadIndexesMap(getState());
    const tabFilter = hasUrlInfo ? getTabFilter(getState()) : null;
    const globalTracks = computeGlobalTracks(
      profile,
      tabFilter,
      tabToThreadIndexesMap
    );
    const localTracksByPid = computeLocalTracksByPid(profile, globalTracks);

    const threadActivityScores = getThreadActivityScores(getState());
    const legacyThreadOrder = getLegacyThreadOrder(getState());
    const globalTrackOrder = initializeGlobalTrackOrder(
      globalTracks,
      hasUrlInfo ? getGlobalTrackOrder(getState()) : null,
      legacyThreadOrder,
      threadActivityScores
    );
    const localTrackOrderByPid = initializeLocalTrackOrderByPid(
      hasUrlInfo ? getLocalTrackOrderByPid(getState()) : null,
      localTracksByPid,
      legacyThreadOrder,
      profile
    );

    const tracksWithOrder = {
      globalTracks,
      globalTrackOrder,
      localTracksByPid,
      localTrackOrderByPid,
    };

    let hiddenTracks = null;

    // For non-initial profile loads, initialize the set of hidden tracks from
    // information in the URL.
    const legacyHiddenThreads = getLegacyHiddenThreads(getState());
    if (legacyHiddenThreads !== null) {
      hiddenTracks = tryInitializeHiddenTracksLegacy(
        tracksWithOrder,
        legacyHiddenThreads,
        profile
      );
    } else if (hasUrlInfo) {
      hiddenTracks = tryInitializeHiddenTracksFromUrl(
        tracksWithOrder,
        getHiddenGlobalTracks(getState()),
        getHiddenLocalTracksByPid(getState())
      );
    }

    if (hiddenTracks === null) {
      // Compute a default set of hidden tracks.
      // This is the case for the initial profile load.
      // We also get here if the URL info was ignored, for example if
      // respecting it would have caused all threads to become hidden.
      const includeParentProcessThreads = tabFilter === null;
      hiddenTracks = computeDefaultHiddenTracks(
        tracksWithOrder,
        profile,
        threadActivityScores,
        // Only include the parent process if there is no tab filter applied.
        includeParentProcessThreads
      );
    }

    const selectedThreadIndexes = initializeSelectedThreadIndex(
      maybeSelectedThreadIndexes,
      getVisibleThreads(tracksWithOrder, hiddenTracks),
      profile,
      threadActivityScores
    );

    let timelineType = null;
    if (!hasUrlInfo) {
      timelineType = determineTimelineType(profile);
    }

    // If the currently selected tab is only visible when the selected track
    // has samples, verify that the selected track has samples, and if not
    // select the marker chart.
    let selectedTab = getSelectedTab(getState());
    if (tabsShowingSampleData.includes(selectedTab)) {
      let hasSamples = false;
      for (const threadIndex of selectedThreadIndexes) {
        const thread = profile.threads[threadIndex];
        const { samples, jsAllocations, nativeAllocations } = thread;
        hasSamples = [samples, jsAllocations, nativeAllocations].some((table) =>
          hasUsefulSamples(table?.stack, thread, profile.shared)
        );
        if (hasSamples) {
          break;
        }
      }
      if (!hasSamples) {
        selectedTab = 'marker-chart';
      }
    }

    withHistoryReplaceStateSync(() => {
      dispatch({
        type: 'VIEW_FULL_PROFILE',
        selectedThreadIndexes,
        selectedTab,
        globalTracks,
        globalTrackOrder,
        localTracksByPid,
        localTrackOrderByPid,
        timelineType,
        ...hiddenTracks,
      });
    });
  };
}

/**
 * Symbolication normally happens when a profile is first loaded. This function
 * provides the ability to kick off symbolication again after it has already been
 * attempted once.
 */
export function resymbolicateProfile(): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const symbolStore = getSymbolStore(
      dispatch,
      getSymbolServerUrl(getState()),
      getBrowserConnection(getState())
    );
    const profile = getProfile(getState());
    if (!symbolStore) {
      throw new Error(
        'There was no symbol store when attempting to re-symbolicate.'
      );
    }
    await doSymbolicateProfile(
      dispatch,
      profile,
      symbolStore,
      /* ignoreCache */ true
    );
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
  config: Partial<{
    pathInZipFile: string;
    implementationFilter: ImplementationFilter;
    transformStacks: TransformStacksPerThread;
    skipSymbolication: boolean;
    browserConnection: BrowserConnection | null;
  }> = {}
): ThunkAction<Promise<void>> {
  return async (dispatch) => {
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
    const { threads, shared } = getProfile(getState());
    const oldFuncToNewFuncsMaps: Map<ThreadIndex, FuncToFuncsMap> = new Map();
    const symbolicatedThreads = threads.map((oldThread, threadIndex) => {
      const symbolicationSteps = symbolicationStepsPerThread.get(threadIndex);
      if (symbolicationSteps === undefined) {
        return oldThread;
      }
      const { thread, oldFuncToNewFuncsMap } = applySymbolicationSteps(
        oldThread,
        shared,
        symbolicationSteps
      );
      oldFuncToNewFuncsMaps.set(threadIndex, oldFuncToNewFuncsMap);
      return thread;
    });
    dispatch({
      type: 'BULK_SYMBOLICATION',
      oldFuncToNewFuncsMaps,
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
  requestIdleCallbackPolyfill = (callback) => setTimeout(callback, 0);
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

  _scheduleUpdate(dispatch: Dispatch) {
    // Only request an update if one hasn't already been scheduled.
    if (!this._requestedUpdate) {
      requestIdleCallbackPolyfill(() => this._dispatchUpdate(dispatch), {
        timeout: 2000,
      });
      this._requestedUpdate = true;
    }
  }

  _dispatchUpdate(dispatch: Dispatch) {
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
 * If the profile object we got from the browser is an ArrayBuffer, convert it
 * to a gecko profile object by parsing the JSON.
 */
async function _unpackGeckoProfileFromBrowser(
  profile: ArrayBuffer | MixedObject
): Promise<unknown> {
  // Note: the following check will work for array buffers coming from another
  // global. This happens especially with tests but could happen in the future
  // in Firefox too.
  if (Object.prototype.toString.call(profile) === '[object ArrayBuffer]') {
    return _extractJsonFromArrayBuffer(profile as ArrayBuffer);
  }
  return profile;
}

function getSymbolStore(
  dispatch: Dispatch,
  symbolServerUrl: string,
  browserConnection: BrowserConnection | null
): SymbolStore | null {
  if (!window.indexedDB) {
    // We could be running in a test environment with no indexedDB support. Do not
    // return a symbol store in this case.
    return null;
  }

  async function requestSymbolsWithCallback(
    symbolSupplierName: string,
    requests: LibSymbolicationRequest[],
    callback: (path: string, requestJson: string) => Promise<unknown>
  ) {
    for (const { lib } of requests) {
      dispatch(requestingSymbolTable(lib));
    }
    try {
      return await MozillaSymbolicationAPI.requestSymbols(
        symbolSupplierName,
        requests,
        callback
      );
    } catch (e) {
      throw new Error(
        `There was a problem with the symbolication API request to the ${symbolSupplierName}: ${e.message}`
      );
    } finally {
      for (const { lib } of requests) {
        dispatch(receivedSymbolTableReply(lib));
      }
    }
  }

  // Note, the database name still references the old project name, "perf.html". It was
  // left the same as to not invalidate user's information.
  const symbolStore = new SymbolStore('perf-html-async-storage', {
    requestSymbolsFromServer: (requests) =>
      requestSymbolsWithCallback(
        'symbol server',
        requests,
        async (path, json) => {
          const response = await fetch(symbolServerUrl + path, {
            body: json,
            method: 'POST',
            mode: 'cors',
            // Use a profiler-specific user agent, so that the symbolication server knows
            // what's making this request.
            headers: new Headers({
              'User-Agent': `FirefoxProfiler/1.0 (+${location.origin})`,
            }),
          });
          return response.json();
        }
      ),

    requestSymbolsFromBrowser: async (requests) => {
      if (browserConnection === null) {
        throw new Error(
          'No connection to the browser, cannot run querySymbolicationApi'
        );
      }

      const bc = browserConnection;
      return requestSymbolsWithCallback(
        'browser',
        requests,
        async (path, json) =>
          JSON.parse(await bc.querySymbolicationApi(path, json))
      );
    },

    requestSymbolTableFromBrowser: async (lib) => {
      if (browserConnection === null) {
        throw new Error(
          'No connection to the browser, cannot obtain symbol tables'
        );
      }

      const { debugName, breakpadId } = lib;
      dispatch(requestingSymbolTable(lib));
      try {
        const symbolTable = await browserConnection.getSymbolTable(
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
  symbolStore: SymbolStore,
  ignoreCache?: boolean
) {
  dispatch(startSymbolicating());

  const completionPromises: Promise<unknown>[] = [];

  await symbolicateProfile(
    profile,
    symbolStore,
    (
      threadIndex: ThreadIndex,
      symbolicationStepInfo: SymbolicationStepInfo
    ) => {
      completionPromises.push(
        new Promise((resolve) => {
          _symbolicationStepQueueSingleton.enqueueSingleSymbolicationStep(
            dispatch,
            threadIndex,
            symbolicationStepInfo,
            () => resolve(undefined)
          );
        })
      );
    },
    ignoreCache
  );

  await Promise.all(completionPromises);

  dispatch(doneSymbolicating());
}

export async function retrievePageFaviconsFromBrowser(
  dispatch: Dispatch,
  pages: PageList,
  browserConnection: BrowserConnection
) {
  const newPages = [...pages];

  const favicons = await browserConnection.getPageFavicons(
    newPages.map((p) => p.url)
  );

  if (newPages.length !== favicons.length) {
    // It appears that an error occurred since the pages and favicons arrays
    // have different lengths. Return early without doing anything. The favicons
    // array will be empty if Firefox doesn't support this webchannel request.
    return;
  }

  // Convert binary favicon data into data urls.
  const faviconDataStringPromises: Array<Promise<string | null>> = favicons.map(
    (faviconData) => {
      if (!faviconData) {
        return Promise.resolve(null);
      }
      return bytesToBase64DataUrl(faviconData.data, faviconData.mimeType);
    }
  );

  const faviconDataUrls = await Promise.all(faviconDataStringPromises);

  for (let index = 0; index < favicons.length; index++) {
    if (faviconDataUrls[index]) {
      newPages[index] = {
        ...newPages[index],
        favicon: faviconDataUrls[index],
      };
    }
  }

  // Once we update the pages, we can also start loading the data urls.
  dispatch(batchLoadDataUrlIcons(faviconDataUrls));
  dispatch({
    type: 'UPDATE_PAGES',
    newPages,
  });
}

// From a BrowserConnectionStatus, this unwraps the included browserConnection
// when possible.
export function unwrapBrowserConnection(
  browserConnectionStatus: BrowserConnectionStatus
): BrowserConnection {
  switch (browserConnectionStatus.status) {
    case 'ESTABLISHED':
      // Good. This is the normal case.
      break;
    // The other cases are error cases.
    case 'NOT_FIREFOX':
      throw new Error('/from-browser only works in Firefox browsers');
    case 'NO_ATTEMPT':
      throw new Error(
        'retrieveProfileFromBrowser should never be called while browserConnectionStatus is NO_ATTEMPT'
      );
    case 'WAITING':
      throw new Error(
        'retrieveProfileFromBrowser should never be called while browserConnectionStatus is WAITING'
      );
    case 'DENIED':
      throw browserConnectionStatus.error;
    case 'TIMED_OUT':
      throw new Error('Timed out when waiting for reply to WebChannel message');
    default:
      throw assertExhaustiveCheck(browserConnectionStatus as never);
  }

  // Now we know that browserConnectionStatus.status === 'ESTABLISHED'.
  return browserConnectionStatus.browserConnection;
}

export function retrieveProfileFromBrowser(
  browserConnectionStatus: BrowserConnectionStatus,
  initialLoad: boolean = false
): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    try {
      const browserConnection = unwrapBrowserConnection(
        browserConnectionStatus
      );

      // XXX update state to show that we're connected to the browser

      dispatch(waitingForProfileFromBrowser());

      const rawGeckoProfile = await browserConnection.getProfile({
        onThirtySecondTimeout: () => {
          dispatch(
            temporaryError(
              new TemporaryError(oneLine`
                We were unable to connect to the browser within thirty seconds.
                This might be because the profile is big or your machine is slower than usual.
                Still waiting...
              `)
            )
          );
        },
      });
      const unpackedProfile =
        await _unpackGeckoProfileFromBrowser(rawGeckoProfile);
      const meta = (unpackedProfile as any).meta;
      if (meta.configuration && meta.configuration.features.includes('power')) {
        try {
          await Promise.all([
            browserConnection
              .getExternalPowerTracks(
                meta.startTime + meta.profilingStartTime,
                meta.startTime + meta.profilingEndTime
              )
              .then((tracks) =>
                insertExternalPowerCountersIntoProfile(
                  tracks as any,
                  unpackedProfile as any
                )
              ),
            browserConnection
              .getExternalMarkers(
                meta.startTime + meta.profilingStartTime,
                meta.startTime + meta.profilingEndTime
              )
              .then((markers) =>
                insertExternalMarkersIntoProfile(
                  markers,
                  unpackedProfile as any
                )
              ),
          ]);
        } catch (error) {
          // Make failures in adding external data non-fatal.
          console.error(error);
        }
      }
      const profile = processGeckoProfile(unpackedProfile as any);
      await dispatch(loadProfile(profile, { browserConnection }, initialLoad));
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
    profileUrl: profileUrl ?? null,
  };
}

export function receiveZipFile(zip: JSZip): Action {
  return {
    type: 'RECEIVE_ZIP_FILE',
    zip: zip as any,
  };
}

export function temporaryError(error: TemporaryError): Action {
  return {
    type: 'TEMPORARY_ERROR',
    error,
  };
}

function _wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function _loadProbablyFailedDueToSafariLocalhostHTTPRestriction(
  url: string,
  error: Error
): boolean {
  if (!navigator.userAgent.match(/Safari\/\d+\.\d+/)) {
    return false;
  }
  // Check if Safari considers this mixed content.
  const parsedUrl = new URL(url);
  return (
    error.name === 'TypeError' &&
    parsedUrl.protocol === 'http:' &&
    isLocalURL(parsedUrl) &&
    location.protocol === 'https:'
  );
}

class SafariLocalhostHTTPLoadError extends Error {
  override name = 'SafariLocalhostHTTPLoadError';
}

type FetchProfileArgs = {
  url: string;
  onTemporaryError: (param: TemporaryError) => void;
  // Allow tests to capture the reported error, but normally use console.error.
  reportError?: (...data: Array<any>) => void;
};

type ProfileOrZip =
  | { responseType: 'PROFILE'; profile: unknown }
  | { responseType: 'ZIP'; zip: JSZip };

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
    let response;
    try {
      response = await fetch(url);
    } catch (e) {
      // Case 1: Exception.
      if (_loadProbablyFailedDueToSafariLocalhostHTTPRestriction(url, e)) {
        throw new SafariLocalhostHTTPLoadError();
      }
      throw e;
    }

    // Case 2: successful answer.
    if (response.ok) {
      return _extractProfileOrZipFromResponse(url, response, reportError);
    }

    // case 3: unrecoverable error.
    if (response.status !== 403) {
      throw new Error(oneLine`
          Could not fetch the profile on remote server.
          Response was: ${response.status} ${response.statusText}.
        `);
    }

    // case 4: 403 errors can be transient while a profile is uploaded.

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
        responseType: 'ZIP',
        zip: await _extractZipFromResponse(response, reportError),
      };
    case 'application/json':
    case null:
      // The content type is null if it is unknown, or an unsupported type. Go ahead
      // and try to process it as a profile.
      return {
        responseType: 'PROFILE',
        profile: await _extractJsonFromResponse(
          response,
          reportError,
          contentType
        ),
      };
    default:
      throw assertExhaustiveCheck(contentType);
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
  // Workaround for https://github.com/Stuk/jszip/issues/941
  // When running this code in tests, `buffer` doesn't inherits from _this_
  // realm's ArrayBuffer object, and this breaks JSZip which doesn't account for
  // this case. We workaround the issue by wrapping the buffer in an Uint8Array
  // that comes from this realm.
  const typedBuffer = new Uint8Array(buffer);
  try {
    const zip = await JSZip.loadAsync(typedBuffer);
    // Catch the error if unable to load the zip.
    return zip;
  } catch (error) {
    const message = 'Unable to open the archive file.';
    reportError(message);
    reportError('Error:', error);
    reportError('Fetch response:', response);
    throw new Error(
      `${message} The full error information has been printed out to the DevTool’s console.`
    );
  }
}

/**
 * Parse JSON from an optionally gzipped array buffer.
 */
async function _extractJsonFromArrayBuffer(
  arrayBuffer: ArrayBuffer
): Promise<unknown> {
  let profileBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(arrayBuffer);
  // Check for the gzip magic number in the header.
  if (isGzip(profileBytes)) {
    profileBytes = await decompress(profileBytes);
  }

  const textDecoder = new TextDecoder();
  return JSON.parse(textDecoder.decode(profileBytes));
}

/**
 * Don't trust third party responses, try and handle a variety of responses gracefully.
 */
async function _extractJsonFromResponse(
  response: Response,
  reportError: (...data: Array<any>) => void,
  fileType: 'application/json' | null
): Promise<unknown> {
  let arrayBuffer: ArrayBuffer | null = null;
  try {
    // await before returning so that we can catch JSON parse errors.
    arrayBuffer = await response.arrayBuffer();
    return await _extractJsonFromArrayBuffer(arrayBuffer);
  } catch (error) {
    // Change the error message depending on the circumstance:
    let message;
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      message = 'The network request to load the profile was aborted.';
    } else if (fileType === 'application/json') {
      message = 'The profile’s JSON could not be decoded.';
    } else if (fileType === null && arrayBuffer !== null) {
      // If the content type is not specified, use a raw array buffer
      // to fallback to other supported profile formats.
      return arrayBuffer;
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
  return async function (dispatch) {
    dispatch(waitingForProfileFromUrl(profileUrl));

    try {
      const response: ProfileOrZip = await _fetchProfile({
        url: profileUrl,
        onTemporaryError: (e: TemporaryError) => {
          dispatch(temporaryError(e));
        },
      });

      switch (response.responseType) {
        case 'PROFILE': {
          const serializedProfile = response.profile;
          const profile = await unserializeProfileOfArbitraryFormat(
            serializedProfile,
            profileUrl
          );
          if (profile === undefined) {
            throw new Error('Unable to parse the profile.');
          }

          await dispatch(loadProfile(profile, {}, initialLoad));
          break;
        }
        case 'ZIP': {
          const zip = response.zip;
          await dispatch(receiveZipFile(zip));
          break;
        }
        default:
          throw assertExhaustiveCheck(
            response as never,
            'Expected to receive an archive or profile from _fetchProfile.'
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
    reader.onload = () => resolve(reader.result as any);
    reader.onerror = () => reject(reader.error);
  });

  return {
    asText(): Promise<string> {
      reader.readAsText(input);
      return promise as Promise<string>;
    },

    asArrayBuffer(): Promise<ArrayBuffer> {
      reader.readAsArrayBuffer(input);
      return promise as Promise<ArrayBuffer>;
    },
  };
}

/**
 * Multiple file formats are supported. Look at the file type and try and
 * parse the contents according to its type.
 */
export function retrieveProfileFromFile(
  file: File,
  browserConnection: BrowserConnection | null,
  // Allow tests to inject a custom file reader to bypass the DOM APIs.
  fileReader: typeof _fileReader = _fileReader
): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    // Notify the UI that we are loading and parsing a profile. This can take
    // a little bit of time.
    dispatch(waitingForProfileFromFile());

    try {
      if (_deduceContentType(file.name, file.type) === 'application/zip') {
        // Open a zip file in the zip file viewer
        const buffer = await fileReader(file).asArrayBuffer();
        const zip = await JSZip.loadAsync(buffer);
        await dispatch(receiveZipFile(zip));
      } else {
        // Profile files can have file names with uncommon extensions
        // (eg .profile). So we can't rely on the mime type to decide how to
        // handle them.
        const arrayBuffer = await fileReader(file).asArrayBuffer();

        const profile = await unserializeProfileOfArbitraryFormat(
          arrayBuffer,
          file.name
        );
        if (profile === undefined) {
          throw new Error('Unable to parse the profile.');
        }

        await withHistoryReplaceStateAsync(async () => {
          await dispatch(viewProfile(profile, { browserConnection }));
        });
      }
    } catch (error) {
      dispatch(fatalError(error));
    }
  };
}

/**
 * View a profile that was injected via a "postMessage". A website can
 * inject a profile to the profiler.
 */
export function viewProfileFromPostMessage(
  rawProfile: any
): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    try {
      const profile = await unserializeProfileOfArbitraryFormat(rawProfile);
      /* istanbul ignore if */
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      await withHistoryReplaceStateAsync(async () => {
        await dispatch(viewProfile(profile));
      });
    } catch (error) {
      /* istanbul ignore next */
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
  return async (dispatch) => {
    dispatch(waitingForProfileFromUrl());

    try {
      // First we get a state from each URL. From these states we'll get all the
      // data we need to fetch and process the profiles.
      const profileStates = await Promise.all(
        profileViewUrls.map(async (url) => {
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

      // Then we retrieve the profiles from the online store, and unserialize
      // and process them if needed.
      const promises = profileStates.map(
        async ({ dataSource, hash, profileUrl }) => {
          switch (dataSource) {
            case 'public':
              // Use a URL from the public store.
              profileUrl = getProfileUrlForHash(hash);
              break;
            case 'from-url':
              // Use the profile URL in the decoded state, decoded from the input URL.
              break;
            default:
              throw new Error(
                'Only public uploaded profiles are supported by the comparison function.'
              );
          }
          const response: ProfileOrZip = await _fetchProfile({
            url: profileUrl,
            onTemporaryError: (e: TemporaryError) => {
              dispatch(temporaryError(e));
            },
          });
          if (response.responseType !== 'PROFILE') {
            throw new Error('Expected to receive a profile from _fetchProfile');
          }
          const serializedProfile = response.profile;

          const profile =
            unserializeProfileOfArbitraryFormat(serializedProfile);
          return profile;
        }
      );

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
export function retrieveProfileForRawUrl(
  location: Location,
  browserConnectionStatus?: BrowserConnectionStatus
): ThunkAction<Promise<Profile | null>> {
  return async (dispatch, getState) => {
    const pathParts = location.pathname.split('/').filter((d) => d);
    let possibleDataSource = pathParts[0];

    // Treat from-addon as from-browser, for compatibility with Firefox < 93.
    if (possibleDataSource === 'from-addon') {
      possibleDataSource = 'from-browser';
    }

    let dataSource = ensureIsValidDataSource(possibleDataSource);
    if (dataSource === 'from-file') {
      // Redirect to 'none' if `dataSource` is 'from-file' since initial urls can't
      // be 'from-file' and needs to be redirected to home page.
      dataSource = 'none';
    }
    dispatch(setDataSource(dataSource));

    switch (dataSource) {
      case 'from-browser':
        if (browserConnectionStatus === undefined) {
          throw new Error(
            'Error: all callers of this function should supply a browserConnectionStatus argument for from-browser'
          );
        }
        await dispatch(
          retrieveProfileFromBrowser(browserConnectionStatus, true)
        );
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
          await dispatch(
            retrieveProfilesToCompare(
              query.profiles.filter((p): p is string => p !== null),
              true
            )
          );
        }
        break;
      }
      case 'from-post-message': {
        window.addEventListener('message', (event) => {
          const { data } = event;
          console.log(`Received postMessage`, data);
          /* istanbul ignore if */
          if (!data || typeof data !== 'object') {
            return;
          }
          switch (data.name) {
            case 'inject-profile':
              dispatch(viewProfileFromPostMessage(data.profile));
              break;
            case 'ready:request': {
              // The "inject-profile" event could be coming from a variety of locations.
              // It could come from a `window.open` call on another page. It could come
              // from an addon. It could come from being embedded in an iframe. In order
              // to generically support these cases allow the opener to poll for the
              // "ready:response" message.
              console.log(
                'Responding via postMessage that the profiler is ready.'
              );
              const otherWindow = event.source ?? window;
              (otherWindow as any).postMessage({ name: 'ready:response' }, '*');
              break;
            }
            default:
              /* istanbul ignore next */
              console.log('Unknown post message', data);
          }
        });
        break;
      }
      case 'uploaded-recordings':
      case 'none':
      case 'from-file' as any:
      case 'local':
      case 'unpublished':
        // There is no profile to download for these datasources.
        break;
      default:
        throw assertExhaustiveCheck(
          dataSource,
          `Unknown dataSource ${dataSource}.`
        );
    }

    // Profile may be null if the response was a zip file.
    return getProfileOrNull(getState());
  };
}

/**
 * Change the selected browser tab filter for the profile.
 * TabID here means the unique ID for a give browser tab and corresponds to
 * multiple pages in the `profile.pages` array.
 * If it's null it will undo the filter and will show the full profile.
 */
export function changeTabFilter(tabID: TabID | null): ThunkAction<void> {
  return (dispatch, getState) => {
    const profile = getProfile(getState());
    const tabToThreadIndexesMap = getTabToThreadIndexesMap(getState());
    // Compute the global tracks, they will be filtered by tabID if it's
    // non-null and will not filter if it's null.
    const globalTracks = computeGlobalTracks(
      profile,
      tabID,
      tabToThreadIndexesMap
    );
    const localTracksByPid = computeLocalTracksByPid(profile, globalTracks);

    const threadActivityScores = getThreadActivityScores(getState());
    const legacyThreadOrder = getLegacyThreadOrder(getState());
    const globalTrackOrder = initializeGlobalTrackOrder(
      globalTracks,
      null, // Passing null to urlGlobalTrackOrder to reinitilize it.
      legacyThreadOrder,
      threadActivityScores
    );
    const localTrackOrderByPid = initializeLocalTrackOrderByPid(
      null, // Passing null to urlTrackOrderByPid to reinitilize it.
      localTracksByPid,
      legacyThreadOrder,
      profile
    );

    const tracksWithOrder = {
      globalTracks,
      globalTrackOrder,
      localTracksByPid,
      localTrackOrderByPid,
    };

    let hiddenTracks = null;

    // For non-initial profile loads, initialize the set of hidden tracks from
    // information in the URL.
    const legacyHiddenThreads = getLegacyHiddenThreads(getState());
    if (legacyHiddenThreads !== null) {
      hiddenTracks = tryInitializeHiddenTracksLegacy(
        tracksWithOrder,
        legacyHiddenThreads,
        profile
      );
    }
    if (hiddenTracks === null) {
      // Compute a default set of hidden tracks.
      // This is the case for the initial profile load.
      // We also get here if the URL info was ignored, for example if
      // respecting it would have caused all threads to become hidden.
      const includeParentProcessThreads = tabID === null;
      hiddenTracks = computeDefaultHiddenTracks(
        tracksWithOrder,
        profile,
        threadActivityScores,
        // Only include the parent process if there is no tab filter applied.
        includeParentProcessThreads
      );
    }

    const selectedThreadIndexes = initializeSelectedThreadIndex(
      null, // maybeSelectedThreadIndexes
      getVisibleThreads(tracksWithOrder, hiddenTracks),
      profile,
      threadActivityScores
    );

    // If the currently selected tab is only visible when the selected track
    // has samples, verify that the selected track has samples, and if not
    // select the marker chart.
    let selectedTab = getSelectedTab(getState());
    if (tabsShowingSampleData.includes(selectedTab)) {
      let hasSamples = false;
      for (const threadIndex of selectedThreadIndexes) {
        const thread = profile.threads[threadIndex];
        const { samples, jsAllocations, nativeAllocations } = thread;
        hasSamples = [samples, jsAllocations, nativeAllocations].some((table) =>
          hasUsefulSamples(table?.stack, thread, profile.shared)
        );
        if (hasSamples) {
          break;
        }
      }
      if (!hasSamples) {
        selectedTab = 'marker-chart';
      }
    }

    dispatch({
      type: 'CHANGE_TAB_FILTER',
      tabID,
      selectedThreadIndexes,
      selectedTab,
      globalTracks,
      globalTrackOrder,
      localTracksByPid,
      localTrackOrderByPid,
      ...hiddenTracks,
    });
  };
}
