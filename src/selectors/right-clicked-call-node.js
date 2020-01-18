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
  state => state,
  state => {
    const { rightClickedCallNode } = getProfileViewOptions(state);

    if (rightClickedCallNode === null) {
      return null;
    }

    const { getFilteredThread, getCallNodeInfo } = getThreadSelectors(
      rightClickedCallNode.threadIndex
    );

    const thread = getFilteredThread(state);

    const callNodeInfo = getCallNodeInfo(state);

    const callNodeIndex = getCallNodeIndexFromPath(
      rightClickedCallNode.callNodePath,
      callNodeInfo.callNodeTable
    );

    if (callNodeIndex === null) {
      return null;
    }

    return {
      ...rightClickedCallNode,
      thread,
      callNodeIndex,
      callNodeInfo,
    };
  }
);
