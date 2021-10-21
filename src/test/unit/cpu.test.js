/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { processThreadCPUDelta } from 'firefox-profiler/profile-logic/cpu';
import { getProfileWithThreadCPUDelta } from '../fixtures/profiles/processed-profile';

import type { ThreadCPUDeltaUnit, Milliseconds } from 'firefox-profiler/types';

const MS_TO_US_MULTIPLIER = 1000;
const MS_TO_NS_MULTIPLIER = 1000000;

describe('processThreadCPUDelta', function () {
  function setup(
    threadCPUDelta?: Array<number | null>,
    unit: ThreadCPUDeltaUnit = 'ns',
    interval: Milliseconds = 1
  ) {
    const profile = getProfileWithThreadCPUDelta(
      [threadCPUDelta],
      unit,
      interval
    );
    const [thread] = profile.threads;

    if (!profile.meta.sampleUnits) {
      throw new Error('SampleUnits object could not found in the profile.');
    }

    const processedThread = processThreadCPUDelta(
      thread,
      profile.meta.sampleUnits,
      profile.meta.interval
    );

    return { profile, thread, processedThread };
  }

  it('removes the threadCPUDelta array if all of its values are null', function () {
    const { processedThread } = setup([null, null, null, null, null, null]);
    expect(processedThread.samples.threadCPUDelta).toBe(undefined);
  });

  it('does not remove the values if there is at least one non-null value ', function () {
    const { processedThread } = setup([null, null, null, null, 0.1]);
    // We do the processing for null elements, see the following test for a more specific assertion.
    expect(processedThread.samples.threadCPUDelta).not.toBe(undefined);
  });

  it('throws if there are no threadCPUDelta values', function () {
    expect(() => setup(undefined)).toThrow();
  });

  it('removes the null values by finding the closest non-null threadCPUDelta value', function () {
    // Testing the case where only the values in the middle are null.
    const { processedThread: processedThread1 } = setup([
      0.1,
      null,
      null,
      null,
      null,
      0.2,
    ]);
    expect(processedThread1.samples.threadCPUDelta).toEqual([
      0.1, 0.1, 0.1, 0.2, 0.2, 0.2,
    ]);

    // Testing the case where the values at the start are null.
    const { processedThread: processedThread2 } = setup([null, null, 0.1]);
    expect(processedThread2.samples.threadCPUDelta).toEqual([0.1, 0.1, 0.1]);

    // Testing the case where the values at the end are null.
    const { processedThread: processedThread3 } = setup([0.1, null, null]);
    expect(processedThread3.samples.threadCPUDelta).toEqual([0.1, 0.1, 0.1]);

    // If there are values in either side of a null sample with the same distance,
    // pick the latter one.
    const { processedThread: processedThread4 } = setup([0.1, null, 0.2]);
    expect(processedThread4.samples.threadCPUDelta).toEqual([0.1, 0.2, 0.2]);
  });

  it('processes Linux timing values and caps them to 100% if they are more than the interval values', function () {
    // Interval is in the ms values and Linux uses ns for threadCPUDelta values.
    const intervalMs = 1;
    const { processedThread: processedThread1 } = setup(
      [
        0.5 * MS_TO_NS_MULTIPLIER, // <- Less than the interval
        0.7 * MS_TO_NS_MULTIPLIER, // <- Less than the interval
        1 * MS_TO_NS_MULTIPLIER, // <- Equal to the interval, should be fine
        1.2 * MS_TO_NS_MULTIPLIER, // <- More than the interval, should be capped to 100%
        23 * MS_TO_NS_MULTIPLIER, // <- More than the interval, should be capped to 100%
      ],
      'ns',
      intervalMs
    );

    expect(processedThread1.samples.threadCPUDelta).toEqual([
      0.5 * MS_TO_NS_MULTIPLIER, // <- not changed
      0.7 * MS_TO_NS_MULTIPLIER, // <- not changed
      1 * MS_TO_NS_MULTIPLIER, // <- not changed
      1 * MS_TO_NS_MULTIPLIER, // <- capped to 100%
      1 * MS_TO_NS_MULTIPLIER, // <- capped to 100%
    ]);
  });

  it('processes macOS timing values and caps them to 100% if they are more than the interval values', function () {
    // Interval is in the ms values and macOS uses µs for threadCPUDelta values.
    const intervalMs = 1;
    const { processedThread: processedThread1 } = setup(
      [
        0.5 * MS_TO_US_MULTIPLIER, // <- Less than the interval
        0.7 * MS_TO_US_MULTIPLIER, // <- Less than the interval
        1 * MS_TO_US_MULTIPLIER, // <- Equal to the interval, should be fine
        1.2 * MS_TO_US_MULTIPLIER, // <- More than the interval, should be capped to 100%
        23 * MS_TO_US_MULTIPLIER, // <- More than the interval, should be capped to 100%
      ],
      'µs',
      intervalMs
    );

    expect(processedThread1.samples.threadCPUDelta).toEqual([
      0.5 * MS_TO_US_MULTIPLIER, // <- not changed
      0.7 * MS_TO_US_MULTIPLIER, // <- not changed
      1 * MS_TO_US_MULTIPLIER, // <- not changed
      1 * MS_TO_US_MULTIPLIER, // <- capped to 100%
      1 * MS_TO_US_MULTIPLIER, // <- capped to 100%
    ]);
  });

  it('does not process the Windows values for 100% capping because they are not timing values', function () {
    // Use the ns conversion multiplier to imitate the worst case.
    const intervalMs = 1;
    const threadCPUDelta = [
      0.5 * MS_TO_NS_MULTIPLIER,
      0.7 * MS_TO_NS_MULTIPLIER,
      1 * MS_TO_NS_MULTIPLIER,
      1.2 * MS_TO_NS_MULTIPLIER,
      23 * MS_TO_NS_MULTIPLIER,
      123123 * MS_TO_NS_MULTIPLIER,
    ];
    const { processedThread: processedThread1 } = setup(
      threadCPUDelta,
      'variable CPU cycles',
      intervalMs
    );

    // It shouldn't change the values!
    expect(processedThread1.samples.threadCPUDelta).toEqual(threadCPUDelta);
  });

  it('processes the timing values and caps the first element correctly if it exceeds the interval', function () {
    // Testing the case where only the values in the middle are null.
    const interval = 1;
    const { processedThread: processedThread1 } = setup(
      [2 * MS_TO_NS_MULTIPLIER, 0.5 * MS_TO_NS_MULTIPLIER],
      'ns',
      interval
    );

    expect(processedThread1.samples.threadCPUDelta).toEqual([
      interval * MS_TO_NS_MULTIPLIER,
      0.5 * MS_TO_NS_MULTIPLIER,
    ]);
  });
});
