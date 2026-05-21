/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { collectSliceTree } from 'firefox-profiler/profile-query/cpu-activity';
import { TimestampManager } from 'firefox-profiler/profile-query/timestamps';

describe('profile-query cpu activity', function () {
  it('keeps interesting descendants nested under their parent in collected output', function () {
    const slices = [
      { start: 0, end: 4, avg: 0.5, sum: 50, parent: null },
      { start: 1, end: 3, avg: 0.75, sum: 40, parent: 0 },
      { start: 2, end: 3, avg: 1, sum: 20, parent: 1 },
    ];
    const time = [0, 10, 20, 30, 40];
    const tsManager = new TimestampManager({ start: 0, end: 40 });

    const result = collectSliceTree({ slices, time }, tsManager);

    expect(result).toHaveLength(3);
    expect(result).toEqual([
      expect.objectContaining({
        startTime: 0,
        endTime: 40,
        cpuMs: 20,
        depthLevel: 0,
      }),
      expect.objectContaining({
        startTime: 10,
        endTime: 30,
        cpuMs: 15,
        depthLevel: 1,
      }),
      expect.objectContaining({
        startTime: 20,
        endTime: 30,
        cpuMs: 10,
        depthLevel: 2,
      }),
    ]);
  });

  it('returns an empty list when there are no slices', function () {
    const tsManager = new TimestampManager({ start: 0, end: 10 });

    expect(collectSliceTree({ slices: [], time: [] }, tsManager)).toEqual([]);
  });
});
