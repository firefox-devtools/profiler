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
import { decompress } from '../utils/gz';
import { TemporaryError } from '../utils/errors';
import JSZip from 'jszip';

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

export function viewProfile(profile: Profile): Action {
  return {
    type: 'VIEW_PROFILE',
    profile,
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
    requestSymbolTable: async (debugName, breakpadId) => {
      const requestedLib = { debugName, breakpadId };
      dispatch(requestingSymbolTable(requestedLib));
      try {
        const symbolTable = await geckoProfiler.getSymbolTable(
          debugName,
          breakpadId
        );
        dispatch(receivedSymbolTableReply(requestedLib));
        return symbolTable;
      } catch (error) {
        dispatch(receivedSymbolTableReply(requestedLib));
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

export function temporaryErrorReceivingProfileFromAddon(error: TemporaryError) {
  return {
    type: 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_ADDON',
    error,
  };
}

export function fatalErrorReceivingProfileFromAddon(error: Error) {
  return {
    type: 'FATAL_ERROR_RECEIVING_PROFILE_FROM_ADDON',
    error,
  };
}

export function retrieveProfileFromAddon(): ThunkAction<Promise<void>> {
  return async dispatch => {
    try {
      const timeoutId = setTimeout(() => {
        dispatch(
          temporaryErrorReceivingProfileFromAddon(
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
      dispatch(fatalErrorReceivingProfileFromAddon(error));
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

export function temporaryErrorReceivingProfileFromStore(
  error: TemporaryError
): Action {
  return {
    type: 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_STORE',
    error,
  };
}

export function fatalErrorReceivingProfileFromStore(error: Error): Action {
  return {
    type: 'FATAL_ERROR_RECEIVING_PROFILE_FROM_STORE',
    error,
  };
}

export function temporaryErrorReceivingProfileFromUrl(
  error: TemporaryError
): Action {
  return {
    type: 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_URL',
    error,
  };
}

export function fatalErrorReceivingProfileFromUrl(error: Error): Action {
  return {
    type: 'FATAL_ERROR_RECEIVING_PROFILE_FROM_URL',
    error,
  };
}

function _wait(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

type FetchProfileArgs = {
  url: string,
  onTemporaryError: TemporaryError => void,
  reportError?: (...args: any[]) => void,
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
): Promise<{
  profile?: any,
  zip?: JSZip,
}> {
  const MAX_WAIT_SECONDS = 10;
  let i = 0;
  const { url, onTemporaryError } = args;
  // Allow tests to capture the reported error, but normally use console.error.
  const reportError = args.reportError || console.error;
  const moreInfoMessage =
    'The full error information has been printed out to the DevTool’s console.';

  while (true) {
    const response = await fetch(url);
    // Case 1: successful answer.
    if (response.ok) {
      const contentType = response.headers.get('content-type');

      // We're getting information from third parties, they may not serve them correctly.
      // Try to do the right thing for them to reduce errors.
      const isZipContentType = contentType === 'application/zip';
      const isJsonContentType = contentType === 'application/json';
      const isUnknownContentType = !isZipContentType && !isJsonContentType;
      const hasZipEnding = !!url.match(/\.zip$/);
      const hasJsonEnding = !!url.match(/\.json/);

      if (isZipContentType || (isUnknownContentType && hasZipEnding)) {
        // Probably a zip file.
        const buffer = await response.arrayBuffer();
        try {
          return {
            zip: await JSZip.loadAsync(buffer),
          };
        } catch (error) {
          const message = 'Unable to unzip the zip file.';
          reportError(message);
          reportError('Error:', error);
          reportError('Fetch response:', response);
          throw new Error(`${message} ${moreInfoMessage}`);
        }
      } else {
        try {
          // Don't check the content-type, but attempt to parse the response as JSON.
          return {
            profile: await response.json(),
          };
        } catch (error) {
          // Change the error message depending on the circumstance:
          let message;
          if (isJsonContentType) {
            message = 'The profile’s JSON could not be decoded.';
          } else if (hasJsonEnding) {
            message = oneLine`
              The profile’s JSON could not be decoded. The file was not sent with the
              "application/json" content type, but it did have a .json file ending.
              Are you sure it was actually JSON?
            `;
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

          throw new Error(`${message} ${moreInfoMessage}`);
        }
      }
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

export function retrieveProfileFromStore(
  hash: string
): ThunkAction<Promise<void>> {
  return async function(dispatch) {
    dispatch(waitingForProfileFromStore());

    try {
      const serializedProfile = await _fetchProfile({
        url: `https://profile-store.commondatastorage.googleapis.com/${hash}`,
        onTemporaryError: (e: TemporaryError) => {
          dispatch(temporaryErrorReceivingProfileFromStore(e));
        },
      });

      const profile = unserializeProfileOfArbitraryFormat(serializedProfile);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      dispatch(viewProfile(profile));
    } catch (error) {
      dispatch(fatalErrorReceivingProfileFromStore(error));
    }
  };
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
          dispatch(temporaryErrorReceivingProfileFromUrl(e));
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
      dispatch(fatalErrorReceivingProfileFromUrl(error));
    }
  };
}

export function waitingForProfileFromFile(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_FILE',
  };
}

export function errorReceivingProfileFromFile(error: Error): Action {
  return {
    type: 'ERROR_RECEIVING_PROFILE_FROM_FILE',
    error,
  };
}

function _fileReader(input) {
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

export function retrieveProfileFromFile(
  file: File
): ThunkAction<Promise<void>> {
  return async dispatch => {
    dispatch(waitingForProfileFromFile());

    try {
      const text = await _fileReader(file).asText();
      const profile = unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      dispatch(viewProfile(profile));
      return;
    } catch (e) {
      // continuing the function normally, as we return in the try block above;
    }

    try {
      const buffer = await _fileReader(file).asArrayBuffer();
      const arrayBuffer = new Uint8Array(buffer);
      const decompressedArrayBuffer = await decompress(arrayBuffer);
      const textDecoder = new TextDecoder();
      const text = await textDecoder.decode(decompressedArrayBuffer);
      const profile = unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      dispatch(viewProfile(profile));
    } catch (error) {
      dispatch(errorReceivingProfileFromFile(error));
    }
  };
}
