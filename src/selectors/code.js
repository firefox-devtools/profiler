/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import type { SourceCodeStatus, Selector } from 'firefox-profiler/types';
import { getSourceViewFile } from './url-state';

export const getSourceCodeCache: Selector<Map<string, SourceCodeStatus>> = (
  state
) => state.code.sourceCodeCache;

export const getSourceViewCode: Selector<SourceCodeStatus | void> =
  createSelector(
    getSourceCodeCache,
    getSourceViewFile,
    (sourceCodeCache, file) => (file ? sourceCodeCache.get(file) : undefined)
  );
