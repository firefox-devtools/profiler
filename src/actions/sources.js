/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action, SourceLoadingError } from 'firefox-profiler/types';

export function beginLoadingSourceFromUrl(file: string, url: string): Action {
  return { type: 'SOURCE_LOADING_BEGIN', file, url };
}

export function finishLoadingSource(file: string, source: string): Action {
  return { type: 'SOURCE_LOADING_SUCCESS', file, source };
}

export function failLoadingSource(
  file: string,
  errors: SourceLoadingError[]
): Action {
  return { type: 'SOURCE_LOADING_ERROR', file, errors };
}
