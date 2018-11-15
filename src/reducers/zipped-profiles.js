/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import { createSelector } from 'reselect';
import { oneLine } from 'common-tags';
import { getProfileUrl } from './url-state';
import { ensureExists } from '../utils/flow';
import * as ZipFiles from '../profile-logic/zip-files';

import type { Action } from '../types/store';
import type {
  State,
  ZipFileState,
  Reducer,
  ZippedProfilesState,
} from '../types/reducers';
import type JSZip from 'jszip';

/**
 * This reducer contains all of the state that deals with loading in profiles from
 * zip files.
 */
function zipFile(
  state: ZipFileState = {
    phase: 'NO_ZIP_FILE',
    zip: null,
    pathInZipFile: null,
  },
  action: Action
): ZipFileState {
  switch (action.type) {
    case 'UPDATE_URL_STATE': {
      if (
        action.newUrlState &&
        action.newUrlState.pathInZipFile === null &&
        state.phase === 'VIEW_PROFILE_IN_ZIP_FILE'
      ) {
        // When the back button is hit on the browser, the UrlState can update, but
        // the state of the zip file viewer can be out of date. In this case, make
        // sure and revert the state back to LIST_FILES_IN_ZIP_FILE rather than
        // VIEW_PROFILE_IN_ZIP_FILE. Otherwise the zip file viewer will try and
        // display a profile that does not exist.
        return _validateStateTransition(state, {
          phase: 'LIST_FILES_IN_ZIP_FILE',
          zip: state.zip,
          pathInZipFile: null,
        });
      }
      return state;
    }
    case 'RECEIVE_ZIP_FILE':
      return _validateStateTransition(state, {
        phase: 'LIST_FILES_IN_ZIP_FILE',
        zip: action.zip,
        pathInZipFile: null,
      });
    case 'RETURN_TO_ZIP_FILE_LIST':
    case 'DISMISS_PROCESS_PROFILE_FROM_ZIP_ERROR':
      return _validateStateTransition(state, {
        phase: 'LIST_FILES_IN_ZIP_FILE',
        zip: ensureExists(state.zip),
        pathInZipFile: null,
      });
    case 'PROCESS_PROFILE_FROM_ZIP_FILE':
      return _validateStateTransition(state, {
        phase: 'PROCESS_PROFILE_FROM_ZIP_FILE',
        zip: ensureExists(state.zip),
        pathInZipFile: action.pathInZipFile,
      });
    case 'FILE_NOT_FOUND_IN_ZIP_FILE':
      return _validateStateTransition(state, {
        phase: 'FILE_NOT_FOUND_IN_ZIP_FILE',
        zip: ensureExists(state.zip),
        pathInZipFile: action.pathInZipFile,
      });
    case 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE':
      return _validateStateTransition(state, {
        phase: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE',
        zip: ensureExists(state.zip),
        pathInZipFile: ensureExists(state.pathInZipFile),
      });
    case 'FATAL_ERROR':
      return state.phase === 'NO_ZIP_FILE' ||
        state.phase === 'LIST_FILES_IN_ZIP_FILE'
        ? state
        : _validateStateTransition(state, {
            phase: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE',
            zip: ensureExists(state.zip),
            pathInZipFile: ensureExists(state.pathInZipFile),
          });
    case 'VIEW_PROFILE':
      // Only process this as a change if a zip file is actually loaded.
      return state.phase === 'NO_ZIP_FILE'
        ? state
        : _validateStateTransition(state, {
            phase: 'VIEW_PROFILE_IN_ZIP_FILE',
            zip: ensureExists(state.zip),
            pathInZipFile: ensureExists(state.pathInZipFile),
          });
    default:
      return state;
  }
}

function error(state: null | Error = null, action: Action): null | Error {
  switch (action.type) {
    case 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE':
    case 'FATAL_ERROR':
      return action.error;
    default:
      return state;
  }
}

/**
 * This function ensures that the state transitions are logical and make sense. The
 * switch statement provides a mapping of what states are valid to transition to from
 * a previous state. A switch is used rather than an object in order to make it easier
 * to exhaustively check with Flow.
 */
function _validateStateTransition(
  prev: ZipFileState,
  next: ZipFileState
): ZipFileState {
  const prevPhase = prev.phase;
  let expectedNextPhases;
  switch (prevPhase) {
    case 'NO_ZIP_FILE':
      expectedNextPhases = [
        // Coming into a fresh page load with a zip file, this is the first state
        // transition.
        'LIST_FILES_IN_ZIP_FILE',
        // This will happen if coming in from a URL that is already pointing at a file
        // in a zip.
        'PROCESS_PROFILE_FROM_ZIP_FILE',
      ];
      break;
    case 'LIST_FILES_IN_ZIP_FILE':
      expectedNextPhases = [
        'PROCESS_PROFILE_FROM_ZIP_FILE',
        'FILE_NOT_FOUND_IN_ZIP_FILE',
      ];
      break;
    case 'PROCESS_PROFILE_FROM_ZIP_FILE':
      expectedNextPhases = [
        'VIEW_PROFILE_IN_ZIP_FILE',
        'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE',
        // When navigating with the URL, it's possible to go back and list the files.
        'LIST_FILES_IN_ZIP_FILE',
      ];
      break;
    case 'FILE_NOT_FOUND_IN_ZIP_FILE':
      expectedNextPhases = ['LIST_FILES_IN_ZIP_FILE'];
      break;
    case 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE':
      expectedNextPhases = ['LIST_FILES_IN_ZIP_FILE'];
      break;
    case 'VIEW_PROFILE_IN_ZIP_FILE':
      expectedNextPhases = ['LIST_FILES_IN_ZIP_FILE'];
      break;
    default:
      throw new Error(`Unhandled ZipFileState “${(prevPhase: empty)}”`);
  }
  if (!expectedNextPhases.includes(next.phase)) {
    console.error('Previous ZipFileState:', prev);
    console.error('Next ZipFileState:', next);

    throw new Error(oneLine`
      Attempted to transition the ZipFileState from the phase “${prev.phase}”
      to “${next.phase}”, however “${prev.phase}” can only transition to
      “${expectedNextPhases.join('”, “')}”.
    `);
  }
  return next;
}

function selectedZipFileIndex(
  state: null | ZipFiles.IndexIntoZipFileTable = null,
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_SELECTED_ZIP_FILE': {
      return action.selectedZipFileIndex;
    }
    default:
      return state;
  }
}

function expandedZipFileIndexes(
  // In practice this should never contain null, but needs to support the
  // TreeView interface.
  state: Array<ZipFiles.IndexIntoZipFileTable | null> = [],
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_EXPANDED_ZIP_FILES': {
      return action.expandedZipFileIndexes;
    }
    default:
      return state;
  }
}

const zipFileReducer: Reducer<ZippedProfilesState> = combineReducers({
  zipFile,
  error,
  selectedZipFileIndex,
  expandedZipFileIndexes,
});

export default zipFileReducer;

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
