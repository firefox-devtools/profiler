/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getSlices, printSliceTree } from '../../utils/slice-tree';

function getSlicesEasy(threadCPUPercentage: number[]): string[] {
  const time = threadCPUPercentage.map((_, i) => i);
  const threadCPURatio = new Float64Array(
    threadCPUPercentage.map((p) => p / 100)
  );
  const slices = getSlices([0.05, 0.2, 0.4, 0.6, 0.8], threadCPURatio, time);
  return printSliceTree(slices, time);
}

describe('Activity slice tree', function () {
  it('allocates the right amount of slots', function () {
    expect(getSlicesEasy([0, 0, 6, 0, 0, 0])).toEqual([
      '- 6% for 1.0ms (1 samples): 1.0ms - 2.0ms',
    ]);
    expect(getSlicesEasy([0, 0, 100, 0, 100, 0, 100, 0, 0, 0])).toEqual([
      '- 60% for 5.0ms (5 samples): 1.0ms - 6.0ms',
      '  - 100% for 1.0ms (1 samples): 1.0ms - 2.0ms',
      '  - 100% for 1.0ms (1 samples): 3.0ms - 4.0ms',
      '  - 100% for 1.0ms (1 samples): 5.0ms - 6.0ms',
    ]);
    expect(
      getSlicesEasy([
        0, 0, 6, 0, 0, 0, 0, 34, 86, 34, 0, 0, 0, 0, 12, 9, 0, 0, 0, 7, 0,
      ])
    ).toEqual([
      '- 10% for 18.0ms (18 samples): 1.0ms - 19.0ms',
      '  - 51% for 3.0ms (3 samples): 6.0ms - 9.0ms',
      '    - 86% for 1.0ms (1 samples): 7.0ms - 8.0ms',
    ]);
  });
});
