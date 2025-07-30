/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { sendAnalytics } from './analytics';

const MAX_TIMINGS_PER_LABEL = 3;
const _timingsPerLabel: Record<string, number> = {};
let _performanceMeasureGeneration = 0;

/**
 * We care about timing information. This function helps log and collect information
 * about how fast our functions are.
 */
export function timeCode<T>(label: string, codeAsACallback: () => T): T {
  if (typeof performance !== 'undefined') {
    let markName: string | undefined;
    if (process.env.NODE_ENV === 'development') {
      if (performance.mark) {
        markName = `time-code-${_performanceMeasureGeneration++}`;
        performance.mark(markName);
      }
    }

    const start = performance.now();
    const result = codeAsACallback();
    const elapsed = Math.round(performance.now() - start);

    // Only log timing information in development mode.
    if (process.env.NODE_ENV === 'development') {
      // Record a UserTiming for this timeCode call.
      if (performance.measure && markName) {
        performance.measure(`TimeCode: ${label}`, markName);
      }
      const style = 'font-weight: bold; color: #f0a';
      console.log(
        `[timing]    %c"${label}"`,
        style,
        `took ${elapsed}ms to execute.`
      );
    }

    // Some portion of users will have timing information sent. Limit this further to
    // only send a few labels per user.
    const sentTimings = _timingsPerLabel[label] || 0;
    if (sentTimings < MAX_TIMINGS_PER_LABEL) {
      _timingsPerLabel[label] = 1 + sentTimings;
      sendAnalytics({
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