/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';

import { getProfileViewOptions } from './profile';

import type { ThreadIndex } from '../types/profile';
import type { CallNodePath } from '../types/profile-derived';
import type { Selector } from '../types/store';

export type RightClickedCallNodeInfo = {|
  +threadIndex: ThreadIndex,
  +callNodePath: CallNodePath,
|};

export const getRightClickedCallNodeInfo: Selector<RightClickedCallNodeInfo | null> = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.rightClickedCallNode
);
