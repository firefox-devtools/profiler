/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import { createSelector } from 'reselect';
import { oneLine } from 'common-tags';

import * as ZipFiles from '../profile-logic/zip-files';

import type { Action } from '../types/store';
import type {
  State,
  AppState,
  AppViewState,
  Reducer,
  ZipFileState,
} from '../types/reducers';
import type JSZip from 'jszip';

function view(
  state: AppViewState = { phase: 'INITIALIZING' },
  action: Action
): AppViewState {
  if (state.phase === 'DATA_LOADED') {
    // Let's not come back at another phase if we're already displaying a profile
    return state;
  }

  switch (action.type) {
    case 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_STORE':
    case 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_URL':
    case 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_ADDON':
      return {
        phase: 'INITIALIZING',
        additionalData: {
          message: action.error.message,
          attempt: action.error.attempt,
        },
      };
    case 'ERROR_RECEIVING_PROFILE_FROM_FILE':
    case 'FATAL_ERROR_RECEIVING_PROFILE_FROM_ADDON':
    case 'FATAL_ERROR_RECEIVING_PROFILE_FROM_STORE':
    case 'FATAL_ERROR_RECEIVING_PROFILE_FROM_URL':
      return { phase: 'FATAL_ERROR', error: action.error };
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
      return { phase: 'INITIALIZING' };
    case 'ROUTE_NOT_FOUND':
      return { phase: 'ROUTE_NOT_FOUND' };
    case 'RECEIVE_ZIP_FILE':
    case 'VIEW_PROFILE':
      return { phase: 'DATA_LOADED' };
    default:
      return state;
  }
}

/**
 * This reducer represents whether or not to perform history.pushState or
 * history.replaceState when the UrlState changes.
 */
function shouldPushHistoryState(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'ENABLE_HISTORY_PUSH_STATE':
      return true;
    case 'ENABLE_HISTORY_REPLACE_STATE':
      return false;
    default:
      return state;
  }
}

function hasZoomedViaMousewheel(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'HAS_ZOOMED_VIA_MOUSEWHEEL': {
      return true;
    }
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

/**
 * This is a getter to help make the zip reducer less verbose. It should only throw an error if there
 * is a misplaced assumption in the state transitions.
 */
function _getZipFile(state: ZipFileState) {
  const { zip } = state;
  if (!zip) {
    throw new Error('Expected to find a zip file in the state.');
  }
  return zip;
}

/**
 * This is a getter to help make the zip reducer less verbose. It should only throw an error if there
 * is a misplaced assumption in the state transitions.
 */
function _getZipFilePath(state: ZipFileState) {
  const { zipFilePath } = state;
  if (!zipFilePath) {
    throw new Error('Expected to find a zip file path in the state.');
  }
  return zipFilePath;
}

/**
 * A zip file can hold many profiles, keep it up at the app level.
 */
function zipFile(
  state: ZipFileState = { phase: 'NO_ZIP_FILE', zip: null, zipFilePath: null },
  action: Action
): ZipFileState {
  switch (action.type) {
    case 'RECEIVE_ZIP_FILE':
      return _validateStateTransition(state, {
        phase: 'LIST_FILES_IN_ZIP_FILE',
        zip: action.zip,
        zipFilePath: null,
      });
    case 'RETURN_TO_ZIP_FILE_LIST':
    case 'DISMISS_PROCESS_PROFILE_FROM_ZIP_ERROR':
      return _validateStateTransition(state, {
        phase: 'LIST_FILES_IN_ZIP_FILE',
        zip: _getZipFile(state),
        zipFilePath: null,
      });
    case 'PROCESS_PROFILE_FROM_ZIP_FILE':
      return _validateStateTransition(state, {
        phase: 'PROCESS_PROFILE_FROM_ZIP_FILE',
        zip: _getZipFile(state),
        zipFilePath: action.zipFilePath,
      });
    case 'FILE_NOT_FOUND_IN_ZIP_FILE':
      return _validateStateTransition(state, {
        phase: 'FILE_NOT_FOUND_IN_ZIP_FILE',
        zip: _getZipFile(state),
        zipFilePath: action.zipFilePath,
      });
    case 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE':
      return _validateStateTransition(state, {
        phase: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE',
        zip: _getZipFile(state),
        zipFilePath: _getZipFilePath(state),
      });
    case 'VIEW_PROFILE':
      // Only process this as a change if a zip file is actually loaded.
      return state.phase === 'NO_ZIP_FILE'
        ? state
        : _validateStateTransition(state, {
            phase: 'VIEW_PROFILE_IN_ZIP_FILE',
            zip: _getZipFile(state),
            zipFilePath: _getZipFilePath(state),
          });
    default:
      return state;
  }
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

const appStateReducer: Reducer<AppState> = combineReducers({
  view,
  shouldPushHistoryState,
  hasZoomedViaMousewheel,
  zipFile,
  selectedZipFileIndex,
  expandedZipFileIndexes,
});

export default appStateReducer;

export const getApp = (state: State): AppState => state.app;
export const getView = (state: State): AppViewState => getApp(state).view;
export const getSelectedZipFileIndex = (state: State) =>
  getApp(state).selectedZipFileIndex;
export const getExpandedZipFileIndexes = (state: State) =>
  getApp(state).expandedZipFileIndexes;
export const getShouldPushHistoryState = (state: State): boolean =>
  getApp(state).shouldPushHistoryState;
export const getHasZoomedViaMousewheel = (state: Object): boolean => {
  return getApp(state).hasZoomedViaMousewheel;
};

export const getZipFileState = (state: State): ZipFileState =>
  getApp(state).zipFile;
export const getZipFile = (state: State): JSZip | null => {
  return getZipFileState(state).zip;
};
export const hasZipFile = (state: State): boolean =>
  getZipFileState(state).phase !== 'NO_ZIP_FILE';

export const getZipFileTable = createSelector(
  getZipFile,
  zip => (zip === null ? null : ZipFiles.createZipTable(zip))
);

export const getZipFileMaxDepth = createSelector(
  getZipFileTable,
  ZipFiles.getZipFileMaxDepth
);

export const getZipFileTree = createSelector(
  getZipFileTable,
  zipFileTable =>
    zipFileTable === null ? null : new ZipFiles.ZipFileTree(zipFileTable)
);
