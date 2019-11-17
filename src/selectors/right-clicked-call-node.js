/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import { getCallNodeIndexFromPath } from '../profile-logic/profile-data';
import { getThreadSelectors } from './per-thread';
import { getProfileViewOptions } from './profile';

import type { Thread, ThreadIndex } from '../types/profile';
import type {
  IndexIntoCallNodeTable,
  CallNodePath,
  CallNodeInfo,
} from '../types/profile-derived';
import type { Selector } from '../types/store';

export type RightClickedCallNodeInfo = {|
  +threadIndex: ThreadIndex,
  +thread: Thread,
  +callNodePath: CallNodePath,
  +callNodeIndex: IndexIntoCallNodeTable,
  +callNodeInfo: CallNodeInfo,
|};

export const getRightClickedCallNodeInfo: Selector<RightClickedCallNodeInfo | null> = createSelector(
  getProfileViewOptions,
  state => {
    const { rightClickedCallNodePath } = getProfileViewOptions(state);

    if (rightClickedCallNodePath !== null) {
      const { getFilteredThread } = getThreadSelectors(
        rightClickedCallNodePath.threadIndex
      );

      return getFilteredThread(state);
    }

    return null;
  },
  state => {
    const { rightClickedCallNodePath } = getProfileViewOptions(state);

    if (rightClickedCallNodePath !== null) {
      const { getCallNodeInfo } = getThreadSelectors(
        rightClickedCallNodePath.threadIndex
      );
      const { callNodeTable } = getCallNodeInfo(state);

      return getCallNodeIndexFromPath(
        rightClickedCallNodePath.callNodePath,
        callNodeTable
      );
    }

    return null;
  },
  state => {
    const { rightClickedCallNodePath } = getProfileViewOptions(state);

    if (rightClickedCallNodePath !== null) {
      const { getCallNodeInfo } = getThreadSelectors(
        rightClickedCallNodePath.threadIndex
      );

      return getCallNodeInfo(state);
    }

    return null;
  },
  ({ rightClickedCallNodePath }, thread, callNodeIndex, callNodeInfo) => {
    if (
      rightClickedCallNodePath !== null &&
      thread !== null &&
      callNodeIndex !== null &&
      callNodeInfo !== null
    ) {
      return {
        ...rightClickedCallNodePath,
        thread,
        callNodeIndex,
        callNodeInfo,
      };
    }

    return null;
  }
);
