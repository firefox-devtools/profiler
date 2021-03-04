/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { createSelector } from 'reselect';

import {
  getThreads,
  getProfileInterval,
  getSampleUnits,
  getMeta,
} from './profile';
import { getThreadSelectors } from './per-thread';
import { computeMaxThreadCPUDelta } from 'firefox-profiler/profile-logic/profile-data';

import type { Selector, State, Thread } from 'firefox-profiler/types';

export const getIsCPUUtilizationProvided: Selector<boolean> = createSelector(
  getSampleUnits,
  getMeta,
  getCPUProcessedThreads,
  (sampleUnits, meta, threads) => {
    return (
      sampleUnits !== undefined &&
      // Currently checking the features array for 'cpu' feature should be enough,
      // but in the future we may remove that feature and enable it permanently.
      // Therefore we are also checking the samples table to see if we have CPU
      // delta values.
      ((meta.configuration && meta.configuration.features.includes('cpu')) ||
        threads.some(thread => thread.samples.threadCPUDelta !== undefined))
    );
  }
);

/**
 * All threads with processed CPU are needed for max CPU value computation, but
 * they are also needed for each thread. This means that we can't use the
 * createSelector mechanism to properly memoize the component, because
 * getThreadSelectors requires the whole state and that makes it impossible to
 * memoize with createSelector. We need access to the full state and to the
 * individual threads. This function therefore implements some simple memoization
 * behavior on the current list of threads. See getDerivedMarkerInfoForAllThreads
 * for a similar situation.
 */
let _threads = null;
let _cpuProcessedThreads = null;
function getCPUProcessedThreads(state: State): Thread[] {
  const threads = getThreads(state);

  if (_threads !== threads || _cpuProcessedThreads === null) {
    // Storing the threads makes it possible to invalidate the memoized value at
    // the right moment.
    _threads = threads;
    _cpuProcessedThreads = threads.map((thread, threadIndex) =>
      getThreadSelectors(threadIndex).getCPUProcessedThread(state)
    );
  }
  return _cpuProcessedThreads;
}

export const getMaxThreadCPUDelta: Selector<number> = createSelector(
  getCPUProcessedThreads,
  getProfileInterval,
  computeMaxThreadCPUDelta
);
