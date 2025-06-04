/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import { tabSlugs } from '../app-logic/tabs-handling';

import type { TabSlug } from '../app-logic/tabs-handling';
import type { BrowserConnectionStatus } from '../app-logic/browser-connection';
import type {
  AppState,
  AppViewState,
  IsOpenPerPanelState,
  Reducer,
  UrlSetupPhase,
  ThreadsKey,
  ExperimentalFlags,
  CssPixels,
  UploadedProfileInformation,
} from 'firefox-profiler/types';

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
    case 'WAITING_FOR_PROFILE_FROM_BROWSER':
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
    case 'CHANGE_TAB_FILTER':
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
    case 'ROUTE_NOT_FOUND':
    case 'FATAL_ERROR':
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
  tabSlugs.forEach((tabSlug) => (state[tabSlug] = false));
  state.calltree = true;
  state['marker-table'] = true;
  return state;
}

const isSidebarOpenPerPanel: Reducer<IsOpenPerPanelState> = (
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
    case 'SHOW_ALL_TRACKS':
    case 'SHOW_PROVIDED_TRACKS':
    case 'HIDE_PROVIDED_TRACKS':
    case 'SHOW_GLOBAL_TRACK':
    case 'SHOW_GLOBAL_TRACK_INCLUDING_LOCAL_TRACKS':
    case 'ISOLATE_PROCESS':
    case 'ISOLATE_PROCESS_MAIN_THREAD':
    case 'HIDE_LOCAL_TRACK':
    case 'SHOW_LOCAL_TRACK':
    case 'ISOLATE_LOCAL_TRACK':
    case 'TOGGLE_RESOURCES_PANEL':
    case 'ENABLE_EXPERIMENTAL_CPU_GRAPHS':
    case 'ENABLE_EXPERIMENTAL_PROCESS_CPU_TRACKS':
    case 'CHANGE_TAB_FILTER':
    // Committed range changes: (fallthrough)
    case 'COMMIT_RANGE':
    case 'POP_COMMITTED_RANGES':
    // Bottom box: (fallthrough)
    case 'UPDATE_BOTTOM_BOX':
    case 'CLOSE_BOTTOM_BOX_FOR_TAB':
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
    case 'FOCUS_CALL_TREE':
      return 'calltree';
    default:
      return state;
  }
};

const trackThreadHeights: Reducer<{ [key: ThreadsKey]: CssPixels }> = (
  state = {},
  action
) => {
  switch (action.type) {
    case 'UPDATE_TRACK_THREAD_HEIGHT': {
      const newState = { ...state };
      newState[action.threadsKey] = action.height;
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

/*
 * This reducer hold the state for whether the event delay tracks are enabled.
 * This way we can hide the event delay tracks by default and display if we
 * change the state.
 */
const eventDelayTracks: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'ENABLE_EVENT_DELAY_TRACKS': {
      return true;
    }
    default:
      return state;
  }
};

/*
 * This reducer hold the state for whether the CPU graphs are enabled.
 * They are mostly for debugging purpose and they will be removed soon.
 */
const cpuGraphs: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'ENABLE_EXPERIMENTAL_CPU_GRAPHS':
      return true;
    default:
      return state;
  }
};

/*
 * This reducer hold the state for whether the process CPU tracks are enabled.
 * This feature is still experimental and this will be removed once we have
 * better handling for this data.
 */
const processCPUTracks: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'ENABLE_EXPERIMENTAL_PROCESS_CPU_TRACKS':
      return true;
    default:
      return state;
  }
};

/**
 * This keeps the information about the upload for the current profile, if any.
 * This is retrieved from the IndexedDB for published profiles information in
 * CurrentProfileUploadedInformationLoader.
 * This will be null if the currently loaded profile doesn't come from the
 * public store (for example if this comes from Firefox and hasn't been uploaded
 * yet) or if this profile hasn't been uploaded by this user and we don't have
 * its uploaded information in the IndexedDB.
 */
const currentProfileUploadedInformation: Reducer<
  UploadedProfileInformation | null,
> = (state = null, action) => {
  switch (action.type) {
    case 'SET_CURRENT_PROFILE_UPLOADED_INFORMATION':
      return action.uploadedProfileInformation;
    default:
      return state;
  }
};

/**
 * Experimental features that are mostly disabled by default. You need to enable
 * them from the DevTools console with `experimental.enable<feature-camel-case>()`,
 * e.g. `experimental.enableEventDelayTracks()`.
 * If you want to add a new experimental flag here, don't forget to add it to
 * window.experimental object in window-console.js.
 */
const experimental: Reducer<ExperimentalFlags> = combineReducers({
  eventDelayTracks,
  cpuGraphs,
  processCPUTracks,
});

const browserConnectionStatus: Reducer<BrowserConnectionStatus> = (
  state = { status: 'NO_ATTEMPT' },
  action
) => {
  switch (action.type) {
    case 'UPDATE_BROWSER_CONNECTION_STATUS':
      return action.browserConnectionStatus;
    default:
      return state;
  }
};

/**
 * Signals which categories are opened by default in the sidebar per type
 */
const sidebarOpenCategories: Reducer<Map<string, Set<number>>> = (
  openCats: Map<string, Set<number>> = new Map(),
  action
) => {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR_OPEN_CATEGORY': {
      const newOpenCats = new Map(openCats);
      let openCatSet = newOpenCats.get(action.kind);
      if (openCatSet === undefined) {
        openCatSet = new Set();
      }
      if (openCatSet.has(action.category)) {
        openCatSet.delete(action.category);
      } else {
        openCatSet.add(action.category);
      }
      newOpenCats.set(action.kind, openCatSet);
      return newOpenCats;
    }
    default:
      return openCats;
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
  experimental,
  currentProfileUploadedInformation,
  browserConnectionStatus,
  sidebarOpenCategories,
});

export default appStateReducer;
