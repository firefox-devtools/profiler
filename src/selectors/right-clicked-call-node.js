/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import { getCallNodeIndexFromPath } from '../profile-logic/profile-data';
import { getThreadSelectors } from './per-thread';
import { getProfileViewOptions } from './profile';

import type { ThreadIndex } from '../types/profile';
import type {
  IndexIntoCallNodeTable,
  CallNodePath,
} from '../types/profile-derived';
import type { Selector } from '../types/store';

export const getRightClickedCallNodeThreadIndex: Selector<ThreadIndex | null> = createSelector(
  getProfileViewOptions,
  ({ rightClickedCallNodePath }) =>
    rightClickedCallNodePath ? rightClickedCallNodePath.threadIndex : null
);

export const getRightClickedCallNodePath: Selector<CallNodePath | null> = createSelector(
  getProfileViewOptions,
  ({ rightClickedCallNodePath }) =>
    rightClickedCallNodePath ? rightClickedCallNodePath.callNodePath : null
);

export const getRightClickedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> = createSelector(
  getRightClickedCallNodePath,
  state => {
    const threadIndex = getRightClickedCallNodeThreadIndex(state);

    if (threadIndex !== null) {
      const { getCallNodeInfo } = getThreadSelectors(threadIndex);
      const { callNodeTable } = getCallNodeInfo(state);

      return callNodeTable;
    }

    return null;
  },
  (callNodePath, callNodeTable) => {
    if (callNodePath && callNodeTable) {
      return getCallNodeIndexFromPath(callNodePath, callNodeTable);
    }

    return null;
  }
);
