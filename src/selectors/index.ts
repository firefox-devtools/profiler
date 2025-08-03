/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export * from './app';
export * from './l10n';
export * from './per-thread';
export * from './profile';
export * from './url-state';
export * from './icons';
export * from './publish';
export * from './zipped-profiles';
export * from './cpu';
export * from './code';

import * as app from './app';
import {
  selectedThreadSelectors as selectedThread,
  selectedNodeSelectors as selectedNode,
} from './per-thread';
import * as profile from './profile';
import * as urlState from './url-state';
import * as icons from './icons';
import * as publish from './publish';
import * as zippedProfiles from './zipped-profiles';
import * as l10n from './l10n';
import * as cpu from './cpu';
import * as code from './code';

const _selectorsForConsole = {
  app,
  profile,
  urlState,
  icons,
  publish,
  zippedProfiles,
  selectedThread,
  selectedNode,
  l10n,
  cpu,
  code,
};

// Exports require explicit typing. Deduce the type with typeof.
export const selectorsForConsole: typeof _selectorsForConsole =
  _selectorsForConsole;
