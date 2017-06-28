/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import type { ThreadIndex } from '../types/profile';
import type { Action } from '../types/actions';
import type { IsThreadExpandedMap, TimelineViewState } from '../types/reducers';

function isFlameChartExpanded(
  state: IsThreadExpandedMap = new Map(),
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_TIMELINE_FLAME_CHART_EXPANDED_THREAD': {
      const newState = new Map(state);
      // For now only allow one thread to be open at a time, evaluate whether or not do
      // more than one.
      if (action.isExpanded) {
        for (const [threadIndex, isExpanded] of state) {
          if (isExpanded) {
            newState.set(threadIndex, false);
          }
        }
      }
      newState.set(action.threadIndex, action.isExpanded);
      return newState;
    }
  }
  return state;
}

function areMarkersExpanded(
  state: IsThreadExpandedMap = new Map(),
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_TIMELINE_MARKERS_EXPANDED_THREAD': {
      const newState = new Map(state);
      newState.set(action.threadIndex, action.isExpanded);
      return newState;
    }
  }
  return state;
}

function hasZoomedViaMousewheel(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'HAS_ZOOMED_VIA_MOUSEWHEEL': {
      return true;
    }
  }
  return state;
}

export default combineReducers({
  isFlameChartExpanded,
  areMarkersExpanded,
  hasZoomedViaMousewheel,
});

export const getTimelineView = (state: Object): TimelineViewState =>
  state.timelineView;
export const getIsFlameChartExpanded = (
  state: Object,
  threadIndex: ThreadIndex
) => {
  return Boolean(getTimelineView(state).isFlameChartExpanded.get(threadIndex));
};
export const getAreMarkersExpanded = (
  state: Object,
  threadIndex: ThreadIndex
) => {
  // Default to being expanded by checking if not equal to false.
  return getTimelineView(state).areMarkersExpanded.get(threadIndex) !== false;
};
export const getHasZoomedViaMousewheel = (state: Object): boolean => {
  return getTimelineView(state).hasZoomedViaMousewheel;
};
