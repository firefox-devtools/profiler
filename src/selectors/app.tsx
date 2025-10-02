/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';

import {
  getDataSource,
  getSelectedTab,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
} from './url-state';
import { getGlobalTracks, getLocalTracksByPid } from './profile';
import { getZipFileState } from './zipped-profiles';
import { assertExhaustiveCheck, ensureExists } from '../utils/types';
import {
  FULL_TRACK_SCREENSHOT_HEIGHT,
  TRACK_NETWORK_HEIGHT,
  TRACK_MEMORY_HEIGHT,
  TRACK_BANDWIDTH_HEIGHT,
  TRACK_IPC_HEIGHT,
  TRACK_PROCESS_BLANK_HEIGHT,
  TIMELINE_RULER_HEIGHT,
  TRACK_VISUAL_PROGRESS_HEIGHT,
  TRACK_EVENT_DELAY_HEIGHT,
  TRACK_PROCESS_CPU_HEIGHT,
  TRACK_MARKER_HEIGHT,
} from '../app-logic/constants';

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
 * This selector takes all of the tracks, and deduces the height in CssPixels
 * of the timeline. This is here to calculate the max-height of the timeline
 * for the splitter component.
 *
 * The height of the component is determined by the sizing of each track in the list.
 * Most sizes are pretty static, and are set through values in the component. The only
 * tricky value to determine is the thread track. These values get reported to the store
 * and get added in here.
 */
export const getTimelineHeight: Selector<null | CssPixels> = createSelector(
  getGlobalTracks,
  getLocalTracksByPid,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getTrackThreadHeights,
  (
    globalTracks,
    localTracksByPid,
    hiddenGlobalTracks,
    hiddenLocalTracksByPid,
    trackThreadHeights
  ) => {
    let height = TIMELINE_RULER_HEIGHT;
    const border = 1;
    for (const [trackIndex, globalTrack] of globalTracks.entries()) {
      if (!hiddenGlobalTracks.has(trackIndex)) {
        switch (globalTrack.type) {
          case 'screenshots':
            height += FULL_TRACK_SCREENSHOT_HEIGHT + border;
            break;
          case 'visual-progress':
          case 'perceptual-visual-progress':
          case 'contentful-visual-progress':
            height += TRACK_VISUAL_PROGRESS_HEIGHT;
            break;
          case 'process': {
            // The thread tracks have enough complexity that it warrants measuring
            // them rather than statically using a value like the other tracks.
            const { mainThreadIndex } = globalTrack;
            if (mainThreadIndex === null) {
              height += TRACK_PROCESS_BLANK_HEIGHT + border;
            } else {
              const trackThreadHeight = trackThreadHeights[mainThreadIndex];
              if (trackThreadHeight === undefined) {
                // The height isn't computed yet, return.
                return null;
              }
              height += trackThreadHeight + border;
            }
            break;
          }
          default:
            throw assertExhaustiveCheck(globalTrack);
        }
      }
    }

    // Figure out which PIDs are hidden.
    const hiddenPids = new Set();
    for (const trackIndex of hiddenGlobalTracks) {
      const globalTrack = globalTracks[trackIndex];
      if (globalTrack.type === 'process') {
        hiddenPids.add(globalTrack.pid);
      }
    }

    for (const [pid, localTracks] of localTracksByPid) {
      if (hiddenPids.has(pid)) {
        // This track is hidden already.
        continue;
      }
      for (const [trackIndex, localTrack] of localTracks.entries()) {
        const hiddenLocalTracks = ensureExists(
          hiddenLocalTracksByPid.get(pid),
          'Could not look up the hidden local tracks from the given PID'
        );
        if (!hiddenLocalTracks.has(trackIndex)) {
          switch (localTrack.type) {
            case 'thread':
              {
                // The thread tracks have enough complexity that it warrants measuring
                // them rather than statically using a value like the other tracks.
                const trackThreadHeight =
                  trackThreadHeights[localTrack.threadIndex];
                if (trackThreadHeight === undefined) {
                  // The height isn't computed yet, return.
                  return null;
                }
                height += trackThreadHeight + border;
              }

              break;
            case 'network':
              height += TRACK_NETWORK_HEIGHT + border;
              break;
            case 'memory':
              height += TRACK_MEMORY_HEIGHT + border;
              break;
            case 'bandwidth':
              height += TRACK_BANDWIDTH_HEIGHT + border;
              break;
            case 'event-delay':
              height += TRACK_EVENT_DELAY_HEIGHT + border;
              break;
            case 'ipc':
              height += TRACK_IPC_HEIGHT + border;
              break;
            case 'process-cpu':
            case 'power':
              height += TRACK_PROCESS_CPU_HEIGHT + border;
              break;
            case 'marker':
              height += TRACK_MARKER_HEIGHT + border;
              break;
            default:
              throw assertExhaustiveCheck(localTrack);
          }
        }
      }
    }
    return height;
  }
);

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
