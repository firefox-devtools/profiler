// @flow
import { getProfile } from '../reducers/profile-view';
import { processProfile, unserializeProfileOfArbitraryFormat } from '../process-profile';
import { SymbolStore } from '../symbol-store';
import { symbolicateProfile } from '../symbolication';
import { decompress } from '../gz';
import { getTimeRangeIncludingAllThreads } from '../profile-data';

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

  _requestedAnimationFrame: boolean
  _updates: FunctionsUpdatePerThread

  constructor() {
    this._requestedAnimationFrame = false;
    this._updates = {};
  }

  _scheduleUpdate(dispatch) {
    if (!this._requestedAnimationFrame) {
      window.requestAnimationFrame(() => this._dispatchUpdate(dispatch));
      this._requestedAnimationFrame = true;
    }
  }

  _dispatchUpdate(dispatch) {
    const updates = this._updates;
    this._updates = {};
    this._requestedAnimationFrame = false;
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

export function retrieveProfileFromAddon(): ThunkAction {
  return dispatch => {
    dispatch(waitingForProfileFromAddon());

    // XXX use Promise.race with a 5 second timeout promise to show an error message
    window.geckoProfilerPromise.then(geckoProfiler => {
      // XXX update state to show that we're connected to the profiler addon
      geckoProfiler.getProfile().then(rawGeckoProfile => {
        const profile = processProfile(rawGeckoProfile);

        dispatch(receiveProfileFromAddon(profile));

        const symbolStore = new SymbolStore('perf-html-async-storage', {
          requestSymbolTable: (debugName, breakpadId) => {
            const requestedLib = { debugName, breakpadId };
            dispatch(requestingSymbolTable(requestedLib));
            return geckoProfiler.getSymbolTable(debugName, breakpadId).then(symbolTable => {
              dispatch(receivedSymbolTableReply(requestedLib));
              return symbolTable;
            }, error => {
              dispatch(receivedSymbolTableReply(requestedLib));
              throw error;
            });
          },
        });

        dispatch(startSymbolicating());
        symbolicateProfile(profile, symbolStore, {
          onMergeFunctions: (threadIndex: ThreadIndex, oldFuncToNewFuncMap: FuncToFuncMap) => {
            dispatch(mergeFunctions(threadIndex, oldFuncToNewFuncMap));
          },
          onGotFuncNames: (threadIndex: ThreadIndex, funcIndices: IndexIntoFuncTable[], funcNames: string[]) => {
            dispatch(assignFunctionNames(threadIndex, funcIndices, funcNames));
          },
          onGotTaskTracerNames: (addressIndices, symbolNames) => {
            dispatch(assignTaskTracerNames(addressIndices, symbolNames));
          },
        }).then(() => dispatch(doneSymbolicating()));
      });
    });
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

export function errorReceivingProfileFromWeb(error: any): Action {
  return {
    type: 'ERROR_RECEIVING_PROFILE_FROM_WEB',
    error,
  };
}

export function retrieveProfileFromWeb(hash: string): ThunkAction {
  return dispatch => {
    dispatch(waitingForProfileFromWeb());

    fetch(`https://profile-store.commondatastorage.googleapis.com/${hash}`).then(response => response.text()).then(text => {
      const profile = unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      if (window.legacyRangeFilters) {
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

    }).catch(error => {
      dispatch(errorReceivingProfileFromWeb(error));
    });
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

export function errorReceivingProfileFromFile(error: any): Action {
  return {
    type: 'ERROR_RECEIVING_PROFILE_FROM_FILE',
    error,
  };
}

export function retrieveProfileFromFile(file: File): ThunkAction {
  return dispatch => {
    dispatch(waitingForProfileFromFile());

    (new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    })).then(text => {
      const profile = unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      dispatch(receiveProfileFromFile(profile));
    }).catch(() => {
      return (new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      }));
    }).then(buffer => {
      const arrayBuffer = new Uint8Array(buffer);
      return decompress(arrayBuffer);
    }).then(decompressedArrayBuffer => {
      const textDecoder = new TextDecoder();
      return textDecoder.decode(decompressedArrayBuffer);
    }).then(text => {
      const profile = unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      dispatch(receiveProfileFromFile(profile));
    }).catch(error => {
      dispatch(errorReceivingProfileFromFile(error));
    });
  };
}
