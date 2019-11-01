/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import { getCallNodeIndexFromPath } from '../profile-logic/profile-data';
import { getThreadSelectors } from './per-thread';
import { getProfileViewOptions } from './profile';

import type {
  CallNodePath,
  IndexIntoCallNodeTable,
} from '../types/profile-derived';
import type { Selector } from '../types/store';

export const getRightClickedCallNodePath: Selector<CallNodePath | null> = createSelector(
  getProfileViewOptions,
  viewOptions => {
    return viewOptions.rightClickedCallNodePath
      ? viewOptions.rightClickedCallNodePath.callNodePath
      : null;
  }
);

export const getRightClickedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> = state => {
  const viewOptions = getProfileViewOptions(state);

  if (viewOptions.rightClickedCallNodePath === null) {
    return null;
  }

  const { threadIndex, callNodePath } = viewOptions.rightClickedCallNodePath;
  const { getCallNodeInfo } = getThreadSelectors(threadIndex);
  const { callNodeTable } = getCallNodeInfo(state);

  return getCallNodeIndexFromPath(callNodePath, callNodeTable);
};
