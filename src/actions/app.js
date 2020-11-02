/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';
import {
  getSelectedTab,
  getDataSource,
  getIsActiveTabResourcesPanelOpen,
  getSelectedThreadIndexes,
  getLocalTrackOrderByPid,
} from 'firefox-profiler/selectors/url-state';
import {
  getTrackThreadHeights,
  getIsEventDelayTracksEnabled,
} from 'firefox-profiler/selectors/app';
import {
  getActiveTabMainTrack,
  getLocalTracksByPid,
  getThreads,
} from 'firefox-profiler/selectors/profile';
import { sendAnalytics } from 'firefox-profiler/utils/analytics';
import {
  stateFromLocation,
  withHistoryReplaceStateSync,
} from 'firefox-profiler/app-logic/url-handling';
import { finalizeProfileView } from './receive-profile';
import { fatalError } from './errors';
import {
  addEventDelayTracksForThreads,
  initializeLocalTrackOrderByPid,
} from 'firefox-profiler/profile-logic/tracks';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';

import type {
  Profile,
  ThreadsKey,
  CssPixels,
  Action,
  ThunkAction,
  UrlState,
  UploadedProfileInformation,
} from 'firefox-profiler/types';
import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';

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

export function changeProfilesToCompare(profiles: string[]): Action {
  return {
    type: 'CHANGE_PROFILES_TO_COMPARE',
    profiles,
  };
}

