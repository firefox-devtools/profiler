// @flow
import { combineReducers } from 'redux';
import type { ThreadIndex } from '../../common/types/profile';
import type { Action } from '../actions/types';

type IsThreadExpandedMap = Map<ThreadIndex, boolean>;
type TimelineViewState = {
  isThreadExpanded: IsThreadExpandedMap,
}

function isThreadExpanded(state: IsThreadExpandedMap = new Map(), action: Action) {
  switch (action.type) {
    case 'CHANGE_TIMELINE_EXPANDED_THREAD': {
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

function hasZoomedViaMousewheel(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'HAS_ZOOMED_VIA_MOUSEWHEEL': {
      return true;
    }
  }
  return state;
}

export default combineReducers({ isThreadExpanded, hasZoomedViaMousewheel });

export const getTimelineView = (state: Object): TimelineViewState => state.timelineView;
export const getIsThreadExpanded = (state: Object, threadIndex: ThreadIndex) => {
  return Boolean(getTimelineView(state).isThreadExpanded.get(threadIndex));
};
export const getHasZoomedViaMousewheel = (state: Object): boolean => {
  return getTimelineView(state).hasZoomedViaMousewheel;
};
