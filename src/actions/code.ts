/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  Action,
  SourceCodeLoadingError,
  ApiQueryError,
  DecodedInstruction,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';

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
