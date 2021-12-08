/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import type { FileSourceStatus, Selector } from 'firefox-profiler/types';
import { getSourceViewFile } from './url-state';

export const getSources: Selector<Map<string, FileSourceStatus>> = (state) =>
  state.sources;

export const getSourceViewSource: Selector<FileSourceStatus | void> =
  createSelector(getSources, getSourceViewFile, (sources, file) =>
    file ? sources.get(file) : undefined
  );
