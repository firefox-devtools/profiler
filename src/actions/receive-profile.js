/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';
import {
  processProfile,
  unserializeProfileOfArbitraryFormat,
} from '../profile-logic/process-profile';
import { SymbolStore } from '../profile-logic/symbol-store';
import { symbolicateProfile } from '../profile-logic/symbolication';
import * as MozillaSymbolicationAPI from '../profile-logic/mozilla-symbolication-api';
import { decompress } from '../utils/gz';
import { TemporaryError } from '../utils/errors';
import JSZip from 'jszip';
import {
  getDataSource,
  getSelectedThreadIndexOrNull,
  getGlobalTrackOrder,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getLocalTrackOrderByPid,
  getLegacyThreadOrder,
  getLegacyHiddenThreads,
} from '../reducers/url-state';
import {
  initializeLocalTrackOrderByPid,
  initializeHiddenLocalTracksByPid,
  computeLocalTracksByPid,
  computeGlobalTracks,
  initializeGlobalTrackOrder,
  initializeSelectedThreadIndex,
  initializeHiddenGlobalTracks,
  getVisibleThreads,
} from '../profile-logic/tracks';

import type {
  FunctionsUpdatePerThread,
  FuncToFuncMap,
  RequestedLib,
} from '../types/actions';
import type { Action, ThunkAction, Dispatch } from '../types/store';
import type {
  Profile,
  ThreadIndex,
  IndexIntoFuncTable,
} from '../types/profile';

/**
 * This file collects all the actions that are used for receiving the profile in the
 * client and getting it into the processed format.
 */

export function waitingForProfileFromAddon(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_ADDON',
  };
}

/**
 * Call this function once the profile has been fetched and pre-processed from whatever
 * source (url, addon, file, etc). This function will take the view information from the
 * URL, such as hiding and sorting information, and it will validate it against the
 * profile. If there is no pre-existing view information, this function will compute the
 * defaults. There is a decent amount of complexity to making all of these decisions,
 * which has been collected in a bunch of functions in the src/profile-logic/tracks.js
 * file.
 */
export function viewProfile(
  profile: Profile,
  pathInZipFile: ?string
): ThunkAction<void> {
  return (dispatch, getState) => {
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

    // The selectedThreadIndex is only null for new profiles that haven't
    // been seen before. If it's non-null, then there is profile view information
    // encoded into the URL.
    let selectedThreadIndex = getSelectedThreadIndexOrNull(getState());
    const hasUrlInfo = selectedThreadIndex !== null;

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

    selectedThreadIndex = initializeSelectedThreadIndex(
      selectedThreadIndex,
      visibleThreadIndexes,
      profile
    );

    dispatch({
      type: 'VIEW_PROFILE',
      profile,
      selectedThreadIndex,
      globalTracks,
      globalTrackOrder,
      hiddenGlobalTracks,
      localTracksByPid,
      hiddenLocalTracksByPid,
      localTrackOrderByPid,
      pathInZipFile,
      dataSource: getDataSource(getState()),
    });
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

export function coalescedFunctionsUpdate(
  functionsUpdatePerThread: FunctionsUpdatePerThread
): Action {
  return {
    type: 'COALESCED_FUNCTIONS_UPDATE',
    functionsUpdatePerThread,
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

class ColascedFunctionsUpdateDispatcher {
  _updates: FunctionsUpdatePerThread;
  _requestedUpdate: boolean;
  _requestIdleTimeout: { timeout: number };
  scheduledUpdatesDone: Promise<void>;

  constructor() {
    this._updates = {};
    this._requestedUpdate = false;
    this._requestIdleTimeout = { timeout: 2000 };
    this.scheduledUpdatesDone = Promise.resolve();
  }

  _scheduleUpdate(dispatch) {
    // Only request an update if one hasn't already been schedule.
    if (!this._requestedUpdate) {
      // Let any consumers of this class be able to know when all scheduled updates
      // are done.
      this.scheduledUpdatesDone = new Promise(resolve => {
        requestIdleCallbackPolyfill(() => {
          this._dispatchUpdate(dispatch);
          resolve();
        }, this._requestIdleTimeout);
      });
      this._requestedUpdate = true;
    }
  }

  _dispatchUpdate(dispatch) {
    const updates = this._updates;
    this._updates = {};
    this._requestedUpdate = false;
    dispatch(coalescedFunctionsUpdate(updates));
  }

  mergeFunctions(
    dispatch: Dispatch,
    threadIndex: ThreadIndex,
    oldFuncToNewFuncMap: FuncToFuncMap
  ) {
    this._scheduleUpdate(dispatch);
    if (!this._updates[threadIndex]) {
      this._updates[threadIndex] = {
        oldFuncToNewFuncMap,
        funcIndices: [],
        funcNames: [],
      };
    } else {
      for (const oldFunc of oldFuncToNewFuncMap.keys()) {
        const funcIndex = oldFuncToNewFuncMap.get(oldFunc);
        if (funcIndex === undefined) {
          throw new Error(
            'Unable to merge functions together, an undefined funcIndex was returned.'
          );
        }
        this._updates[threadIndex].oldFuncToNewFuncMap.set(oldFunc, funcIndex);
      }
    }
  }

  assignFunctionNames(dispatch, threadIndex, funcIndices, funcNames) {
    this._scheduleUpdate(dispatch);
    if (!this._updates[threadIndex]) {
      this._updates[threadIndex] = {
        funcIndices,
        funcNames,
        oldFuncToNewFuncMap: new Map(),
      };
    } else {
      this._updates[threadIndex].funcIndices = this._updates[
        threadIndex
      ].funcIndices.concat(funcIndices);
      this._updates[threadIndex].funcNames = this._updates[
        threadIndex
      ].funcNames.concat(funcNames);
    }
  }
}

const gCoalescedFunctionsUpdateDispatcher = new ColascedFunctionsUpdateDispatcher();

export function mergeFunctions(
  threadIndex: ThreadIndex,
  oldFuncToNewFuncMap: FuncToFuncMap
): ThunkAction<void> {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.mergeFunctions(
      dispatch,
      threadIndex,
      oldFuncToNewFuncMap
    );
  };
}

export function assignFunctionNames(
  threadIndex: ThreadIndex,
  funcIndices: IndexIntoFuncTable[],
  funcNames: string[]
): ThunkAction<void> {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.assignFunctionNames(
      dispatch,
      threadIndex,
      funcIndices,
      funcNames
    );
  };
}

/**
 * If the profile object we got from the add-on is an ArrayBuffer, convert it
 * to a gecko profile object by parsing the JSON.
 */
function _unpackGeckoProfileFromAddon(profile) {
  if (profile instanceof ArrayBuffer) {
    const textDecoder = new TextDecoder();
    return JSON.parse(textDecoder.decode(profile));
  }
  return profile;
}

async function getProfileFromAddon(dispatch, geckoProfiler) {
  dispatch(waitingForProfileFromAddon());

  // XXX update state to show that we're connected to the profiler addon
  const rawGeckoProfile = await geckoProfiler.getProfile();
  const profile = processProfile(_unpackGeckoProfileFromAddon(rawGeckoProfile));
  dispatch(viewProfile(profile));

  return profile;
}

async function getSymbolStore(dispatch, geckoProfiler) {
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
  await symbolicateProfile(profile, symbolStore, {
    onMergeFunctions: (
      threadIndex: ThreadIndex,
      oldFuncToNewFuncMap: FuncToFuncMap
    ) => {
      dispatch(mergeFunctions(threadIndex, oldFuncToNewFuncMap));
    },
    onGotFuncNames: (
      threadIndex: ThreadIndex,
      funcIndices: IndexIntoFuncTable[],
      funcNames: string[]
    ) => {
      dispatch(assignFunctionNames(threadIndex, funcIndices, funcNames));
    },
  });

  await gCoalescedFunctionsUpdateDispatcher.scheduledUpdatesDone;

  dispatch(doneSymbolicating());
}

export function fatalError(error: Error) {
  return {
    type: 'FATAL_ERROR',
    error,
  };
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

      const [profile, symbolStore] = await Promise.all([
        getProfileFromAddon(dispatch, geckoProfiler),
        getSymbolStore(dispatch, geckoProfiler),
      ]);

      await doSymbolicateProfile(dispatch, profile, symbolStore);
    } catch (error) {
      dispatch(fatalError(error));
      throw error;
    }
  };
}