export function startFetchingProfiles(): Action {
  return { type: 'START_FETCHING_PROFILES' };
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

export function show404(url: string): Action {
  return { type: 'ROUTE_NOT_FOUND', url };
}

export function changeSidebarOpenState(tab: TabSlug, isOpen: boolean): Action {
  return { type: 'CHANGE_SIDEBAR_OPEN_STATE', tab, isOpen };
}

export function invalidatePanelLayout(): Action {
  return { type: 'INCREMENT_PANEL_LAYOUT_GENERATION' };
}

/**
 * The viewport component provides a hint to use shift to zoom scroll. The first
 * time a user does this, the hint goes away.
 */
export function setHasZoomedViaMousewheel() {
  return { type: 'HAS_ZOOMED_VIA_MOUSEWHEEL' };
}

/**
 * This function is called when we start setting up the initial url state.
 * It takes the location and profile data, converts the location into url
 * state and then dispatches relevant actions to finalize the view.
 * `profile` parameter can be null when the data source can't provide the profile
 * and the url upgrader step is not needed (e.g. 'from-addon').
 */
export function setupInitialUrlState(
  location: Location,
  profile: Profile | null
): ThunkAction<void> {
  return dispatch => {
    let urlState;
    try {
      urlState = stateFromLocation(location, profile);
    } catch (e) {
      if (e.name === 'UrlUpgradeError') {
        // The error is an URL upgrade error, let's fire a fatal error.
        // If there's a service worker update, the class `ServiceWorkerManager`
        // will automatically reload in case the new code knows how to handle
        // this URL version.
        dispatch(fatalError(e));
        return;
      }
      // The location could not be parsed, show a 404 instead.
      console.error(e);
      dispatch(show404(location.pathname + location.search));
      return;
    }

    // Validate the initial URL state. We can't refresh on a from-file URL.
    if (urlState.dataSource === 'from-file') {
      urlState = null;
    }

    // Normally having multiple dispatches is an anti pattern, but here it's
    // necessary because we are doing different things inside those actions and
    // they can't be merged because we are also calling those seperately on
    // other parts of the code.
    // The first dispatch here updates the url state, then changes state as the url
    // setup is done, and lastly finalizes the profile view since everything is set up now.
    // All of this is done while the history is replaced, as this is part of the initial
    // load process.
    withHistoryReplaceStateSync(() => {
      dispatch(updateUrlState(urlState));
      dispatch(urlSetupDone());
      dispatch(finalizeProfileView());
    });
  };
}

/**
 * This function is called when a browser navigation event happens. A new UrlState
 * is generated when the window.location is serialized, or the state is pulled out of
 * the history API.
 */
export function updateUrlState(newUrlState: UrlState | null): Action {
  return { type: 'UPDATE_URL_STATE', newUrlState };
}

export function reportTrackThreadHeight(
  threadsKey: ThreadsKey,
  height: CssPixels
): ThunkAction<void> {
  return (dispatch, getState) => {
    const trackThreadHeights = getTrackThreadHeights(getState());
    const previousHeight = trackThreadHeights[threadsKey];
    if (previousHeight !== height) {
      // Guard against unnecessary dispatches. This could happen frequently.
      dispatch({
        type: 'UPDATE_TRACK_THREAD_HEIGHT',
        height,
        threadsKey,
      });
    }
  };
}

/**
 * This action dismisses the newly published state. This happens when a user first
 * uploads a profile. We only want to remember this when we fist open the profile.
 */
export function dismissNewlyPublished(): Action {
  return { type: 'DISMISS_NEWLY_PUBLISHED' };
}

/**
 * Called when a user has started dragging a file. Used for loading
 * profiles with the drag and drop component.
 */
export function startDragging(): Action {
  return { type: 'START_DRAGGING' };
}

/**
 * Called when a user has stopped dragging a file.
 */
export function stopDragging(): Action {
  return { type: 'STOP_DRAGGING' };
}

/**
 * Called when a custom drag and drop overlay is mounted. This lets
 * the app know that we shouldn't create a default overlay.
 */
export function registerDragAndDropOverlay(): Action {
  return { type: 'REGISTER_DRAG_AND_DROP_OVERLAY' };
}

/**
 * Called when a custom drag and drop overlay is unmounted.
 */
export function unregisterDragAndDropOverlay(): Action {
  return { type: 'UNREGISTER_DRAG_AND_DROP_OVERLAY' };
}

/**
 * Toggle the active tab resources panel
 */
export function toggleResourcesPanel(): ThunkAction<void> {
  return (dispatch, getState) => {
    const isResourcesPanelOpen = getIsActiveTabResourcesPanelOpen(getState());
    let selectedThreadIndexes = getSelectedThreadIndexes(getState());

    if (isResourcesPanelOpen) {
      // If it was open when we dispatched that action, it means we are closing this panel.
      // We would like to also select the main track when we close this panel.
      const mainTrack = getActiveTabMainTrack(getState());
      selectedThreadIndexes = new Set([...mainTrack.threadIndexes]);
    }

    // Toggle the resources panel eventually.
    dispatch({
      type: 'TOGGLE_RESOURCES_PANEL',
      selectedThreadIndexes,
    });
  };
}

/*
 * This action enables the event delay tracks. They are hidden by default because
 * they are usually for power users and not so meaningful for average users.
 * There is no UI that triggers this action in the profiler interface. Instead,
 * users have to enable this from the developer console by writing this line:
 * `experimental.enableEventDelayTracks()`
 */
export function enableEventDelayTracks(): ThunkAction<boolean> {
  return (dispatch, getState) => {
    if (getIsEventDelayTracksEnabled(getState())) {
      console.error(
        'Tried to enable the event delay tracks, but they are already enabled.'
      );
      return false;
    }

    if (
      selectedThreadSelectors.getSamplesTable(getState()).eventDelay ===
      undefined
    ) {
      // Return early if the profile doesn't have eventDelay values.
      console.error(oneLine`
        Tried to enable the event delay tracks, but this profile does
        not have eventDelay values. It is likely an older profile.
      `);
      return false;
    }

    const oldLocalTracks = getLocalTracksByPid(getState());
    const localTracksByPid = addEventDelayTracksForThreads(
      getThreads(getState()),
      oldLocalTracks
    );
    const localTrackOrderByPid = initializeLocalTrackOrderByPid(
      getLocalTrackOrderByPid(getState()),
      localTracksByPid,
      null
    );
    dispatch({
      type: 'ENABLE_EVENT_DELAY_TRACKS',
      localTracksByPid,
      localTrackOrderByPid,
    });

    return true;
  };
}

/**
 * This caches the profile data in the local state for synchronous access.
 */
export function setCurrentProfileUploadedInformation(
  uploadedProfileInformation: UploadedProfileInformation | null
): Action {
  return {
    type: 'SET_CURRENT_PROFILE_UPLOADED_INFORMATION',
    uploadedProfileInformation,
  };
}

export function profileRemotelyDeleted(): Action {
  // Ideally we should store the current profile data in a local indexeddb, and
  // set the URL to /local/<indexeddb-key>.
  return { type: 'PROFILE_REMOTELY_DELETED' };
}
