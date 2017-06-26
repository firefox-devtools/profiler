/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';
import { getProfile } from '../reducers/profile-view';
import { processProfile, unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import { SymbolStore } from '../profile-logic/symbol-store';
import { symbolicateProfile } from '../profile-logic/symbolication';
import { decompress } from '../utils/gz';
import { getTimeRangeIncludingAllThreads } from '../profile-logic/profile-data';
import { TemporaryError } from '../utils/errors';

import type { FunctionsUpdatePerThread, FuncToFuncMap, RequestedLib } from '../types/actions';
import type { Action, ThunkAction, Dispatch } from '../types/store';
import type { Profile, ThreadIndex, IndexIntoFuncTable } from '../types/profile';

/**
 * This file collects all the actions that are used for receiving the profile in the
 * client and getting it into the processed format.
 */

export function waitingForProfileFromAddon(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_ADDON',
  };
}

export function receiveProfileFromAddon(profile: Profile): Action {
  return {
    type: 'RECEIVE_PROFILE_FROM_ADDON',
    profile: profile,
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

export function doneSymbolicating(): ThunkAction<void> {
  return function (dispatch, getState) {
    dispatch({ type: 'DONE_SYMBOLICATING' });

    // TODO - Do not use selectors here.
    dispatch(({
      toWorker: true,
      type: 'PROFILE_PROCESSED',
      profile: getProfile(getState()),
    }: Action));

    dispatch(({
      toWorker: true,
      type: 'SUMMARIZE_PROFILE',
    }: Action));
  };
}

export function coalescedFunctionsUpdate(functionsUpdatePerThread: FunctionsUpdatePerThread): Action {
  return {
    type: 'COALESCED_FUNCTIONS_UPDATE',
    functionsUpdatePerThread,
  };
}

const requestIdleCallbackPolyfill: typeof requestIdleCallback =
  typeof window === 'object' && window.requestIdleCallback
    ? window.requestIdleCallback
    : callback => setTimeout(callback, 0);

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

  mergeFunctions(dispatch: Dispatch, threadIndex: ThreadIndex, oldFuncToNewFuncMap: FuncToFuncMap) {
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
          throw new Error('Unable to merge functions together, an undefined funcIndex was returned.');
        }
        this._updates[threadIndex].oldFuncToNewFuncMap.set(oldFunc, funcIndex);
      }
    }
  }

  assignFunctionNames(dispatch, threadIndex, funcIndices, funcNames) {
    this._scheduleUpdate(dispatch);
    if (!this._updates[threadIndex]) {
      this._updates[threadIndex] = {
        funcIndices, funcNames,
        oldFuncToNewFuncMap: new Map(),
      };
    } else {
      this._updates[threadIndex].funcIndices = this._updates[threadIndex].funcIndices.concat(funcIndices);
      this._updates[threadIndex].funcNames = this._updates[threadIndex].funcNames.concat(funcNames);
    }
  }
}

const gCoalescedFunctionsUpdateDispatcher = new ColascedFunctionsUpdateDispatcher();

export function mergeFunctions(
  threadIndex: ThreadIndex,
  oldFuncToNewFuncMap: FuncToFuncMap
): ThunkAction<void> {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.mergeFunctions(dispatch, threadIndex, oldFuncToNewFuncMap);
  };
}

export function assignFunctionNames(
  threadIndex: ThreadIndex,
  funcIndices: IndexIntoFuncTable[],
  funcNames: string[]
): ThunkAction<void> {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.assignFunctionNames(dispatch, threadIndex, funcIndices, funcNames);
  };
}

