/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import profileView from './profile-view';
import app from './app';
import summaryView from './summary-view';
import urlState from './url-state';
import flameChart from './flame-chart';
import timelineView from './timeline-view';
import icons from './icons';

const reducer = { app, profileView, summaryView, urlState, flameChart, timelineView, icons };

export default reducer;
