/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import type {
  FileSourceItem,
  FileSourceStatus,
  Selector,
} from 'firefox-profiler/types';
import { getSelectedSourceTabFile } from './url-state';

export const getSources: Selector<FileSourceItem[]> = state => state.sources;

export const getSelectedSourceTabSource: Selector<FileSourceStatus | void> = createSelector(
  getSources,
  getSelectedSourceTabFile,
  (sources, file) => {
    const item = sources.find(item => item.file === file);
    return item ? item.status : undefined;
  }
);
