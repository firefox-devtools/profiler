/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  Reducer,
  SourceCodeStatus,
  AssemblyCodeStatus,
  CodeState,
} from 'firefox-profiler/types';
import { combineReducers } from 'redux';

const sourceCodeCache: Reducer<Map<string, SourceCodeStatus>> = (
  state = new Map(),
  action
) => {
  switch (action.type) {
    case 'SOURCE_CODE_LOADING_BEGIN_URL': {
      const { file, url } = action;
      const newState = new Map(state);
      // There is no way we can have a sourceId.
      newState.set(file, { type: 'LOADING', source: { type: 'URL', url } });
      return newState;
    }
    case 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION': {
      const { file, sourceId } = action;
      const newState = new Map(state);
      const cacheKey = sourceId ? `${file}-${sourceId}` : file;
      newState.set(cacheKey, {
        type: 'LOADING',
        source: { type: 'BROWSER_CONNECTION' },
      });
      return newState;
    }
    case 'SOURCE_CODE_LOADING_SUCCESS': {
      const { file, sourceId, code } = action;
      const newState = new Map(state);
      const cacheKey = sourceId ? `${file}-${sourceId}` : file;
      newState.set(cacheKey, { type: 'AVAILABLE', code });
      return newState;
    }
    case 'SOURCE_CODE_LOADING_ERROR': {
      const { file, sourceId, errors } = action;
      const newState = new Map(state);
      const cacheKey = sourceId ? `${file}-${sourceId}` : file;
      newState.set(cacheKey, { type: 'ERROR', errors });
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
