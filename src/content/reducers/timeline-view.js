import { combineReducers } from 'redux';

function isThreadExpanded(state = new Map(), action) {
  switch (action.type) {
    case 'CHANGE_TIMELINE_EXPANDED_THREAD': {
      const newState = new Map(state);
      newState.set(action.threadIndex, action.isExpanded);
      return newState;
    }
  }
  return state;
}

export default combineReducers({ isThreadExpanded });

export const getTimelineView = state => state.timelineView;
export const getIsThreadExpanded = (state, thread) => {
  return Boolean(getTimelineView(state).isThreadExpanded.get(thread));
};
