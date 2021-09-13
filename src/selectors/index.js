/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
export * from './app';
export * from './l10n';
export * from './per-thread';
export * from './profile';
export * from './url-state';
export * from './icons';
export * from './publish';
export * from './zipped-profiles';
export * from './cpu';

import * as app from './app';
import { selectedThreadSelectors as selectedThread } from './per-thread';
import * as profile from './profile';
import * as urlState from './url-state';
import * as icons from './icons';
import * as publish from './publish';
import * as zippedProfiles from './zipped-profiles';
import * as l10n from './l10n';
import * as cpu from './cpu';

const _selectorsForConsole = {
  app,
  profile,
  urlState,
  icons,
  publish,
  zippedProfiles,
  selectedThread,
  l10n,
  cpu,
};

// Exports require explicit typing. Deduce the type with typeof.
export const selectorsForConsole: typeof _selectorsForConsole =
  _selectorsForConsole;
