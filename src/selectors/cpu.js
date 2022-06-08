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
  getCounter,
} from './profile';
import { getThreadSelectors } from './per-thread';
import { computeMaxThreadCPUDeltaPerMs } from 'firefox-profiler/profile-logic/cpu';

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
        threads.some((thread) => thread.samples.threadCPUDelta !== undefined))
    );
  }
);

/**
 * It will return true if there are experimental process CPU threads in the profile.
 */
export const getAreThereAnyProcessCPUCounters: Selector<boolean> =
  createSelector(
    getCounter,
    (counters) =>
      counters !== null &&
      counters.some((counter) => counter.category === 'CPU')
  );

/**
 * This function returns the list of all threads after the CPU values have been
 * processed. This uses a selector from the per-thread selectors. Because we'll
 * use this selector for every thread, and also need the full state for this call,
 * we can't use the simple memoization from `createSelector`, and instead we
 * need to implement our own simple memoization.
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

export const getMaxThreadCPUDeltaPerMs: Selector<number> = createSelector(
  getCPUProcessedThreads,
  getProfileInterval,
  computeMaxThreadCPUDeltaPerMs
);
