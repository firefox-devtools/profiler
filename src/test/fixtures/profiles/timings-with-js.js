/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import getGeckoProfile from './gecko-profile';
import type { GeckoProfile, GeckoThread } from '../../../types/gecko-profile';

export default function createGeckoProfile(): GeckoProfile {
  const geckoProfile = getGeckoProfile();
  return {
    meta: geckoProfile.meta,
    libs: geckoProfile.libs,
    pausedRanges: [],
    threads: [
      _createGeckoThread('GeckoMain'),
      _createGeckoThread('Compositor'),
      _createGeckoThread('GeckoMain'),
    ],
    processes: [],
  };
}

function _createGeckoThread(name: string): GeckoThread {
  return {
    name,
    registerTime: 0,
    processType: 'default',
    unregisterTime: 100,
    tid: 1111,
    pid: 2222,
    samples: {
      schema: { stack: 0, time: 1, responsiveness: 2, rss: 3, uss: 4 },
      data: [
        [1, 0, 0, null, null], // (root), 0x100000f84
        [2, 10, 0, null, null], // (root), 0x100000f84, 0x100001a45
        [2, 20, 0, null, null], // (root), 0x100000f84, 0x100001a45
        [3, 30, 0, null, null], // (root), 0x100000f84, Startup::XRE_Main
        [0, 40, 0, null, null], // (root)
        [1, 50, 0, null, null], // (root), 0x100000f84
        [4, 60, 0, null, null], // (root), 0x100000f84, javascriptOne
        [5, 70, 0, null, null], // (root), 0x100000f84, javascriptOne, javascriptTwo
        [8, 80, 0, null, null], // (root), 0x100000f84, javascriptOne, javascriptTwo, 0x10000f0f0, 0x100fefefe, javascriptThree
        [4, 90, 0, null, null], // (root), 0x100000f84, javascriptOne
      ],
    },
    stackTable: {
      schema: { prefix: 0, frame: 1 },
      data: [
        [null, 0], // 0: (root)
        [0, 1], // 1: (root), 0x100000f84
        [1, 2], // 2: (root), 0x100000f84, 0x100001a45
        [1, 3], // 3: (root), 0x100000f84, Startup::XRE_Main
        [1, 4], // 4: (root), 0x100000f84, javascriptOne
        [4, 5], // 5: (root), 0x100000f84, javascriptOne, javascriptTwo
        [5, 6], // 6: (root), 0x100000f84, javascriptOne, javascriptTwo, 0x10000f0f0
        [6, 7], // 7: (root), 0x100000f84, javascriptOne, javascriptTwo, 0x10000f0f0, 0x100fefefe
        [7, 8], // 8: (root), 0x100000f84, javascriptOne, javascriptTwo, 0x10000f0f0, 0x100fefefe, javascriptThree
      ],
    },
    frameTable: {
      schema: {
        location: 0,
        relevantForJS: 1,
        implementation: 2,
        optimizations: 3,
        line: 4,
        column: 5,
        category: 6,
      },
      data: [
        [0, false, null, null, null, null], // 0: (root)
        [1, false, null, null, null, null], // 1: 0x100000f84
        [2, false, null, null, null, null], // 2: 0x100001a45
        [3, false, null, null, 4391, 16], // 3: Startup::XRE_Main, line 4391, category 16
        [7, false, 6, null, 1, null], // 4: javascriptOne, implementation 'baseline', line 1
        [8, false, 6, null, 2, null], // 5: javascriptTwo, implementation 'baseline', line 2
        [9, false, null, null, null, null], // 6: 0x10000f0f0
        [10, false, null, null, null, null], // 7: 0x100fefefe
        [11, false, null, null, 3, null], // 8: javascriptThree, implementation null, line 3
      ],
    },
    markers: {
      schema: { name: 0, time: 1, data: 2 },
      data: [],
    },
    stringTable: [
      '(root)', // 0
      '0x100000f84', // 1
      '0x100001a45', // 2
      'Startup::XRE_Main', // 3
      'VsyncTimestamp', // 4
      'Reflow', // 5
      'baseline', // 6
      'javascriptOne (http://js.com/foobar:1)', // 7
      'javascriptTwo (http://js.com/foobar:2)', // 8
      '0x10000f0f0', // 9
      '0x100fefefe', // 10
      'javascriptThree (http://js.com/foobar:3)', // 11
    ],
  };
}
