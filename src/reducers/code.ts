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
  SourceFormattingCacheState,
} from 'firefox-profiler/types';
import { combineReducers } from 'redux';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { updateFormatEdits } from 'firefox-profiler/profile-logic/js-format/formatted-source';

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

function _getSourceCodeStatus(
  action: Extract<
    SourcesAction,
    {
      type:
        | 'SOURCE_CODE_LOADING_BEGIN_URL'
        | 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION'
        | 'SOURCE_CODE_LOADING_SUCCESS'
        | 'SOURCE_CODE_LOADING_ERROR';
    }
  >
): SourceCodeStatus {
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

const sourceFormattingCache: Reducer<SourceFormattingCacheState> = (
  state = { generation: 0, statuses: new Map() },
  action
) => {
  switch (action.type) {
    case 'SOURCE_FORMATTING_BEGIN': {
      if (action.generation !== state.generation) {
        return state;
      }
      const statuses = new Map(state.statuses);
      statuses.set(action.sourceIndex, {
        edits: new Int32Array(0),
        isDone: false,
      });
      return { ...state, statuses };
    }
    case 'SOURCE_FORMATTING_PROGRESS': {
      const { sourceIndex, keptEditCount, edits, isDone, generation } = action;
      if (generation !== state.generation) {
        // The worker was formatting a source of another profile, which may
        // have the same index as a source that is being formatted now.
        return state;
      }
      const oldStatus = state.statuses.get(sourceIndex);
      if (oldStatus === undefined) {
        return state;
      }
      const newEdits = updateFormatEdits(oldStatus.edits, keptEditCount, edits);
      const statuses = new Map(state.statuses);
      statuses.set(sourceIndex, { edits: newEdits, isDone });
      return { ...state, statuses };
    }
    case 'SANITIZED_PROFILE_PUBLISHED': {
      if (!action.translationMaps) {
        return state;
      }
      const { oldSourceToNewSourcePlusOne } = action.translationMaps;
      const statuses = new Map();
      for (const [sourceIndex, status] of state.statuses) {
        const newSourceIndexPlusOne = oldSourceToNewSourcePlusOne[sourceIndex];
        if (newSourceIndexPlusOne !== 0) {
          statuses.set(newSourceIndexPlusOne - 1, status);
        }
      }
      return { ...state, statuses };
    }
    case 'PROFILE_LOADED':
      // The source indexes only mean something for the profile they came from.
      return { generation: state.generation + 1, statuses: new Map() };
    default:
      return state;
  }
};

const code: Reducer<CodeState> = combineReducers({
  sourceCodeCache,
  assemblyCodeCache,
  sourceFormattingCache,
});

export default code;
