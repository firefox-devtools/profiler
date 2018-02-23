/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import profileView from './profile-view';
import app from './app';
import urlState from './url-state';
import stackChart from './stack-chart';
import icons from './icons';
import zippedProfiles from './zipped-profiles';
import { combineReducers } from 'redux';

export default combineReducers({
  app,
  profileView,
  urlState,
  stackChart,
  icons,
  zippedProfiles,
});
