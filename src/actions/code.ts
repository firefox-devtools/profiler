/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { getProfile } from 'firefox-profiler/selectors/profile';
import { getBrowserConnection } from 'firefox-profiler/selectors/app';
import { getSymbolServerUrl } from 'firefox-profiler/selectors/url-state';
import { getSourceCodeCacheGeneration } from 'firefox-profiler/selectors/code';
import {
  fetchSource,
  type FetchSourceResult,
} from 'firefox-profiler/utils/fetch-source';
import { RegularExternalCommunicationDelegate } from 'firefox-profiler/utils/query-api';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { findAddressProofForFile } from 'firefox-profiler/profile-logic/profile-data';
import type {
  Action,
  ThunkAction,
  SourceCodeLoadingError,
  ApiQueryError,
  DecodedInstruction,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';

// The `generation` argument of these is the source code cache generation from
// when the fetch started, see SourceCodeCacheState.

export function beginLoadingSourceCodeFromUrl(
  sourceIndex: IndexIntoSourceTable,
  url: string,
  generation: number
): Action {
  return {
    type: 'SOURCE_CODE_LOADING_BEGIN_URL',
    sourceIndex,
    url,
    generation,
  };
}

export function beginLoadingSourceCodeFromBrowserConnection(
  sourceIndex: IndexIntoSourceTable,
  generation: number
): Action {
  return {
    type: 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION',
    sourceIndex,
    generation,
  };
}

export function finishLoadingSourceCode(
  sourceIndex: IndexIntoSourceTable,
  code: string,
  generation: number
): Action {
  return { type: 'SOURCE_CODE_LOADING_SUCCESS', sourceIndex, code, generation };
}

export function failLoadingSourceCode(
  sourceIndex: IndexIntoSourceTable,
  errors: SourceCodeLoadingError[],
  generation: number
): Action {
  return { type: 'SOURCE_CODE_LOADING_ERROR', sourceIndex, errors, generation };
}

/**
 * Fetch the contents of a source file into the source code cache, from the
 * browser, a symbol server or the web, whichever can serve it.
 *
 * This always fetches, so callers need to skip sources that are already in the
 * cache or embedded in the profile. Callers should keep one archiveCache across
 * their fetches, so that each archive is only downloaded once.
 */
export function fetchSourceCode(
  sourceIndex: IndexIntoSourceTable,
  archiveCache: Map<string, Promise<Uint8Array>>
): ThunkAction<Promise<FetchSourceResult>> {
  return async (dispatch, getState) => {
    const state = getState();
    const { sources, stringArray } = getProfile(state).shared;
    // Read once here, so that the reducer can drop everything this fetch
    // dispatches after another profile got loaded.
    const generation = getSourceCodeCacheGeneration(state);
    const delegate = new RegularExternalCommunicationDelegate(
      getBrowserConnection(state),
      {
        onBeginUrlRequest: (url) => {
          dispatch(beginLoadingSourceCodeFromUrl(sourceIndex, url, generation));
        },
        onBeginBrowserConnectionQuery: () => {
          dispatch(
            beginLoadingSourceCodeFromBrowserConnection(sourceIndex, generation)
          );
        },
      }
    );
    const result = await fetchSource(
      stringArray[sources.filename[sourceIndex]],
      sources.id[sourceIndex],
      getSymbolServerUrl(state),
      findAddressProofForFile(getProfile(state), sourceIndex),
      archiveCache,
      delegate
    );
    switch (result.type) {
      case 'SUCCESS':
        dispatch(
          finishLoadingSourceCode(sourceIndex, result.source, generation)
        );
        break;
      case 'ERROR':
        dispatch(failLoadingSourceCode(sourceIndex, result.errors, generation));
        break;
      default:
        throw assertExhaustiveCheck(result);
    }
    return result;
  };
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
