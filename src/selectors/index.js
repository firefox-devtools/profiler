/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
export * from './app';
export * from './per-thread';
export * from './profile';
export * from './url-state';
export * from './icons';
export * from './publish';
export * from './zipped-profiles';

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as app from './app';
import { selectedThread } from './per-thread';
import * as profile from './profile';
import * as urlState from './url-state';
import * as icons from './icons';
import * as publish from './publish';
import * as zippedProfiles from './zipped-profiles';

const _selectorsForConsole = {
  app,
  profile,
  urlState,
  icons,
  publish,
  zippedProfiles,
  selectedThread,
};

// Exports require explicit typing. Deduce the type with typeof.
export const selectorsForConsole: typeof _selectorsForConsole = _selectorsForConsole;
