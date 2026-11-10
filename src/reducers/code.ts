/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Reducer,
  SourceCodeStatus,
  SourceCodeCacheState,
  SourcesAction,
  AssemblyCodeStatus,
  CodeState,
} from 'firefox-profiler/types';
import { combineReducers } from 'redux';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

const sourceCodeCache: Reducer<SourceCodeCacheState> = (
  state = { generation: 0, statuses: new Map() },
  action
) => {
  switch (action.type) {
    case 'SOURCE_CODE_LOADING_BEGIN_URL':
    case 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION':
    case 'SOURCE_CODE_LOADING_SUCCESS':
    case 'SOURCE_CODE_LOADING_ERROR': {
      if (action.generation !== state.generation) {
        // The fetch started for another profile, so its sourceIndex may point
        // at a different file now. This includes the LOADING states, which
        // nothing would ever finish.
        return state;
      }
      const statuses = new Map(state.statuses);
      statuses.set(action.sourceIndex, _getSourceCodeStatus(action));
      return { ...state, statuses };
    }
    case 'PROFILE_LOADED':
      // The source indexes only mean something for the profile they came from.
      return { generation: state.generation + 1, statuses: new Map() };
    default:
      return state;
  }
};

function _getSourceCodeStatus(action: SourcesAction): SourceCodeStatus {
  switch (action.type) {
    case 'SOURCE_CODE_LOADING_BEGIN_URL':
      return { type: 'LOADING', source: { type: 'URL', url: action.url } };
    case 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION':
      return { type: 'LOADING', source: { type: 'BROWSER_CONNECTION' } };
    case 'SOURCE_CODE_LOADING_SUCCESS':
      return { type: 'AVAILABLE', code: action.code };
    case 'SOURCE_CODE_LOADING_ERROR':
      return { type: 'ERROR', errors: action.errors };
    default:
      throw assertExhaustiveCheck(action);
  }
}

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
