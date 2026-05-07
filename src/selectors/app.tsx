/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';

import { getDataSource, getSelectedTab } from './url-state';
import { getZipFileState } from './zipped-profiles';

import type {
  AppState,
  AppViewState,
  UrlSetupPhase,
  Selector,
  CssPixels,
  ThreadsKey,
  ExperimentalFlags,
  UploadedProfileInformation,
} from 'firefox-profiler/types';
import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';
import type {
  BrowserConnectionStatus,
  BrowserConnection,
} from 'firefox-profiler/app-logic/browser-connection';

/**
 * Simple selectors into the app state.
 */
export const getApp: Selector<AppState> = (state) => state.app;
export const getView: Selector<AppViewState> = (state) => getApp(state).view;
export const getUrlSetupPhase: Selector<UrlSetupPhase> = (state) =>
  getApp(state).urlSetupPhase;
export const getHasZoomedViaMousewheel: Selector<boolean> = (state) => {
  return getApp(state).hasZoomedViaMousewheel;
};
export const getIsSidebarOpen: Selector<boolean> = (state) =>
  getApp(state).isSidebarOpenPerPanel[getSelectedTab(state)];
export const getLastVisibleThreadTabSlug: Selector<TabSlug> = (state) =>
  getApp(state).lastVisibleThreadTabSlug;
export const getTrackThreadHeights: Selector<{
  [key: ThreadsKey]: CssPixels;
}> = (state) => getApp(state).trackThreadHeights;
export const getIsNewlyPublished: Selector<boolean> = (state) =>
  getApp(state).isNewlyPublished;
export const getExperimental: Selector<ExperimentalFlags> = (state) =>
  getApp(state).experimental;
export const getBrowserConnectionStatus: Selector<BrowserConnectionStatus> = (
  state
) => getApp(state).browserConnectionStatus;
export const getBrowserConnection: Selector<BrowserConnection | null> =
  createSelector(getBrowserConnectionStatus, (status) =>
    status.status === 'ESTABLISHED' ? status.browserConnection : null
  );
export const getIsEventDelayTracksEnabled: Selector<boolean> = (state) =>
  getExperimental(state).eventDelayTracks;
export const getIsExperimentalCPUGraphsEnabled: Selector<boolean> = (state) =>
  getExperimental(state).cpuGraphs;
export const getIsExperimentalProcessCPUTracksEnabled: Selector<boolean> = (
  state
) => getExperimental(state).processCPUTracks;

export const getIsDragAndDropDragging: Selector<boolean> = (state) =>
  getApp(state).isDragAndDropDragging;
export const getIsDragAndDropOverlayRegistered: Selector<boolean> = (state) =>
  getApp(state).isDragAndDropOverlayRegistered;

export const getCurrentProfileUploadedInformation: Selector<
  UploadedProfileInformation | null
> = (state) => getApp(state).currentProfileUploadedInformation;

/**
 * This selector lets us know if it is safe to load a new profile. If
 * the app is already busy loading a profile, this selector returns
 * false.
 *
 * Used by the drag and drop component in order to determine if it can
 * load a dropped profile file.
 */
export const getIsNewProfileLoadAllowed: Selector<boolean> = createSelector(
  getView,
  getDataSource,
  getZipFileState,
  (view, dataSource, zipFileState) => {
    const appPhase = view.phase;
    const zipPhase = zipFileState.phase;
    const isLoading =
      (appPhase === 'INITIALIZING' && dataSource !== 'none') ||
      zipPhase === 'PROCESS_PROFILE_FROM_ZIP_FILE';
    return !isLoading;
  }
);

/**
 * Returns the indexes of categories that are opened in the sidebar,
 * for every category
 */
export const getSidebarOpenCategories: Selector<Map<string, Set<number>>> =
  createSelector(getApp, (app) => app.sidebarOpenCategories);
