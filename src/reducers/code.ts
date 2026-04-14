/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Reducer,
  SourceCodeStatus,
  AssemblyCodeStatus,
  CodeState,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';
import { combineReducers } from 'redux';

const sourceCodeCache: Reducer<Map<IndexIntoSourceTable, SourceCodeStatus>> = (
  state = new Map(),
  action
) => {
  switch (action.type) {
    case 'SOURCE_CODE_LOADING_BEGIN_URL': {
      const { sourceIndex, url } = action;
      const newState = new Map(state);
      newState.set(sourceIndex, {
        type: 'LOADING',
        source: { type: 'URL', url },
      });
      return newState;
    }
    case 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION': {
      const { sourceIndex } = action;
      const newState = new Map(state);
      newState.set(sourceIndex, {
        type: 'LOADING',
        source: { type: 'BROWSER_CONNECTION' },
      });
      return newState;
    }
    case 'SOURCE_CODE_LOADING_SUCCESS': {
      const { sourceIndex, code } = action;
      const newState = new Map(state);
      newState.set(sourceIndex, { type: 'AVAILABLE', code });
      return newState;
    }
    case 'SOURCE_CODE_LOADING_ERROR': {
      const { sourceIndex, errors } = action;
      const newState = new Map(state);
      newState.set(sourceIndex, { type: 'ERROR', errors });
      return newState;
    }
    case 'SANITIZED_PROFILE_PUBLISHED': {
      if (!action.translationMaps) {
        return state;
      }
      const { oldSourceToNewSourcePlusOne } = action.translationMaps;
      const newState = new Map();
      for (const [sourceIndex, status] of state) {
        const newSourceIndexPlusOne = oldSourceToNewSourcePlusOne[sourceIndex];
        if (newSourceIndexPlusOne === 0) {
          continue;
        }
        const newSourceIndex = newSourceIndexPlusOne - 1;
        newState.set(newSourceIndex, status);
      }
      return newState;
    }
    default:
      return state;
  }
};

const assemblyCodeCache: Reducer<Map<string, AssemblyCodeStatus>> = (
  state = new Map(),
  action
) => {
  switch (action.type) {
    case 'ASSEMBLY_CODE_LOADING_BEGIN_URL': {
      const { nativeSymbolKey, url } = action;
      const newState = new Map(state);
      newState.set(nativeSymbolKey, {
        type: 'LOADING',
        source: { type: 'URL', url },
      });
      return newState;
    }
    case 'ASSEMBLY_CODE_LOADING_BEGIN_BROWSER_CONNECTION': {
      const { nativeSymbolKey } = action;
      const newState = new Map(state);
      newState.set(nativeSymbolKey, {
        type: 'LOADING',
        source: { type: 'BROWSER_CONNECTION' },
      });
      return newState;
    }
    case 'ASSEMBLY_CODE_LOADING_SUCCESS': {
      const { nativeSymbolKey, instructions } = action;
      const newState = new Map(state);
      newState.set(nativeSymbolKey, { type: 'AVAILABLE', instructions });
      return newState;
    }
    case 'ASSEMBLY_CODE_LOADING_ERROR': {
      const { nativeSymbolKey, errors } = action;
      const newState = new Map(state);
      newState.set(nativeSymbolKey, { type: 'ERROR', errors });
      return newState;
    }
    default:
      return state;
  }
};

const code: Reducer<CodeState> = combineReducers({
  sourceCodeCache,
  assemblyCodeCache,
});

export default code;
