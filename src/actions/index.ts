/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as app from './app';
import * as icons from './icons';
import * as l10n from './l10n';
import * as profileView from './profile-view';
import * as publish from './publish';
import * as receiveProfile from './receive-profile';
import * as zippedProfiles from './zipped-profiles';
import * as code from './code';

export default Object.assign(
  {},
  app,
  icons,
  l10n,
  profileView,
  publish,
  receiveProfile,
  zippedProfiles,
  code
);
