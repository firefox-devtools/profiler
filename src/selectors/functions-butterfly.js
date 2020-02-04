/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { createSelector } from 'reselect';
import { getDefaultCategory } from './profile';
import { selectedThreadSelectors } from './per-thread';
import { getCallNodeInfo } from '../profile-logic/profile-data';

import type {
  IndexIntoFuncTable,
  Thread,
  IndexIntoCategoryList,
} from '../types/profile';
import type { CallNodeInfo } from '../types/profile-derived';
import type { State } from '../types/state';

const EMPTY_ARRAY = [];

const getImplementationFilteredCallNodeInfo = createSelector(
  selectedThreadSelectors.getImplementationFilteredThread,
  getDefaultCategory,
  (
    { stackTable, frameTable, funcTable }: Thread,
    defaultCategory: IndexIntoCategoryList
  ): CallNodeInfo => {
    return getCallNodeInfo(stackTable, frameTable, funcTable, defaultCategory);
  }
);

const getCallingInformationForFunction = createSelector(
  selectedThreadSelectors.getImplementationFilteredThread,
  getImplementationFilteredCallNodeInfo,
  (_, funcIndex: IndexIntoFuncTable | null) => funcIndex,
  (
    thread,
    { callNodeTable },
    funcIndex
  ): {| callers: IndexIntoFuncTable[], callees: IndexIntoFuncTable[] |} => {
    if (funcIndex === null) {
      return { callers: EMPTY_ARRAY, callees: EMPTY_ARRAY };
    }

    const callers = new Set();
    const callees = new Set();

    for (let i = 0; i < callNodeTable.length; i++) {
      const thisFuncIndex = callNodeTable.func[i];
      const callerNodeIndex = callNodeTable.prefix[i];

      if (callerNodeIndex >= 0) {
        const callerFuncIndex = callNodeTable.func[callerNodeIndex];

        if (thisFuncIndex === funcIndex) {
          callers.add(callerFuncIndex);
        }

        if (callerFuncIndex === funcIndex) {
          callees.add(thisFuncIndex);
        }
      }
    }

    return { callers: [...callers], callees: [...callees] };
  }
);

export const getCallersForFunction = (
  state: State,
  funcIndex: IndexIntoFuncTable | null
) => getCallingInformationForFunction(state, funcIndex).callers;
export const getCalleesForFunction = (
  state: State,
  funcIndex: IndexIntoFuncTable | null
) => getCallingInformationForFunction(state, funcIndex).callees;
