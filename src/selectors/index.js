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

// Normally we don't need that type because flow can infer types, but on that
// object, it gives weird flow errors that say missing type annotation for X.
// Only adding a type like that seems to solve it.
type Selectors = {
  app: typeof app,
  profile: typeof profile,
  urlState: typeof urlState,
  icons: typeof icons,
  publish: typeof publish,
  zippedProfiles: typeof zippedProfiles,
  selectedThread: typeof selectedThread,
};

export default ({
  app,
  profile,
  urlState,
  icons,
  publish,
  zippedProfiles,
  selectedThread,
}: Selectors);
