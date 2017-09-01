/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as app from './app';
import * as icons from './icons';
import * as profileSummary from './profile-summary';
import * as profileView from './profile-view';
import * as receiveProfile from './receive-profile';
import * as timeline from './timeline';
import * as profileUpload from './profile-upload';
import * as shortUrl from './short-url';
import * as urlState from './url-state';

export default Object.assign(
  {},
  app,
  icons,
  profileSummary,
  profileUpload,
  profileView,
  receiveProfile,
  shortUrl,
  timeline,
  urlState
);
