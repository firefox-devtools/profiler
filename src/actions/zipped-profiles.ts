/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  getZipFileTable,
  getZipFileState,
} from 'firefox-profiler/selectors/zipped-profiles';
import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { loadProfile } from './receive-profile';

import { Action, ThunkAction } from 'firefox-profiler/types';
import { IndexIntoZipFileTable } from 'firefox-profiler/profile-logic/zip-files';

export function changeSelectedZipFile(
  selectedZipFileIndex: IndexIntoZipFileTable
): Action {
  return {
    type: 'CHANGE_SELECTED_ZIP_FILE' as const,
    selectedZipFileIndex,
  };
}

export function changeExpandedZipFile(
  expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>
): Action {
  return {
    type: 'CHANGE_EXPANDED_ZIP_FILES' as const,
    expandedZipFileIndexes,
  };
}

/**
 * This ThunkAction has a bit of complexity to it, due to the asynchronous nature of
 * reading in profiles from a zip file. The UrlState represents the current desired state
 * of what file to view in a zip file, and the ZipFileState represents the actual steps
 * being performed to reach the desired UrlState.
 *
 * This ThunkAction needs to properly handle when the UrlState changes faster than it
 * can change the ZipFileState, and not have any race conditions.
 */
export function viewProfileFromZip(
  zipFileIndex: IndexIntoZipFileTable,
  initialLoad: boolean = false
): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const zipFileTable = getZipFileTable(getState());
    const pathInZipFile = zipFileTable.path[zipFileIndex];
    const file = zipFileTable.file[zipFileIndex];
    if (!file) {
      throw new Error(
        'Attempted to load an archive that did not exist or was a directory.'
      );
    }

    dispatch({ type: 'PROCESS_PROFILE_FROM_ZIP_FILE' as const, pathInZipFile });

    try {
      // Attempt to unserialize the profile.
      const profile = await unserializeProfileOfArbitraryFormat(
        await file.async('string'),
        pathInZipFile
      );

      // Since this is an async function, there can be race conditions. Prevent this by
      // comparing this request with the current state of the store. If this result
      // is invalid, don't dispatch anything, and discard the profile.
      const zipFileState = getZipFileState(getState());
      if (
        zipFileState.pathInZipFile === pathInZipFile &&
        zipFileState.phase === 'PROCESS_PROFILE_FROM_ZIP_FILE'
      ) {
        await dispatch(loadProfile(profile, { pathInZipFile }, initialLoad));
      }
    } catch (error) {
      console.error(
        'Failed to process the profile in the archive with the following error:'
      );
      console.error(error);
      dispatch({
        type: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE' as const,
        error,
      });
    }
  };
}

/**
 * This function can take a zip file path, but the path can come from the URL, so
 * don't really trust it.
 */
export function viewProfileFromPathInZipFile(
  pathInZipFile: string
): ThunkAction<Promise<void>> {
  return (dispatch, getState) => {
    const zipFileTable = getZipFileTable(getState());
    const zipFileIndex = zipFileTable.path.indexOf(pathInZipFile);
    if (zipFileIndex === -1) {
      dispatch(showErrorForNoFileInZip(pathInZipFile));
      return Promise.resolve();
    }
    return dispatch(viewProfileFromZip(zipFileIndex));
  };
}

export function returnToZipFileList() {
  return { type: 'RETURN_TO_ZIP_FILE_LIST' as const };
}

export function showErrorForNoFileInZip(pathInZipFile: string) {
  return { type: 'FILE_NOT_FOUND_IN_ZIP_FILE' as const, pathInZipFile };
}
