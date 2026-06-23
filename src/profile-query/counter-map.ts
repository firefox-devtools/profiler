/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { CounterIndex } from 'firefox-profiler/types';

/**
 * A handle like "c-2" always refers to counter index 2 for this profile,
 * making handles stable across sessions for the same processed profile data.
 */
export function getCounterHandle(counterIndex: CounterIndex): `c-${number}` {
  return `c-${counterIndex}`;
}

/**
 * Parse a counter handle and validate it against the number of counters.
 */
export function parseCounterHandle(
  counterHandle: string,
  counterCount: number
): CounterIndex {
  const match = /^c-(\d+)$/.exec(counterHandle);
  if (match === null) {
    throw new Error(`Unknown counter ${counterHandle}`);
  }

  const counterIndex = Number(match[1]);
  if (
    !Number.isInteger(counterIndex) ||
    counterIndex < 0 ||
    counterIndex >= counterCount
  ) {
    throw new Error(`Unknown counter ${counterHandle}`);
  }

  return counterIndex;
}
