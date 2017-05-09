// @flow
import { oneLine } from 'common-tags';
import { getProfile } from '../reducers/profile-view';
import { processProfile, unserializeProfileOfArbitraryFormat } from '../process-profile';
import { SymbolStore } from '../symbol-store';
import { symbolicateProfile } from '../symbolication';
import { decompress } from '../gz';
import { getTimeRangeIncludingAllThreads } from '../profile-data';
import { TemporaryError } from '../errors';

import type {
  Action,
  Dispatch,
  FunctionsUpdatePerThread,
  FuncToFuncMap,
  GetState,
  RequestedLib,
  ThunkAction,
} from './types';
import type { Profile, ThreadIndex, IndexIntoFuncTable } from '../../common/types/profile';

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

export function doneSymbolicating(): ThunkAction {
  return function (dispatch: Dispatch, getState: GetState) {
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
        // A cross-browser polyfill for requestIdleCallback isn't needed here, since
        // symbolication only happens in Firefox with the Gecko Profiler Add-on installed.
        window.requestIdleCallback(() => {
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
): ThunkAction {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.mergeFunctions(dispatch, threadIndex, oldFuncToNewFuncMap);
  };
}

export function assignFunctionNames(
  threadIndex: ThreadIndex,
  funcIndices: IndexIntoFuncTable[],
  funcNames: string[]
): ThunkAction {
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

async function getGeckoProfiler() {
  const geckoProfiler = await Promise.race([
    window.geckoProfilerPromise,
    _wait(5000).then(() => Promise.reject(new Error(
      'Unable to connect to the Gecko profiler add-on within five seconds.'
    ))),
  ]);

  return geckoProfiler;
}

async function getProfileFromAddon(dispatch, geckoProfiler) {
  dispatch(waitingForProfileFromAddon());

  // XXX update state to show that we're connected to the profiler addon
  const rawGeckoProfile = await geckoProfiler.getProfile();
  const profile = processProfile(rawGeckoProfile);
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

async function doSymbolicateProfile(dispatch, profile, symbolStore) {
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

export function errorReceivingProfileFromAddon(error: Error) {
  return {
    type: 'ERROR_RECEIVING_PROFILE_FROM_ADDON',
    error,
  };
}

export function retrieveProfileFromAddon(): ThunkAction {
  return async dispatch => {
    try {
      const geckoProfiler = await getGeckoProfiler();
      const [profile, symbolStore] = await Promise.all([
        getProfileFromAddon(dispatch, geckoProfiler),
        getSymbolStore(dispatch, geckoProfiler),
      ]);
      await doSymbolicateProfile(dispatch, profile, symbolStore);
    } catch (error) {
      dispatch(errorReceivingProfileFromAddon(error));
      throw error;
    }
  };
}

export function waitingForProfileFromWeb(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_WEB',
  };
}

export function receiveProfileFromWeb(profile: Profile): ThunkAction {
  return dispatch => {
    dispatch({
      type: 'RECEIVE_PROFILE_FROM_WEB',
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

export function temporaryErrorReceivingProfileFromWeb(error: TemporaryError): Action {
  return {
    type: 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_WEB',
    error,
  };
}

export function fatalErrorReceivingProfileFromWeb(error: Error): Action {
  return {
    type: 'FATAL_ERROR_RECEIVING_PROFILE_FROM_WEB',
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

export function retrieveProfileFromWeb(hash: string): ThunkAction {
  return async function (dispatch) {
    dispatch(waitingForProfileFromWeb());

    try {
      const serializedProfile = await _fetchProfile({
        url: `https://profile-store.commondatastorage.googleapis.com/${hash}`,
        onTemporaryError: e => dispatch(temporaryErrorReceivingProfileFromWeb(e)),
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

      dispatch(receiveProfileFromWeb(profile));
    } catch (error) {
      dispatch(fatalErrorReceivingProfileFromWeb(error));
    }
  };
}

export function waitingForProfileFromFile(): Action {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_FILE',
  };
}

export function receiveProfileFromFile(profile: Profile): ThunkAction {
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

export function retrieveProfileFromFile(file: File): ThunkAction {
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
