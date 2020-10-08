/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as app from 'firefox-profiler/app';
import * as icons from 'firefox-profiler/icons';
import * as profileView from 'firefox-profiler/profile-view';
import * as publish from 'firefox-profiler/publish';
import * as receiveProfile from 'firefox-profiler/receive-profile';
import * as zippedProfiles from 'firefox-profiler/zipped-profiles';

export default Object.assign(
  {},
  app,
  icons,
  profileView,
  publish,
  receiveProfile,
  zippedProfiles
);