export function assignTaskTracerNames(addressIndices: number[], symbolNames: string[]): Action {
  return {
    type: 'ASSIGN_TASK_TRACER_NAMES',
    addressIndices, symbolNames,
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
  dispatch(receiveProfileFromAddon(profile));

  return profile;
}

async function getSymbolStore(dispatch, geckoProfiler) {
  const symbolStore = new SymbolStore('perf-html-async-storage', {
    requestSymbolTable: async (debugName, breakpadId) => {
      const requestedLib = { debugName, breakpadId };
      dispatch(requestingSymbolTable(requestedLib));
      try {
        const symbolTable = await geckoProfiler.getSymbolTable(debugName, breakpadId);
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

async function doSymbolicateProfile(dispatch: Dispatch, profile: Profile, symbolStore: SymbolStore) {
  dispatch(startSymbolicating());
  await symbolicateProfile(profile, symbolStore, {
    onMergeFunctions: (threadIndex: ThreadIndex, oldFuncToNewFuncMap: FuncToFuncMap) => {
      dispatch(mergeFunctions(threadIndex, oldFuncToNewFuncMap));
    },
    onGotFuncNames: (threadIndex: ThreadIndex, funcIndices: IndexIntoFuncTable[], funcNames: string[]) => {
      dispatch(assignFunctionNames(threadIndex, funcIndices, funcNames));
    },
    onGotTaskTracerNames: (addressIndices, symbolNames) => {
      dispatch(assignTaskTracerNames(addressIndices, symbolNames));
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
        dispatch(temporaryErrorReceivingProfileFromAddon(
          new TemporaryError(oneLine`
            We were unable to connect to the Gecko profiler add-on within thirty seconds.
            This might be because the profile is big or your machine is slower than usual.
            Still waiting...
          `)
        ));
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

export function receiveProfileFromStore(profile: Profile): ThunkAction<void> {
  return dispatch => {
    dispatch({
      type: 'RECEIVE_PROFILE_FROM_STORE',
      profile,
    });
    dispatch({
      toWorker: true,
      type: 'PROFILE_PROCESSED',
      profile: profile,
    });
    dispatch({
      toWorker: true,
      type: 'SUMMARIZE_PROFILE',
    });
  };
}

export function receiveProfileFromUrl(profile: Profile): ThunkAction<void> {
  return dispatch => {
    dispatch({
      type: 'RECEIVE_PROFILE_FROM_URL',
      profile,
    });
    dispatch({
      toWorker: true,
      type: 'PROFILE_PROCESSED',
      profile: profile,
    });
    dispatch({
      toWorker: true,
      type: 'SUMMARIZE_PROFILE',
    });
  };
}

export function temporaryErrorReceivingProfileFromStore(error: TemporaryError): Action {
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

export function temporaryErrorReceivingProfileFromUrl(error: TemporaryError): Action {
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
};

/**
 * Tries to fetch a profile on `url`. If the profile is not found,
 * `onTemporaryError` is called with an appropriate error, we wait 1 second, and
 * then tries again. If we still can't find the profile after 11 tries, the
 * returned promise is rejected with a fatal error.
 * If we can retrieve the profile properly, the returned promise is resolved
 * with the JSON.parsed profile.
 */
async function _fetchProfile({ url, onTemporaryError }: FetchProfileArgs) {
  const MAX_WAIT_SECONDS = 10;
  let i = 0;

  while (true) {
    const response = await fetch(url);
    // Case 1: successful answer.
    if (response.ok) {
      const json = await response.json();
      return json;
    }

    // case 2: unrecoverable error.
    if (response.status !== 404) {
      throw new Error(oneLine`
        Could not fetch the profile on remote server.
        Response was: ${response.status} ${response.statusText}.
      `);
    }

    // case 3: 404 errors can be transient while a profile is uploaded.

    if (i++ === MAX_WAIT_SECONDS) {
      // In the last iteration we don't send a temporary error because we'll
      // throw an error right after the while loop.
      break;
    }

    onTemporaryError(new TemporaryError(
      'Profile not found on remote server.',
      { count: i, total: MAX_WAIT_SECONDS + 1 } // 11 tries during 10 seconds
    ));

    await _wait(1000);
  }

  throw new Error(oneLine`
    Could not fetch the profile on remote server:
    still not found after ${MAX_WAIT_SECONDS} seconds.
  `);
}

export function retrieveProfileFromStore(hash: string): ThunkAction<Promise<void>> {
  return async function (dispatch) {
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

      if (typeof window !== 'undefined' && window.legacyRangeFilters) {
        const zeroAt = getTimeRangeIncludingAllThreads(profile).start;
        window.legacyRangeFilters.forEach(
          ({ start, end }) => dispatch({
            type: 'ADD_RANGE_FILTER',
            start: start - zeroAt,
            end: end - zeroAt,
          })
        );
      }

      dispatch(receiveProfileFromStore(profile));
    } catch (error) {
      dispatch(fatalErrorReceivingProfileFromStore(error));
    }
  };
}

export function retrieveProfileFromUrl(profileURL: string): ThunkAction<Promise<void>> {
  return async function (dispatch) {
    dispatch(waitingForProfileFromUrl());

    try {
      const serializedProfile = await _fetchProfile({
        url: profileURL,
        onTemporaryError: (e: TemporaryError) => {
          dispatch(temporaryErrorReceivingProfileFromUrl(e));
        },
      });

      const profile = unserializeProfileOfArbitraryFormat(serializedProfile);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      if (typeof window !== 'undefined' && window.legacyRangeFilters) {
        const zeroAt = getTimeRangeIncludingAllThreads(profile).start;
        window.legacyRangeFilters.forEach(
          ({ start, end }) => dispatch({
            type: 'ADD_RANGE_FILTER',
            start: start - zeroAt,
            end: end - zeroAt,
          })
        );
      }

      dispatch(receiveProfileFromUrl(profile));
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

export function receiveProfileFromFile(profile: Profile): ThunkAction<void> {
  return dispatch => {
    dispatch({
      type: 'RECEIVE_PROFILE_FROM_FILE',
      profile,
    });
    dispatch({
      toWorker: true,
      type: 'PROFILE_PROCESSED',
      profile: profile,
    });
    dispatch({
      toWorker: true,
      type: 'SUMMARIZE_PROFILE',
    });
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
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
  });

  return {
    asText() {
      reader.readAsText(input);
      return promise;
    },

    asArrayBuffer() {
      reader.readAsArrayBuffer(input);
      return promise;
    },
  };
}

export function retrieveProfileFromFile(file: File): ThunkAction<Promise<void>> {
  return async dispatch => {
    dispatch(waitingForProfileFromFile());

    try {
      const text = await _fileReader(file).asText();
      const profile = unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      dispatch(receiveProfileFromFile(profile));
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

      dispatch(receiveProfileFromFile(profile));
    } catch (error) {
      dispatch(errorReceivingProfileFromFile(error));
    }
  };
}
