/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  Action,
  ThunkAction,
  SourceCodeLoadingError,
  ApiQueryError,
  DecodedInstruction,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';
import type { SourceFormattingRequest } from 'firefox-profiler/selectors/code';
import { getSourceFormattingCache } from 'firefox-profiler/selectors/code';
import { runFormatWorker } from 'firefox-profiler/profile-logic/js-format/run-format-worker';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

export function beginLoadingSourceCodeFromUrl(
  sourceIndex: IndexIntoSourceTable,
  url: string
): Action {
  return { type: 'SOURCE_CODE_LOADING_BEGIN_URL', sourceIndex, url };
}

export function beginLoadingSourceCodeFromBrowserConnection(
  sourceIndex: IndexIntoSourceTable
): Action {
  return { type: 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION', sourceIndex };
}

export function finishLoadingSourceCode(
  sourceIndex: IndexIntoSourceTable,
  code: string
): Action {
  return { type: 'SOURCE_CODE_LOADING_SUCCESS', sourceIndex, code };
}

export function failLoadingSourceCode(
  sourceIndex: IndexIntoSourceTable,
  errors: SourceCodeLoadingError[]
): Action {
  return { type: 'SOURCE_CODE_LOADING_ERROR', sourceIndex, errors };
}

export function beginLoadingAssemblyCodeFromUrl(
  nativeSymbolKey: string,
  url: string
): Action {
  return { type: 'ASSEMBLY_CODE_LOADING_BEGIN_URL', nativeSymbolKey, url };
}

export function beginLoadingAssemblyCodeFromBrowserConnection(
  nativeSymbolKey: string
): Action {
  return {
    type: 'ASSEMBLY_CODE_LOADING_BEGIN_BROWSER_CONNECTION',
    nativeSymbolKey,
  };
}

export function finishLoadingAssemblyCode(
  nativeSymbolKey: string,
  instructions: DecodedInstruction[]
): Action {
  return {
    type: 'ASSEMBLY_CODE_LOADING_SUCCESS',
    nativeSymbolKey,
    instructions,
  };
}

export function failLoadingAssemblyCode(
  nativeSymbolKey: string,
  errors: ApiQueryError[]
): Action {
  return { type: 'ASSEMBLY_CODE_LOADING_ERROR', nativeSymbolKey, errors };
}

/**
 * Pretty-prints a source in the format worker. The worker reports its progress
 * in steps, so that the source view can show partially-formatted code.
 */
export function startFormattingSource(
  request: SourceFormattingRequest
): ThunkAction<void> {
  return (dispatch, getState) => {
    const { sourceIndex, code, dialect } = request;
    if (getSourceFormattingCache(getState()).has(sourceIndex)) {
      return;
    }
    dispatch({ type: 'SOURCE_FORMATTING_BEGIN', sourceIndex });
    runFormatWorker({ code, dialect }, (output) => {
      switch (output.type) {
        case 'progress':
          dispatch({
            type: 'SOURCE_FORMATTING_PROGRESS',
            sourceIndex,
            edits: output.edits,
            isDone: output.isDone,
          });
          break;
        case 'error':
          console.error('Formatting the source failed:', output.message);
          // Keep the edits that were made so far.
          dispatch({
            type: 'SOURCE_FORMATTING_PROGRESS',
            sourceIndex,
            edits: new Int32Array(0),
            isDone: true,
          });
          break;
        default:
          throw assertExhaustiveCheck(output);
      }
    });
  };
}
