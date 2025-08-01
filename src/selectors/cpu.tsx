/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';

import { getThreads, getSampleUnits, getMeta, getCounters } from './profile';

import { Selector } from 'firefox-profiler/types';

export const getIsCPUUtilizationProvided: Selector<boolean> = createSelector(
  getSampleUnits,
  getMeta,
  getThreads,
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
    getCounters,
    (counters) =>
      counters !== null &&
      counters.some((counter) => counter.category === 'CPU')
  );
