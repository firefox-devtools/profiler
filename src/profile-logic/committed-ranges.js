/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { StartEndRange } from 'firefox-profiler/types';

/**
 * Users can make preview range selections on the profile, and then can commit these
 * to drill down into a profile. This file contains functions for working with these
 * committed ranges.
 */

/**
 * Parse URL encoded committed ranges with the form:
 * "<start><unit><duration>~<start><unit><duration>", where `start` and
 * `duration` are both integer numbers expressed with the specified unit.
 * `start` can be negative.
 */
export function parseCommittedRanges(
  stringValue: string = ''
): StartEndRange[] {
  if (!stringValue) {
    return [];
  }
  return (
    stringValue
      .split('~')
      .map(s => {
        // Strings look like: 12345m25, which means the start is at 12'345ms, and
        // the duration is 25ms. All values are integer.
        // For microseconds: 12345678u25: the start is at 12'345'678µs, and the
        // duration is 25µs.
        // For nanoseconds: 12345678901n25: the start is at 12'345'678'901ns, and the
        // duration is 25ns.
        const m = s.match(/^(-?[0-9]+)([mun])([0-9]+)$/);
        if (!m) {
          // Flow doesn't like that we return null, but that's OK
          // because we filter it out in the last operation.
          // $FlowExpectError
          return null;
        }

        // Let's convert values to milliseconds.
        const start = Number(m[1]);
        const durationUnit = m[2];
        const duration = Number(m[3]);

        let startInMs;
        let endInMs;
        switch (durationUnit) {
          case 'm':
            // values are in milliseconds.
            startInMs = start;
            endInMs = start + duration;
            break;
          case 'u':
            // values are in microseconds.
            startInMs = start / 1000;
            endInMs = (start + duration) / 1000;
            break;
          case 'n':
            // values are in nanoseconds.
            startInMs = start / 1000000;
            endInMs = (start + duration) / 1000000;
            break;
          default:
            throw new Error(
              `We couldn't recognize the unit ${durationUnit}, which can't happen because the regexp wouldn't match.`
            );
        }

        if (startInMs === endInMs) {
          // Duration could be 0 at first, or float operations rounding errors could
          // also produce this: make sure that we have a non-empty range.
          endInMs += 0.0001;
        }

        return { start: startInMs, end: endInMs };
      })
      // Filter out possible null values coming from bad inputs.
      .filter(value => value)
  );
}

// This function returns a string representation of the pair { start, end } in
// the form of the start + a duration: "<start><unit><duration>". We may lose
// some precision, which is OK. We just need to take care that the resulting
// range is close in length _and_ includes the requested range.
// Note that start and end inputs are in milliseconds.
export function stringifyStartEnd({ start, end }: StartEndRange): string {
  // Let's work in integer nanoseconds for calculations, and with string
  // manipulations, so that we avoid rounding errors due to floats.
  const startInNs = Math.floor(start * 1000000);
  const endInNs = Math.ceil(end * 1000000);

  const durationInNs = endInNs - startInNs;
  const strDurationInNs = String(durationInNs);

  let result;
  if (durationInNs > 9000000) {
    // If the initial duration is more than 9ms, we'll output milliseconds
    const startInMs = String(startInNs).slice(0, -6);
    let durationInMs = strDurationInNs.slice(0, -6);
    if (!strDurationInNs.endsWith('000000')) {
      // We round up the duration, this is like Math.ceil on integer parts.
      durationInMs = Number(durationInMs) + 1;
    }
    result = `${startInMs}m${durationInMs}`;
  } else if (durationInNs > 9000) {
    // If the initial duration is more than 9µs, we'll output microseconds
    const startInUs = String(startInNs).slice(0, -3);
    let durationInUs = strDurationInNs.slice(0, -3);
    if (!strDurationInNs.endsWith('000')) {
      // We round up the duration, this is like Math.ceil on integer parts.
      durationInUs = Number(durationInUs) + 1;
    }
    result = `${startInUs}u${durationInUs}`;
  } else if (durationInNs === 0) {
    result = `${startInNs}n1`;
  } else {
    result = `${startInNs}n${strDurationInNs}`;
  }

  return result;
}

/**
 * Stringify committed ranges into the following form: "start-end~start-end".
 */
export function stringifyCommittedRanges(
  arrayValue: StartEndRange[] = []
): string {
  return arrayValue.map(stringifyStartEnd).join('~');
}

export function getFormattedTimeLength(length: number): string {
  if (length >= 10000) {
    return `${(length / 1000).toFixed(0)} sec`;
  }
  if (length >= 1000) {
    return `${(length / 1000).toFixed(1)} sec`;
  }
  return `${length.toFixed(0)} ms`;
}

export function getCommittedRangeLabels(
  committedRanges: StartEndRange[]
): string[] {
  const labels = committedRanges.map(range =>
    getFormattedTimeLength(range.end - range.start)
  );
  return labels;
}
