/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

const MAX_TIMINGS_PER_LABEL = 3;
const _timingsPerLabel = {};

/**
 * We care about timing information. This function helps log and collect information
 * about how fast our functions are.
 */
export function timeCode<T>(label: string, codeAsACallback: () => T): T {
  if (typeof performance !== 'undefined') {
    const start = performance.now();
    const result = codeAsACallback();
    const elapsed = Math.round(performance.now() - start);

    // Only log timing information in development mode.
    if (process.env.NODE_ENV === 'development') {
      console.log(`${label} took ${elapsed}ms to execute.`);
    }

    // Some portion of users will have timing information sent. Limit this further to
    // only send a few labels per user.
    const ga = self.ga;
    if (ga && !(_timingsPerLabel[label] > MAX_TIMINGS_PER_LABEL)) {
      _timingsPerLabel[label] = 1 + (_timingsPerLabel[label] || 0);
      ga('send', {
        hitType: 'timing',
        timingCategory: 'timeCode',
        timingVar: label,
        timingValue: elapsed,
      });
    }

    // Return the actual result.
    return result;
  }
  return codeAsACallback();
}
