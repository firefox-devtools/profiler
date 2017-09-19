/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import type { Action } from '../types/actions';
import type { TimelineViewState } from '../types/reducers';

function hasZoomedViaMousewheel(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'HAS_ZOOMED_VIA_MOUSEWHEEL': {
      return true;
    }
    default:
      return state;
  }
}

export default combineReducers({
  hasZoomedViaMousewheel,
});

export const getTimelineView = (state: Object): TimelineViewState =>
  state.timelineView;
export const getHasZoomedViaMousewheel = (state: Object): boolean => {
  return getTimelineView(state).hasZoomedViaMousewheel;
};
