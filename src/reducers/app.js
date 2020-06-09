/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import { tabSlugs } from '../app-logic/tabs-handling';

import type { TabSlug } from '../app-logic/tabs-handling';
import type {
  AppState,
  AppViewState,
  IsSidebarOpenPerPanelState,
  Reducer,
  UrlSetupPhase,
} from '../types/state';
import type { ThreadIndex } from '../types/profile';

const view: Reducer<AppViewState> = (
  state = { phase: 'INITIALIZING' },
  action
) => {
  switch (action.type) {
    case 'TEMPORARY_ERROR':
      return {
        phase: 'INITIALIZING',
        additionalData: {
          message: action.error.message,
          attempt: action.error.attempt,
        },
      };
    case 'FATAL_ERROR':
      return { phase: 'FATAL_ERROR', error: action.error };
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
    case 'WAITING_FOR_PROFILE_FROM_URL':
    case 'WAITING_FOR_PROFILE_FROM_FILE':
      return { phase: 'INITIALIZING' };
    case 'ROUTE_NOT_FOUND':
      return { phase: 'ROUTE_NOT_FOUND' };
    case 'REVERT_TO_PRE_PUBLISHED_STATE':
    case 'SANITIZED_PROFILE_PUBLISHED':
      return { phase: 'TRANSITIONING_FROM_STALE_PROFILE' };
    case 'PROFILE_LOADED':
      return { phase: 'PROFILE_LOADED' };
    case 'DATA_RELOAD':
      return { phase: 'DATA_RELOAD' };
    case 'RECEIVE_ZIP_FILE':
    case 'VIEW_FULL_PROFILE':
    case 'VIEW_ORIGINS_PROFILE':
    case 'VIEW_ACTIVE_TAB_PROFILE':
      return { phase: 'DATA_LOADED' };
    default:
      return state;
  }
};

const urlSetupPhase: Reducer<UrlSetupPhase> = (
  state = 'initial-load',
  action
) => {
  switch (action.type) {
    case 'START_FETCHING_PROFILES':
      return 'loading-profile';
    case 'URL_SETUP_DONE':
      return 'done';
    default:
      return state;
  }
};

const hasZoomedViaMousewheel: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'HAS_ZOOMED_VIA_MOUSEWHEEL': {
      return true;
    }
    default:
      return state;
  }
};

function _getSidebarInitialState() {
  const state = {};
  tabSlugs.forEach(tabSlug => (state[tabSlug] = false));
  state.calltree = true;
  state['marker-table'] = true;
  return state;
}

const isSidebarOpenPerPanel: Reducer<IsSidebarOpenPerPanelState> = (
  state = _getSidebarInitialState(),
  action
) => {
  switch (action.type) {
    case 'CHANGE_SIDEBAR_OPEN_STATE': {
      const { tab, isOpen } = action;
      // Due to how this action will be dispatched we'll always have the value
      // changed so we don't need the performance optimization of checking the
      // stored value against the new value.
      return {
        ...state,
        [tab]: isOpen,
      };
    }
    default:
      return state;
  }
};

/**
 * The panels that make up the timeline, details view, and sidebar can all change
 * their sizes depending on the state that is fed to them. In order to control
 * the invalidations of this sizing information, provide a "generation" value that
 * increases monotonically for any change that potentially changes the sizing of
 * any of the panels. This provides a mechanism for subscribing components to
 * deterministically update their sizing correctly.
 */
const panelLayoutGeneration: Reducer<number> = (state = 0, action) => {
  switch (action.type) {
    case 'INCREMENT_PANEL_LAYOUT_GENERATION':
    // Sidebar: (fallthrough)
    case 'CHANGE_SIDEBAR_OPEN_STATE':
    // Timeline: (fallthrough)
    case 'HIDE_GLOBAL_TRACK':
    case 'SHOW_GLOBAL_TRACK':
    case 'ISOLATE_PROCESS':
    case 'ISOLATE_PROCESS_MAIN_THREAD':
    case 'HIDE_LOCAL_TRACK':
    case 'SHOW_LOCAL_TRACK':
    case 'ISOLATE_LOCAL_TRACK':
    case 'TOGGLE_RESOURCES_PANEL':
    // Committed range changes: (fallthrough)
    case 'COMMIT_RANGE':
    case 'POP_COMMITTED_RANGES':
      return state + 1;
    default:
      return state;
  }
};

/**
 * Clicking on tracks can switch between different tabs. This piece of state holds
 * on to the last relevant thread-based tab that was viewed. This makes the UX nicer
 * for when a user clicks on a Network track, and gets taken to the Network
 * panel, then clicks on a thread or process track. With this state we can smoothly
 * transition them back to the panel they were using.
 */
const lastVisibleThreadTabSlug: Reducer<TabSlug> = (
  state = 'calltree',
  action
) => {
  switch (action.type) {
    case 'SELECT_TRACK':
    case 'CHANGE_SELECTED_TAB':
      if (action.selectedTab !== 'network-chart') {
        return action.selectedTab;
      }
      return state;
    default:
      return state;
  }
};

const trackThreadHeights: Reducer<Array<ThreadIndex | void>> = (
  state = [],
  action
) => {
  switch (action.type) {
    case 'UPDATE_TRACK_THREAD_HEIGHT': {
      const newState = state.slice();
      newState[action.threadIndex] = action.height;
      return newState;
    }
    default:
      return state;
  }
};

/**
 * This reducer holds the state for whether or not a profile was newly uploaded
 * or not. This way we can show the permalink to the user.
 */
const isNewlyPublished: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'PROFILE_PUBLISHED':
    case 'SANITIZED_PROFILE_PUBLISHED':
      return true;
    case 'DISMISS_NEWLY_PUBLISHED':
      return false;
    default:
      return state;
  }
};

/**
 * Holds the state for whether or not the user is currently dragging a
 * file over a drag and drop target. This way we know if we should
 * show an overlay suggesting the user to drop the file to load a new
 * profile.
 */
const isDragAndDropDragging: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'START_DRAGGING':
      return true;
    case 'STOP_DRAGGING':
      return false;
    default:
      return state;
  }
};

/**
 * Holds the state for whether or not a custom drag and drop overlay
 * is registered. If it isn't, we will mount a default overlay instead.
 */
const isDragAndDropOverlayRegistered: Reducer<boolean> = (
  state = false,
  action
) => {
  switch (action.type) {
    case 'REGISTER_DRAG_AND_DROP_OVERLAY':
      return true;
    case 'UNREGISTER_DRAG_AND_DROP_OVERLAY':
      return false;
    default:
      return state;
  }
};

const appStateReducer: Reducer<AppState> = combineReducers({
  view,
  urlSetupPhase,
  hasZoomedViaMousewheel,
  isSidebarOpenPerPanel,
  panelLayoutGeneration,
  lastVisibleThreadTabSlug,
  trackThreadHeights,
  isNewlyPublished,
  isDragAndDropDragging,
  isDragAndDropOverlayRegistered,
});

export default appStateReducer;
