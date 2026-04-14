/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getProfileWithThreadCPUDelta,
  getProfileWithDicts,
} from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/types';

import type { ThreadCPUDeltaUnit, Milliseconds } from 'firefox-profiler/types';

const MS_TO_US_MULTIPLIER = 1000;
const MS_TO_NS_MULTIPLIER = 1000000;

describe('computeThreadCPUPercent', function () {
  function setup(
    threadCPUPercent?: Array<number | null>,
    unit: ThreadCPUDeltaUnit = 'ns',
    interval: Milliseconds = 1
  ) {
    const profile = getProfileWithThreadCPUDelta(
      [threadCPUPercent],
      unit,
      interval
    );
    const { derivedThreads } = getProfileWithDicts(profile);
    const [thread] = derivedThreads;
    const cpuPercent = [...ensureExists(thread.samples.threadCPUPercent)];

    return { profile, cpuPercent };
  }

  it('sets the first value to zero and turns null values into 100% CPU', function () {
    // Testing the case where only the values in the middle are null.
    const { cpuPercent: cpuPercent1 } = setup([
      null,
      0.1 * MS_TO_NS_MULTIPLIER,
      null,
      null,
      null,
      null,
      0.2 * MS_TO_NS_MULTIPLIER,
    ]);
    expect(cpuPercent1).toEqual([0, 10, 100, 100, 100, 100, 20, 0]);

    // Testing the case where the values at the start are null.
    const { cpuPercent: cpuPercent2 } = setup([
      null,
      null,
      null,
      0.1 * MS_TO_NS_MULTIPLIER,
    ]);
    expect(cpuPercent2).toEqual([0, 100, 100, 10, 0]);

    // Testing the case where the values at the end are null.
    // This does not happen in profiles from Firefox - Firefox only leaves values
    // at the start null (the first one is always null, and the 2nd to nth values
    // may be null for samples collected by the base profiler (bug 1756519)).
    const { cpuPercent: cpuPercent3 } = setup([
      0,
      0.1 * MS_TO_NS_MULTIPLIER,
      null,
      null,
    ]);
    expect(cpuPercent3).toEqual([0, 10, 100, 100, 0]);
  });

  it('processes Linux timing values and caps them to 100% if they are more than the interval values', function () {
    // Interval is in the ms values and Linux uses ns for threadCPUDelta values.
    const intervalMs = 1;
    const { cpuPercent: cpuPercent1 } = setup(
      [
        0,
        0.5 * MS_TO_NS_MULTIPLIER, // <- Less than the interval
        0.7 * MS_TO_NS_MULTIPLIER, // <- Less than the interval
        1 * MS_TO_NS_MULTIPLIER, // <- Equal to the interval, should be fine
        1.2 * MS_TO_NS_MULTIPLIER, // <- More than the interval, should be capped to 100%
        23 * MS_TO_NS_MULTIPLIER, // <- More than the interval, should be capped to 100%
      ],
      'ns',
      intervalMs
    );

    expect(cpuPercent1).toEqual([
      0,
      50, // <- not changed
      70, // <- not changed
      100, // <- not changed
      100, // <- capped to 100%
      100, // <- capped to 100%
      0,
    ]);
  });

  it('processes macOS timing values and caps them to 100% if they are more than the interval values', function () {
    // Interval is in the ms values and macOS uses µs for threadCPUDelta values.
    const intervalMs = 1;
    const { cpuPercent: cpuPercent1 } = setup(
      [
        0,
        0.5 * MS_TO_US_MULTIPLIER, // <- Less than the interval
        0.7 * MS_TO_US_MULTIPLIER, // <- Less than the interval
        1 * MS_TO_US_MULTIPLIER, // <- Equal to the interval, should be fine
        1.2 * MS_TO_US_MULTIPLIER, // <- More than the interval, should be capped to 100%
        23 * MS_TO_US_MULTIPLIER, // <- More than the interval, should be capped to 100%
      ],
      'µs',
      intervalMs
    );

    expect(cpuPercent1).toEqual([
      0,
      50, // <- not changed
      70, // <- not changed
      100, // <- not changed
      100, // <- capped to 100%
      100, // <- capped to 100%
      0,
    ]);
  });

  it('does not process the Windows values for 100% capping because they are not timing values', function () {
    // Use the ns conversion multiplier to imitate the worst case.
    const intervalMs = 1;
    const threadCPUPercent = [
      0,
      0.5 * MS_TO_NS_MULTIPLIER,
      0.7 * MS_TO_NS_MULTIPLIER,
      1 * MS_TO_NS_MULTIPLIER,
      1.2 * MS_TO_NS_MULTIPLIER,
      23 * MS_TO_NS_MULTIPLIER,
      123123 * MS_TO_NS_MULTIPLIER,
    ];
    const { cpuPercent: cpuPercent1 } = setup(
      threadCPUPercent,
      'variable CPU cycles',
      intervalMs
    );

    // 123123 is the max value, everything should be based on it.
    // Values are integer percentages rounded to the nearest percent; values
    // much smaller than the max round to 0.
    expect(cpuPercent1).toEqual([
      0,
      0, // 0.5/123123 rounds to 0%
      0, // 0.7/123123 rounds to 0%
      0, // 1/123123 rounds to 0%
      0, // 1.2/123123 rounds to 0%
      0, // 23/123123 rounds to 0%
      100, // 123123/123123 = 100%
      0,
    ]);
  });
});