export function waitingForProfileFromStore(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_STORE',
  };
}

export function waitingForProfileFromUrl(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_URL',
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

function _wait(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

type FetchProfileArgs = {
  url: string,
  onTemporaryError: TemporaryError => void,
  // Allow tests to capture the reported error, but normally use console.error.
  reportError?: Function,
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
  contentType: string
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
  reportError: Function
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
  reportError: Function
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
  reportError: Function,
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
    if (fileType === 'application/json') {
      message = 'The profile’s JSON could not be decoded.';
    } else {
      message = oneLine`
        The profile could not be decoded. This does not look like a supported file
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

export function retrieveProfileFromStore(
  hash: string
): ThunkAction<Promise<void>> {
  return retrieveProfileOrZipFromUrl(
    `https://profile-store.commondatastorage.googleapis.com/${hash}`
  );
}

/**
 * Runs a fetch on a URL, and downloads the file. If it's JSON, then it attempts
 * to process the profile. If it's a zip file, it tries to unzip it, and save it
 * into the store so that the user can then choose which file to load.
 */
export function retrieveProfileOrZipFromUrl(
  profileUrl: string
): ThunkAction<Promise<void>> {
  return async function(dispatch) {
    dispatch(waitingForProfileFromUrl());

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
        const profile = unserializeProfileOfArbitraryFormat(serializedProfile);
        if (profile === undefined) {
          throw new Error('Unable to parse the profile.');
        }

        dispatch(viewProfile(profile));
      } else if (zip) {
        dispatch(receiveZipFile(zip));
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

function _fileReader(input: File): * {
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
            const profile = unserializeProfileOfArbitraryFormat(text);
            if (profile === undefined) {
              throw new Error('Unable to parse the profile.');
            }

            dispatch(viewProfile(profile));
          }
          break;
        case 'application/zip':
          // Open a zip file in the zip file viewer
          {
            const buffer = await fileReader(file).asArrayBuffer();
            const zip = await JSZip.loadAsync(buffer);
            dispatch(receiveZipFile(zip));
          }
          break;
        default: {
          // Plain uncompressed profile files can have file names with uncommon
          // extensions (eg .profile). So we can't rely on the mime type to
          // decide how to handle them. We'll try to parse them as a plain JSON
          // file.
          const text = await fileReader(file).asText();
          const profile = unserializeProfileOfArbitraryFormat(text);
          if (profile === undefined) {
            throw new Error('Unable to parse the profile.');
          }

          dispatch(viewProfile(profile));
        }
      }
    } catch (error) {
      dispatch(fatalError(error));
    }
  };
}
