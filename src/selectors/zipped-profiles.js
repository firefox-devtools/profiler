/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import { getProfileUrl } from './url-state';
import { ensureExists } from '../utils/flow';
import * as ZipFiles from '../profile-logic/zip-files';

import type { State, ZipFileState, ZippedProfilesState } from '../types/state';
import type JSZip from 'jszip';

export const getZippedProfilesState = (state: State): ZippedProfilesState =>
  state.zippedProfiles;
export const getSelectedZipFileIndex = (state: State) =>
  getZippedProfilesState(state).selectedZipFileIndex;
export const getExpandedZipFileIndexes = (state: State) =>
  getZippedProfilesState(state).expandedZipFileIndexes;
export const getZipFileErrorMessage = (state: State): string | null => {
  const { error } = getZippedProfilesState(state);
  return error === null ? null : error.message;
};

export const getZipFileState = (state: State): ZipFileState =>
  getZippedProfilesState(state).zipFile;
export const getZipFile = (state: State): JSZip | null => {
  return getZipFileState(state).zip;
};
export const getHasZipFile = (state: State): boolean =>
  getZipFileState(state).phase !== 'NO_ZIP_FILE';

export const getZipFileTableOrNull = createSelector(
  getZipFile,
  zip => (zip === null ? null : ZipFiles.createZipTable(zip))
);

export const getZipFileTable = (state: State) =>
  ensureExists(
    getZipFileTableOrNull(state),
    'Attempted to view a profile from a zip, when there is no zip file loaded.'
  );

export const getZipFileMaxDepth = createSelector(
  getZipFileTable,
  ZipFiles.getZipFileMaxDepth
);

export const getZipFileTreeOrNull = createSelector(
  getZipFileTable,
  getProfileUrl,
  (zipFileTable, zipFileUrl) =>
    zipFileTable === null
      ? null
      : new ZipFiles.ZipFileTree(zipFileTable, zipFileUrl)
);

export const getZipFileTree = (state: State) =>
  ensureExists(
    getZipFileTreeOrNull(state),
    'Attempted to view a profile from a zip, when there is no zip file loaded.'
  );
