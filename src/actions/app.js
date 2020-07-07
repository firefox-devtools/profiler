/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  getSelectedTab,
  getDataSource,
  getIsActiveTabResourcesPanelOpen,
  getSelectedThreadIndex,
} from '../selectors/url-state';
import { getTrackThreadHeights } from '../selectors/app';
import { getActiveTabGlobalTracks } from '../selectors/profile';
import { sendAnalytics } from '../utils/analytics';
import { stateFromLocation } from '../app-logic/url-handling';
import { finalizeProfileView } from './receive-profile';

import type {
  Profile,
  ThreadIndex,
  CssPixels,
  Action,
  ThunkAction,
  UrlState,
} from 'firefox-profiler/types';
import type { TabSlug } from '../app-logic/tabs-handling';

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

//this is to display the loadingStep while fetching profile from add-on
export function changeLoadProgress(step:loadingStep,progress:number): Action{
  return { 
    type: 'CHANGE_LOAD_PROGRESS',
    step,
    progress,
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
 */
export function setupInitialUrlState(
  location: Location,
  profile: Profile
): ThunkAction<void> {
  return dispatch => {
    let urlState;
    try {
      urlState = stateFromLocation(location, profile);
    } catch (e) {
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
    dispatch(updateUrlState(urlState));
    dispatch(urlSetupDone());
    dispatch(finalizeProfileView());
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
  threadIndex: ThreadIndex,
  height: CssPixels
): ThunkAction<void> {
  return (dispatch, getState) => {
    const trackThreadHeights = getTrackThreadHeights(getState());
    const previousHeight = trackThreadHeights[threadIndex];
    if (previousHeight !== height) {
      // Guard against unnecessary dispatches. This could happen frequently.
      dispatch({
        type: 'UPDATE_TRACK_THREAD_HEIGHT',
        height,
        threadIndex,
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
    let selectedThreadIndex = getSelectedThreadIndex(getState());

    if (isResourcesPanelOpen) {
      // If it was open when we dispatched that action, it means we are closing this panel.
      // We would like to also select the main track when we close this panel.
      const globalTracks = getActiveTabGlobalTracks(getState());
      const mainTrack = globalTracks.find(track => track.type === 'tab');

      if (mainTrack === undefined) {
        throw new Error(
          'Failed to find the main track index in active tab view'
        );
      }

      selectedThreadIndex = mainTrack.threadIndex;
    }

    // Toggle the resources panel eventually.
    dispatch({
      type: 'TOGGLE_RESOURCES_PANEL',
      selectedThreadIndex,
    });
  };
}
