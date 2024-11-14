/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';

import {
  computeProfileFlowInfo,
  computeFlowTiming,
} from '../profile-logic/marker-data';
import { getThreadSelectors } from './per-thread';
import { getActiveFlows } from './url-state';
import type { ThreadSelectors } from './per-thread';
import {
  getThreads,
  getMarkerSchema,
  getRawProfileSharedData,
} from './profile';

import type {
  Selector,
  State,
  MarkerIndex,
  Marker,
  ProfileFlowInfo,
  FlowTiming,
} from 'firefox-profiler/types';

function _arraysShallowEqual(arr1: any[], arr2: any[]): boolean {
  return arr1.length === arr2.length && arr1.every((val, i) => val === arr2[i]);
}

function _createSelectorForAllThreads<T>(
  f: (selectors: ThreadSelectors, state: State) => T
): Selector<T[]> {
  let previousOutputPerThread: T[] = [];
  return function recomputeSelectorForAllThreads(state: State): T[] {
    const threads = getThreads(state);
    let outputPerThread = threads.map((_thread, i) => {
      const threadSelectors = getThreadSelectors(i);
      return f(threadSelectors, state);
    });
    if (_arraysShallowEqual(outputPerThread, previousOutputPerThread)) {
      outputPerThread = previousOutputPerThread;
    }
    previousOutputPerThread = outputPerThread;
    return outputPerThread;
  };
}

export const getFullMarkerListPerThread: Selector<Marker[][]> =
  _createSelectorForAllThreads(({ getFullMarkerList }, state) =>
    getFullMarkerList(state)
  );

export const getMarkerChartLabelGetterPerThread: Selector<
  Array<(marker: MarkerIndex) => string>
> = _createSelectorForAllThreads(({ getMarkerChartLabelGetter }, state) =>
  getMarkerChartLabelGetter(state)
);

export const getProfileFlowInfo: Selector<ProfileFlowInfo> = createSelector(
  getFullMarkerListPerThread,
  getThreads,
  getMarkerSchema,
  getRawProfileSharedData,
  computeProfileFlowInfo
);

export const getFlowTiming: Selector<FlowTiming> = createSelector(
  getProfileFlowInfo,
  getActiveFlows,
  computeFlowTiming
);
