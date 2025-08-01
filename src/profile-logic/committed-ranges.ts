/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  formatBytes,
  formatTimestamp,
} from 'firefox-profiler/utils/format-numbers';
import type { Milliseconds, StartEndRange } from 'firefox-profiler/types';

/**
 * Users can make preview range selections on the profile, and then can commit these
 * to drill down into a profile. This file contains functions for working with these
 * committed ranges.
 */

/**
 * Parse URL encoded committed ranges with the form:
 * "<start><unit><duration>~<start><unit><duration>", where `start` and
 * `duration` are both integer numbers expressed with the specified unit.
 * `start` can be negative. If `start` is missing, this is 0, that is the start
 * of the profile.
 * Here is an example: 12345m1500~12345678u1500 => There are 2 ranges:
 * 1. Starts at 12s 345ms, and is 1.5s (1500ms) wide.
 * 2. Starts at 12s 345ms 678µs, and is 1.5ms (1500µs) wide.
 * There are more examples in the function body.
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
      .map((committedRange) => {
        // Strings look like: 12345m25, which means the start is at 12'345ms, and
        // the duration is 25ms. All values are integer, but the start can be
        // missing.
        // For microseconds: 12345678u25: the start is at 12'345'678µs, and the
        // duration is 25µs.
        // For nanoseconds: 12345678901n25: the start is at 12'345'678'901ns, and the
        // duration is 25ns.
        const m = committedRange.match(/^(-?[0-9]+)?([mun])([0-9]+)$/);
        if (!m) {
          console.error(
            `The range "${committedRange}" couldn't be parsed, ignoring.`
          );
          return null;
        }

        // Let's convert values to milliseconds.
        const start = m[1] ? Number(m[1]) : 0; // A missing start means this is 0.
        const durationUnit = m[2];
        const duration = Number(m[3]);
        if (isNaN(start) || isNaN(duration)) {
          // Note that this shouldn't happen because we should have only digits here.
          console.error(
            `The range "${committedRange}" couldn't be parsed, ignoring. This shouldn't happen.`
          );
          return null;
        }

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
            startInMs = start / 1e6;
            endInMs = (start + duration) / 1e6;
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
      .filter((r) => r !== null)
  );
}

// This function returns a string representation of the pair { start, end } in
// the form of the start + a duration: "<start><unit><duration>". We may lose
// some precision, which is OK. We just need to take care that the resulting
// range is close in length _and_ includes the requested range.
// The <start> part will be left out if it's 0.
// Note that start and end inputs are in milliseconds.
export function stringifyStartEnd({ start, end }: StartEndRange): string {
  // Let's work in integer nanoseconds for calculations, and with string
  // manipulations, so that we avoid rounding errors due to floats.
  // The maximum safe integer allows more than 104 days, that should be
  // enough for our needs.
  const startInNs = Math.floor(start * 1e6);
  const endInNs = Math.ceil(end * 1e6);

  const durationInNs = endInNs - startInNs;
  const strDurationInNs = String(durationInNs);

  let result;

  // The rationale to decide the various thresholds is:
  //
  // * we want at least 2 integer digits for the duration, because we use only
  //   integer values. We felt that values between 1 and 9 ms, and between 1 and
  //   9 µs, do not leave enough "steps".
  // * we'll round up the resulting value.
  // * we don't need too much extra precision either.
  //
  // That's why we decided to use 9_000_000 ns (9ms) and 9000 ns (9µs).
  if (durationInNs > 9e6) {
    // If the initial duration is more than 9ms, we'll output milliseconds
    const startInMs = String(startInNs).slice(0, -6);
    let durationInMs = strDurationInNs.slice(0, -6);
    if (!strDurationInNs.endsWith('000000')) {
      // We round up the duration, this is like running Math.ceil on the integer part.
      durationInMs = (+durationInMs + 1).toString();
    }
    result = `${startInMs}m${durationInMs}`;
  } else if (durationInNs > 9000) {
    // If the initial duration is more than 9µs, we'll output microseconds
    const startInUs = String(startInNs).slice(0, -3);
    let durationInUs = strDurationInNs.slice(0, -3);
    if (!strDurationInNs.endsWith('000')) {
      // We round up the duration, this is like running Math.ceil on the integer part.
      durationInUs = (+durationInUs + 1).toString();
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
 * Stringify committed ranges into the following form:
 * Stringify committed ranges into the following form:
 * "<start><unit><duration>~<start><unit><duration>", where `start` and
 * `duration` are both integer numbers expressed with the specified unit.
 */
export function stringifyCommittedRanges(
  arrayValue: StartEndRange[] = []
): string {
  return arrayValue.map(stringifyStartEnd).join('~');
}

export function getFormattedTimelineValue(
  length: Milliseconds,
  unit: string,
  precision: Milliseconds = Infinity
): string {
  if (unit === 'bytes') {
    return formatBytes(
      length,
      /*significantDigits*/ 2,
      /*maxFractionalDigits*/ 2,
      precision
    );
  }
  return formatTimestamp(
    length,
    /*significantDigits*/ 2,
    /*maxFractionalDigits*/ 2,
    precision
  );
}

export function getCommittedRangeLabels(
  committedRanges: StartEndRange[],
  unit: string
): string[] {
  const labels = committedRanges.map((range) =>
    getFormattedTimelineValue(range.end - range.start, unit)
  );
  return labels;
}
