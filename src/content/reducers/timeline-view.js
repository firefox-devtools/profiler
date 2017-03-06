// @flow
import { combineReducers } from 'redux';
import type { HorizontalViewport } from '../../common/types/units';
import type { ThreadIndex } from '../../common/types/profile';
import type { Action } from '../actions/types';

type IsThreadExpandedMap = Map<ThreadIndex, boolean>;
type TimelineViewState = {
  isThreadExpanded: IsThreadExpandedMap,
  timelineHorizontalViewport: HorizontalViewport,
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

/**
 * See FlameChartViewport.js for detailed documentation on the viewport.
 */
function timelineHorizontalViewport(
  state: HorizontalViewport = {left: 0, right: 1}, action: Action
) {
  switch (action.type) {
    case 'CHANGE_TIMELINE_HORIZONTAL_VIEWPORT':
      return { left: action.left, right: action.right };
  }
  return state;
}

export default combineReducers({ isThreadExpanded, timelineHorizontalViewport });

export const getTimelineView = (state: Object): TimelineViewState => state.timelineView;
export const getIsThreadExpanded = (state: Object, threadIndex: ThreadIndex) => {
  return Boolean(getTimelineView(state).isThreadExpanded.get(threadIndex));
};
export const getTimelineHorizontalViewport = (state: Object): HorizontalViewport => {
  return getTimelineView(state).timelineHorizontalViewport;
};
