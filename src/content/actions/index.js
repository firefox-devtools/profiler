import { preprocessProfile, unserializeProfile } from '../preprocess-profile';
import { getTimeRangeIncludingAllThreads } from '../profile-data';
import { symbolicateProfile } from '../symbolication';
import { SymbolStore } from '../symbol-store';
import { getProfile } from '../selectors/';
import { decompress } from '../gz';

export function profileSummaryProcessed(summary) {
  return {
    type: 'PROFILE_SUMMARY_PROCESSED',
    summary,
  };
}

export function expandProfileSummaryThread(threadIndex) {
  return {
    type: 'PROFILE_SUMMARY_EXPAND',
    threadIndex,
  };
}

export function collapseProfileSummaryThread(threadIndex) {
  return {
    type: 'PROFILE_SUMMARY_COLLAPSE',
    threadIndex,
  };
}

export function waitingForProfileFromAddon() {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_ADDON',
  };
}

export function receiveProfileFromAddon(profile) {
  return {
    type: 'RECEIVE_PROFILE_FROM_ADDON',
    profile: profile,
  };
}

export function requestingSymbolTable(requestedLib) {
  return {
    type: 'REQUESTING_SYMBOL_TABLE',
    requestedLib,
  };
}

export function receivedSymbolTableReply(requestedLib) {
  return {
    type: 'RECEIVED_SYMBOL_TABLE_REPLY',
    requestedLib,
  };
}

export function startSymbolicating() {
  return {
    type: 'START_SYMBOLICATING',
  };
}

export function doneSymbolicating() {
  return function (dispatch, getState) {
    dispatch({ type: 'DONE_SYMBOLICATING' });
    // TODO - Do not use selectors here.
    dispatch({
      toWorker: true,
      type: 'PROFILE_PROCESSED',
      profile: getProfile(getState()),
    });
    dispatch({
      toWorker: true,
      type: 'SUMMARIZE_PROFILE',
    });
  };
}

export function coalescedFunctionsUpdate(functionsUpdatePerThread) {
  return {
    type: 'COALESCED_FUNCTIONS_UPDATE',
    functionsUpdatePerThread,
  };
}

class ColascedFunctionsUpdateDispatcher {
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

