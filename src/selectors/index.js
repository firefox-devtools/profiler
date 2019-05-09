/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as app from './app';
import { selectedThreadSelectors as selectedThread } from './per-thread';
import * as profile from './profile';
import * as urlState from './url-state';
import * as icons from './icons';
import * as publish from './publish';
import * as zippedProfiles from './zipped-profiles';

const allSelectors = {
  app,
  profile,
  urlState,
  icons,
  publish,
  zippedProfiles,
  selectedThread,
};

// Flow requires that all exported object is explicitely typed.
export default (allSelectors: typeof allSelectors);
