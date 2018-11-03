/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Lib } from '../../../types/profile';

import type {
  GeckoProfile,
  GeckoProfileMeta,
  GeckoThread,
  GeckoMarkerStack,
} from '../../../types/gecko-profile';

import { CURRENT_VERSION } from '../../../profile-logic/gecko-profile-versioning';

/**
 * export defaults one object that is an example profile, in the Gecko format,
 * i.e. the format that nsIProfiler.getProfileDataAsync outputs.
 */
export default function createGeckoProfile(): GeckoProfile {
  const parentProcessBinary: Lib = {
    breakpadId: 'F1D957D30B413D55A539BBA06F90DD8F0',
    debugName: 'firefox',
    name: 'firefox',
    path: '/Applications/FirefoxNightly.app/Contents/MacOS/firefox',
    debugPath: '/Applications/FirefoxNightly.app/Contents/MacOS/firefox',
    offset: 0,
    start: 0x100000000,
    end: 0x100000000 + 10000,
    arch: 'x86_64',
  };

  const contentProcessBinary: Lib = {
    breakpadId: '9F950E2CE3CD3E1ABD06D80788B606E60',
    debugName: 'firefox-webcontent',
    name: 'firefox-webcontent',
    path:
      '/Applications/FirefoxNightly.app/Contents/MacOS/firefox-webcontent.app/Contents/MacOS/firefox-webcontent',
    debugPath:
      '/Applications/FirefoxNightly.app/Contents/MacOS/firefox-webcontent.app/Contents/MacOS/firefox-webcontent',
    offset: 0,
    start: 0x100000000,
    end: 0x100000000 + 10000,
    arch: 'x86_64',
  };

  const extraBinaries: Lib[] = [
    {
      breakpadId: '1000000000000000000000000000000A1',
      debugName: 'examplebinary',
      name: 'examplebinary',
      path: '/tmp/examplebinary',
      debugPath: '/tmp/examplebinary',
      offset: 0,
      start: 0x200000000,
      end: 0x200000000 + 20,
      arch: 'x86_64',
    },
    {
      breakpadId: '100000000000000000000000000000A27',
      debugName: 'examplebinary2.pdb',
      name: 'examplebinary2',
      path: 'C:\\examplebinary2',
      debugPath: 'C:\\examplebinary2.pdb',
      offset: 0,
      start: 0x200000000 + 20,
      end: 0x200000000 + 40,
      arch: 'x86_64',
    },
  ];

  const parentProcessMeta: GeckoProfileMeta = {
    abi: 'x86_64-gcc3',
    interval: 1,
    misc: 'rv:48.0',
    oscpu: 'Intel Mac OS X 10.11',
    platform: 'Macintosh',
    processType: 0,
    product: 'Firefox',
    stackwalk: 1,
    startTime: 1460221352723.438,
    shutdownTime: 1560221352723,
    toolkit: 'cocoa',
    version: CURRENT_VERSION,
    categories: [
      {
        name: 'Other',
        color: 'grey',
        subcategories: [],
      },
    ],
  };

  const contentProcessMeta: GeckoProfileMeta = {
    ...parentProcessMeta,
    processType: 2,
    // content process was launched 1 second after parent process:
    startTime: parentProcessMeta.startTime + 1000,
  };

  const contentProcessProfile: GeckoProfile = {
    meta: contentProcessMeta,
    pausedRanges: [],
    libs: [contentProcessBinary].concat(extraBinaries), // libs are stringified in the Gecko profile
    pages: [],
    threads: [
      {
        ..._createGeckoThread(),
        name: 'GeckoMain',
        processType: 'tab',
      },
    ],
    processes: [],
  };

  return {
    meta: parentProcessMeta,
    libs: [parentProcessBinary].concat(extraBinaries),
    pages: [],
    pausedRanges: [],
    threads: [
      {
        ..._createGeckoThread(),
        name: 'GeckoMain',
        processType: 'default',
      },
      {
        ..._createGeckoThread(),
        name: 'Compositor',
        processType: 'default',
      },
    ],
    processes: [contentProcessProfile],
  };
}

