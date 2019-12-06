/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import memoize from 'memoize-immutable';

import type { Milliseconds } from '../types/units';
import type {
  BatchUID,
  ReactPriority,
  ReactProfilerData,
} from '../types/react';

function unmemoizedGetBatchRange(
  batchUID: BatchUID,
  priority: ReactPriority,
  reactProfilerData: ReactProfilerData
): [Milliseconds, Milliseconds] {
  const { measures } = reactProfilerData[priority];

  let startTime = 0;
  let stopTime = Infinity;

  let i = 0;

  for (i; i < measures.length; i++) {
    const measure = measures[i];
    if (measure.batchUID === batchUID) {
      startTime = measure.timestamp;
      break;
    }
  }

  for (i; i < measures.length; i++) {
    const measure = measures[i];
    stopTime = measure.timestamp;
    if (measure.batchUID !== batchUID) {
      break;
    }
  }

  return [startTime, stopTime];
}

export const getBatchRange: typeof unmemoizedGetBatchRange = memoize(
  unmemoizedGetBatchRange,
  {
    limit: 1,
  }
);
