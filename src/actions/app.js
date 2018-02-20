/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getSelectedTab, getDataSource } from '../reducers/url-state';
import { sendAnalytics } from '../utils/analytics';
import { getZipFileTable, getZipFileState } from '../reducers/app';
import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import type { Action, ThunkAction } from '../types/store';
import type { TabSlug } from '../types/actions';
import type { UrlState, State } from '../types/reducers';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';

export function changeSelectedTab(selectedTab: TabSlug): ThunkAction<void> {
  return (dispatch, getState) => {
    const previousTab = getSelectedTab(getState());
    if (previousTab !== selectedTab) {
      sendAnalytics({
        hitType: 'pageview',
        page: selectedTab,
      });
      dispatch({
        type: 'CHANGE_SELECTED_TAB',
        selectedTab,
      });
    }
  };
}

export function profilePublished(hash: string): Action {
  return {
    type: 'PROFILE_PUBLISHED',
    hash,
  };
}

export function changeTabOrder(tabOrder: number[]): Action {
  return {
    type: 'CHANGE_TAB_ORDER',
    tabOrder,
  };
}

export function urlSetupDone(): ThunkAction<void> {
  return (dispatch, getState) => {
    dispatch({ type: 'URL_SETUP_DONE' });

    // After the url setup is done, we can successfully query our state about its
    // initial page.
    const dataSource = getDataSource(getState());
    sendAnalytics({
      hitType: 'pageview',
      page: dataSource === 'none' ? 'home' : getSelectedTab(getState()),
    });
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'datasource',
      eventAction: dataSource,
    });
  };
}

export function changeSelectedZipFile(
  selectedZipFileIndex: IndexIntoZipFileTable
): Action {
  return {
    type: 'CHANGE_SELECTED_ZIP_FILE',
    selectedZipFileIndex,
  };
}

export function changeExpandedZipFile(
  expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>
): Action {
  return {
    type: 'CHANGE_EXPANDED_ZIP_FILES',
    expandedZipFileIndexes,
  };
}

export function show404(url: string): Action {
  return { type: 'ROUTE_NOT_FOUND', url };
}

/**
 * This function is called when a browser navigation event happens. A new UrlState
 * is generated when the window.location is serialized, or the state is pulled out of
 * the history API. Please note that the `State` still contains the OLD UrlState.
 * It is the job of the reducers to handle this new UrlState.
 */
export function updateUrlState(newUrlState: UrlState, state: State): Action {
  return { type: 'UPDATE_URL_STATE', newUrlState, state };
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
  zipFileIndex: IndexIntoZipFileTable
): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const zipFileTable = getZipFileTable(getState());
    if (!zipFileTable) {
      throw new Error(
        'Attempted to view a profile from a zip, when there is no zip file loaded.'
      );
    }
    const zipFilePath = zipFileTable.path[zipFileIndex];
    const file = zipFileTable.file[zipFileIndex];
    if (!file) {
      throw new Error(
        'Attempted to load a zip file that did not exist or was a directory.'
      );
    }

    dispatch({ type: 'PROCESS_PROFILE_FROM_ZIP_FILE', zipFilePath });

    try {
      // Attempt to unserialize the profile.
      const profile = await unserializeProfileOfArbitraryFormat(
        await file.async('string')
      );

      // Since this is an async function, there can be race conditions. Prevent this by
      // comparing this request with the current state of the store. If this result
      // is invalid, don't dispatch anything, and discard the profile.
      const zipFileState = getZipFileState(getState());
      if (
        zipFileState.zipFilePath === zipFilePath &&
        zipFileState.phase === 'PROCESS_PROFILE_FROM_ZIP_FILE'
      ) {
        dispatch({
          type: 'VIEW_PROFILE',
          profile,
          zipFilePath,
        });
      }
    } catch (error) {
      console.error('Failed to process the profile in the zip file.', error);
      dispatch({ type: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE', error });
    }
  };
}

export function returnToZipFileList() {
  return { type: 'RETURN_TO_ZIP_FILE_LIST' };
}

export function showErrorForNoFileInZip(zipFilePath: string) {
  return { type: 'FILE_NOT_FOUND_IN_ZIP_FILE', zipFilePath };
}