function _createGeckoThread(): GeckoThread {
  return {
    name: 'Unnamed',
    registerTime: 0,
    processType: 'default',
    unregisterTime: 100,
    tid: 1111,
    pid: 2222,
    samples: {
      schema: {
        stack: 0,
        time: 1,
        responsiveness: 2,
        rss: 3,
        uss: 4,
      },
      data: [
        [1, 0, 0, null, null], // (root), 0x100000f84
        [2, 1, 0, null, null], // (root), 0x100000f84, 0x100001a45
        [2, 2, 0, null, null], // (root), 0x100000f84, 0x100001a45
        [3, 3, 0, null, null], // (root), 0x100000f84, Startup::XRE_Main
        [0, 4, 0, null, null], // (root)
        [1, 5, 0, null, null], // (root), 0x100000f84
        [4, 6, 0, null, null], // (root), 0x100000f84, frobnicate
      ],
    },
    stackTable: {
      schema: { prefix: 0, frame: 1 },
      data: [
        [null, 0], // (root)
        [0, 1], // (root), 0x100000f84
        [1, 2], // (root), 0x100000f84, 0x100001a45
        [1, 3], // (root), 0x100000f84, Startup::XRE_Main
        [1, 4], // (root), 0x100000f84, frobnicate
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
        subcategory: 7,
      },
      data: [
        [0, false, null, null, null, null], // (root)
        [1, false, null, null, null, null], // 0x100000f84
        [2, false, null, null, null, null], // 0x100001a45
        [3, false, null, null, 4391, 0], // Startup::XRE_Main, line 4391, category Other
        [7, false, 6, null, 34, null], // frobnicate, implementation 'baseline', line 34
      ],
    },
    markers: {
      schema: { name: 0, time: 1, data: 2 },
      data: [
        // Please keep the next marker at the start if you add more markers in
        // this structure.
        // We want to test tracing markers with the missing "start" marker. So
        // here is only the "end" marker without a matching "start" marker.
        [
          10, // Rasterize
          1,
          {
            category: 'Paint',
            interval: 'end',
            type: 'tracing',
          },
        ],
        // This marker is filtered out
        [4, 2, { type: 'VsyncTimestamp' }],
        [
          5, // Reflow
          3,
          {
            category: 'Paint',
            interval: 'start',
            stack: ({
              registerTime: null,
              unregisterTime: null,
              processType: 'default',
              tid: 1111,
              pid: 2222,
              markers: { schema: { name: 0, time: 1, data: 2 }, data: [] },
              name: 'SyncProfile',
              samples: {
                schema: {
                  stack: 0,
                  time: 1,
                  responsiveness: 2,
                  rss: 3,
                  uss: 4,
                  frameNumber: 5,
                  power: 6,
                },
                data: [[2, 1, 0, null, null]], // (root), 0x100000f84, 0x100001a45
              },
            }: GeckoMarkerStack),
            type: 'tracing',
          },
        ],
        [
          10, // Rasterize
          4,
          {
            category: 'Paint',
            interval: 'start',
            type: 'tracing',
          },
        ],
        [
          10, // Rasterize
          5,
          {
            category: 'Paint',
            interval: 'end',
            type: 'tracing',
          },
        ],
        [
          5, // Reflow
          8,
          {
            category: 'Paint',
            interval: 'end',
            type: 'tracing',
          },
        ],
        [
          9,
          11, // Note: this marker is out of order on purpose, to test we correctly sort
          {
            // MinorGC at time 11ms from 11ms to 12ms
            type: 'GCMinor',
            startTime: 11,
            endTime: 12,
          },
        ],
        [
          8,
          9,
          {
            // DOMEvent at time 9ms from 9ms to 10ms, this is the start marker
            type: 'tracing',
            category: 'DOMEvent',
            timeStamp: 1,
            interval: 'start',
            eventType: 'mouseout',
            phase: 3,
          },
        ],
        [
          8,
          10,
          {
            // DOMEvent at time 9ms from 9ms to 10ms, this is the end marker
            type: 'tracing',
            category: 'DOMEvent',
            timeStamp: 1,
            interval: 'end',
            eventType: 'mouseout',
            phase: 3,
          },
        ],
        [
          11, // UserTiming
          12,
          {
            startTime: 12,
            endTime: 13,
            type: 'UserTiming',
            name: 'processing-thread',
            entryType: 'measure',
          },
        ],
        // Nested reflows
        [
          5, // Reflow
          13,
          {
            category: 'Paint',
            interval: 'start',
            stack: {
              markers: { schema: { name: 0, time: 1, data: 2 }, data: [] },
              name: 'SyncProfile',
              registerTime: null,
              unregisterTime: null,
              processType: 'default',
              tid: 1111,
              pid: 2222,
              samples: {
                schema: {
                  stack: 0,
                  time: 1,
                  responsiveness: 2,
                  rss: 3,
                  uss: 4,
                  frameNumber: 5,
                  power: 6,
                },
                data: [[2, 1, 0, null, null]], // (root), 0x100000f84, 0x100001a45
              },
            },
            type: 'tracing',
          },
        ],
        [
          5, // Reflow
          14,
          {
            category: 'Paint',
            interval: 'start',
            stack: {
              markers: { schema: { name: 0, time: 1, data: 2 }, data: [] },
              name: 'SyncProfile',
              registerTime: null,
              unregisterTime: null,
              processType: 'default',
              tid: 1111,
              pid: 2222,
              samples: {
                schema: {
                  stack: 0,
                  time: 1,
                  responsiveness: 2,
                  rss: 3,
                  uss: 4,
                  frameNumber: 5,
                  power: 6,
                },
                data: [[2, 1, 0, null, null]], // (root), 0x100000f84, 0x100001a45
              },
            },
            type: 'tracing',
          },
        ],
        [
          5, // Reflow
          15,
          {
            category: 'Paint',
            interval: 'end',
            type: 'tracing',
          },
        ],
        [
          5, // Reflow
          18,
          {
            category: 'Paint',
            interval: 'end',
            type: 'tracing',
          },
        ],
        [
          12, // ArbitraryName
          21,
          {
            category: 'ArbitraryCategory',
            type: 'tracing',
          },
        ],
        [
          13, // Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5
          24,
          {
            type: 'Network',
            startTime: 22,
            endTime: 24,
            id: 388634410746504,
            status: 'STATUS_STOP',
            pri: -20,
            count: 37838,
            URI: 'https://github.com/rustwasm/wasm-bindgen/issues/2',
            domainLookupStart: 22.1,
            domainLookupEnd: 22.2,
            connectStart: 22.3,
            tcpConnectEnd: 22.4,
            secureConnectionStart: 22.5,
            connectEnd: 22.6,
            requestStart: 22.7,
            responseStart: 22.8,
            responseEnd: 22.9,
          },
        ],
        // INSERT NEW MARKERS HERE

        // Start a tracing marker but never finish it.
        [
          10, // Rasterize
          20,
          {
            category: 'Paint',
            interval: 'start',
            type: 'tracing',
          },
        ],
        // Please keep the open-ended rasterize marker the last marker of the
        // list. Any new markers should be inserted before the rasterize marker.
        // DO NOT ADD NEW MARKERS HERE
      ],
    },
    stringTable: [
      '(root)', // 0
      '0x100000f84', // 1
      '0x100001a45', // 2
      'Startup::XRE_Main', // 3
      'VsyncTimestamp', // 4
      'Reflow', // 5
      'baseline', // 6
      'frobnicate (chrome://blargh:34:35)', // 7
      'DOMEvent', // 8
      'MinorGC', // 9
      'Rasterize', // 10
      'UserTiming', // 11
      'ArbitraryName', // 12
      'Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5', // 13
    ],
  };
}
