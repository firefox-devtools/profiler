/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  Action,
  SourceCodeLoadingError,
  ApiQueryError,
  DecodedInstruction,
} from 'firefox-profiler/types';

export function beginLoadingSourceCodeFromUrl(
  file: string,
  url: string
): Action {
  return { type: 'SOURCE_CODE_LOADING_BEGIN_URL', file, url };
}

export function beginLoadingSourceCodeFromBrowserConnection(
  file: string
): Action {
  return { type: 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION', file };
}

export function finishLoadingSourceCode(file: string, code: string): Action {
  return { type: 'SOURCE_CODE_LOADING_SUCCESS', file, code };
}

export function failLoadingSourceCode(
  file: string,
  errors: SourceCodeLoadingError[]
): Action {
  return { type: 'SOURCE_CODE_LOADING_ERROR', file, errors };
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