  mergeFunctions(dispatch, threadIndex, oldFuncToNewFuncMap) {
    this._scheduleUpdate(dispatch);
    if (!this._updates[threadIndex]) {
      this._updates[threadIndex] = {
        oldFuncToNewFuncMap,
        funcIndices: [],
        funcNames: [],
      };
    } else {
      for (const oldFunc of oldFuncToNewFuncMap.keys()) {
        this._updates[threadIndex].oldFuncToNewFuncMap.set(oldFunc, oldFuncToNewFuncMap.get(oldFunc));
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

export function mergeFunctions(threadIndex, oldFuncToNewFuncMap) {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.mergeFunctions(dispatch, threadIndex, oldFuncToNewFuncMap);
  };
}

export function assignFunctionNames(threadIndex, funcIndices, funcNames) {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.assignFunctionNames(dispatch, threadIndex, funcIndices, funcNames);
  };
}

export function assignTaskTracerNames(addressIndices, symbolNames) {
  return {
    type: 'ASSIGN_TASK_TRACER_NAMES',
    addressIndices, symbolNames,
  };
}

export function retrieveProfileFromAddon() {
  return dispatch => {
    dispatch(waitingForProfileFromAddon());

    // XXX use Promise.race with a 5 second timeout promise to show an error message
    window.geckoProfilerPromise.then(geckoProfiler => {
      // XXX update state to show that we're connected to the profiler addon
      geckoProfiler.getProfile().then(rawProfile => {
        const profile = preprocessProfile(rawProfile);

        dispatch(receiveProfileFromAddon(profile));

        const symbolStore = new SymbolStore('cleopatra-async-storage', {
          requestSymbolTable: (pdbName, breakpadId) => {
            const requestedLib = { pdbName, breakpadId };
            dispatch(requestingSymbolTable(requestedLib));
            return geckoProfiler.getSymbolTable(pdbName, breakpadId).then(symbolTable => {
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
          onMergeFunctions: (threadIndex, oldFuncToNewFuncMap) => {
            dispatch(mergeFunctions(threadIndex, oldFuncToNewFuncMap));
          },
          onGotFuncNames: (threadIndex, funcIndices, funcNames) => {
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

export function waitingForProfileFromWeb() {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_WEB',
  };
}

export function receiveProfileFromWeb(profile) {
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

export function errorReceivingProfileFromWeb(error) {
  return {
    type: 'ERROR_RECEIVING_PROFILE_FROM_WEB',
    error,
  };
}

export function retrieveProfileFromWeb(hash) {
  return dispatch => {
    dispatch(waitingForProfileFromWeb());

    fetch(`https://profile-store.commondatastorage.googleapis.com/${hash}`).then(response => response.text()).then(text => {
      const profile = unserializeProfile(text);
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

export function waitingForProfileFromFile() {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_FILE',
  };
}

export function receiveProfileFromFile(profile) {
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

export function errorReceivingProfileFromFile(error) {
  return {
    type: 'ERROR_RECEIVING_PROFILE_FROM_FILE',
    error,
  };
}

export function retrieveProfileFromFile(file) {
  return dispatch => {
    dispatch(waitingForProfileFromFile());

    (new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    })).then(text => {
      const profile = unserializeProfile(text);
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
      const profile = unserializeProfile(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      dispatch(receiveProfileFromFile(profile));
    }).catch(error => {
      dispatch(errorReceivingProfileFromFile(error));
    });
  };
}

export function changeSelectedFuncStack(threadIndex, selectedFuncStack) {
  return {
    type: 'CHANGE_SELECTED_FUNC_STACK',
    selectedFuncStack, threadIndex,
  };
}

export function changeSelectedThread(selectedThread) {
  return {
    type: 'CHANGE_SELECTED_THREAD',
    selectedThread,
  };
}

export function changeThreadOrder(threadOrder) {
  return {
    type: 'CHANGE_THREAD_ORDER',
    threadOrder,
  };
}

export function changeCallTreeSearchString(searchString) {
  return {
    type: 'CHANGE_CALL_TREE_SEARCH_STRING',
    searchString,
  };
}

export function changeSelectedTab(selectedTab) {
  return {
    type: 'CHANGE_SELECTED_TAB',
    selectedTab,
  };
}

export function profilePublished(hash) {
  return {
    type: 'PROFILE_PUBLISHED',
    hash,
  };
}

export function changeTabOrder(tabOrder) {
  return {
    type: 'CHANGE_TAB_ORDER',
    tabOrder,
  };
}

export function changeExpandedFuncStacks(threadIndex, expandedFuncStacks) {
  return {
    type: 'CHANGE_EXPANDED_FUNC_STACKS',
    threadIndex, expandedFuncStacks,
  };
}

export function changeSelectedMarker(threadIndex, selectedMarker) {
  return {
    type: 'CHANGE_SELECTED_MARKER',
    selectedMarker, threadIndex,
  };
}

export function changeJSOnly(jsOnly) {
  return {
    type: 'CHANGE_JS_ONLY',
    jsOnly,
  };
}

export function changeInvertCallstack(invertCallstack) {
  return {
    type: 'CHANGE_INVERT_CALLSTACK',
    invertCallstack,
  };
}

export function updateProfileSelection(selection) {
  return {
    type: 'UPDATE_PROFILE_SELECTION',
    selection,
  };
}

export function addRangeFilter(start, end) {
  return {
    type: 'ADD_RANGE_FILTER',
    start, end,
  };
}

export function addRangeFilterAndUnsetSelection(start, end) {
  return dispatch => {
    dispatch(addRangeFilter(start, end));
    dispatch(updateProfileSelection({ hasSelection: false, isModifying: false }));
  };
}

export function popRangeFilters(firstRemovedFilterIndex) {
  return {
    type: 'POP_RANGE_FILTERS',
    firstRemovedFilterIndex,
  };
}

export function popRangeFiltersAndUnsetSelection(firstRemovedFilterIndex) {
  return dispatch => {
    dispatch(popRangeFilters(firstRemovedFilterIndex));
    dispatch(updateProfileSelection({ hasSelection: false, isModifying: false }));
  };
}

export function addCallTreeFilter(threadIndex, filter) {
  return {
    type: 'ADD_CALL_TREE_FILTER',
    threadIndex,
    filter,
  };
}

export function popCallTreeFilters(threadIndex, firstRemovedFilterIndex) {
  return {
    type: 'POP_CALL_TREE_FILTERS',
    threadIndex,
    firstRemovedFilterIndex,
  };
}
