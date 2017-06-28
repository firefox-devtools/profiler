/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { combineReducers } from 'redux';

function profile(state = null, action) {
  switch (action.type) {
    case 'PROFILE_PROCESSED':
      return action.profile;
    default:
      return state;
  }
}

function summary(state = null, action) {
  switch (action.type) {
    case 'PROFILE_SUMMARY_PROCESSED':
      return action.summary;
    default:
      return state;
  }
}

export default combineReducers({
  profile,
  summary,
});
