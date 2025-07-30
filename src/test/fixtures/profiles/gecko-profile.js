/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  LibMapping,
  ProfilerOverheadStats,
  GeckoProfile,
  GeckoSubprocessProfile,
  GeckoProfileFullMeta,
  GeckoProfileShortMeta,
  GeckoThread,
  GeckoCounter,
  GeckoMarkers,
  GeckoMarkerStack,
  GeckoProfilerOverhead,
  Milliseconds,
  MarkerPhase,
  IndexIntoCategoryList,
  MarkerPayload_Gecko,
  IPCMarkerPayload_Gecko,
  GeckoMarkerTuple,
  VisualMetrics,
} from 'firefox-profiler/types';

import {
  GECKO_PROFILE_VERSION,
  INSTANT,
  INTERVAL,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';

function getEmptyMarkers(): GeckoMarkers {
  return {
    schema: {
      name: 0,
      startTime: 1,
      endTime: 2,
      phase: 3,
      category: 4,
      data: 5,
    },
    data: [],
  };
}

export function createGeckoMarkerStack({
  stackIndex,
  time,
}: {
  stackIndex: number | null,
  time: number,
}): GeckoMarkerStack {
  const markerStack = {
    registerTime: null,
    unregisterTime: null,
    processType: 'default',
    tid: 1111,
    pid: 2222,
    markers: getEmptyMarkers(),
    name: 'SyncProfile',
    samples: {
      schema: {
        stack: 0,
        time: 1,
        responsiveness: 2,
      },
      data: [],
    },
  };

  if (stackIndex !== null) {
    // Only add a sample if the stack exists. There have been some cases observed
    // on profiles where a sample wasn't collected here. This is probably an error
    // in the GeckoProfiler mechanism, but the front-end should be able to handle
    // it. See Bug 1566576.
    markerStack.samples.data.push([stackIndex, time, 0]);
  }

  return markerStack;
}

export function createGeckoSubprocessProfile(
  parentProfile: GeckoProfile,
  extraMarkers: GeckoMarkerTuple[] = []
): GeckoSubprocessProfile {
  const contentProcessMeta: GeckoProfileShortMeta = {
    version: parentProfile.meta.version,
    // content process was launched 1 second after parent process:
    startTime: parentProfile.meta.startTime + 1000,
    shutdownTime: null,
    categories: parentProfile.meta.categories,
    markerSchema: [...parentProfile.meta.markerSchema],
  };

  const contentProcessBinary: LibMapping = {
    breakpadId: '9F950E2CE3CD3E1ABD06D80788B606E60',
    debugName: 'firefox-webcontent',
    name: 'firefox-webcontent',
    path: '/Applications/FirefoxNightly.app/Contents/MacOS/firefox-webcontent.app/Contents/MacOS/firefox-webcontent',
    debugPath:
      '/Applications/FirefoxNightly.app/Contents/MacOS/firefox-webcontent.app/Contents/MacOS/firefox-webcontent',
    offset: 0,
    start: 0x100000000,
    end: 0x100000000 + 10000,
    arch: 'x86_64',
  };

  const contentProcessProfile: GeckoSubprocessProfile = {
    meta: contentProcessMeta,
    pausedRanges: [],
    libs: [contentProcessBinary, ...parentProfile.libs.slice(1)], // libs are stringified in the Gecko profile
    pages: [
      {
        tabID: 123123,
        innerWindowID: 1,
        url: 'https://github.com/rustwasm/wasm-bindgen/issues/5',
        embedderInnerWindowID: 0,
      },
      {
        tabID: 111111,
        innerWindowID: 2,
        url: 'chrome://browser/content/browser.xhtml',
        embedderInnerWindowID: 0,
      },
    ],
    threads: [
      {
        ..._createGeckoThread(extraMarkers),
        name: 'GeckoMain',
        processType: 'tab',
      },
    ],
    processes: [],
  };

  return contentProcessProfile;
}

/**
 * export defaults one object that is an example profile, in the Gecko format,
 * i.e. the format that nsIProfiler.getProfileDataAsync outputs.
 */
export function createGeckoProfile(): GeckoProfile {
  const parentProcessBinary: LibMapping = {
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

  const extraBinaries: LibMapping[] = [
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

  const tabID = 123;

  const parentProcessMeta: GeckoProfileFullMeta = {
    abi: 'x86_64-gcc3',
    appBuildID: '20181126165837',
    interval: 1,
    misc: 'rv:48.0',
    oscpu: 'Intel Mac OS X 10.11',
    platform: 'Macintosh',
    processType: 0,
    product: 'Firefox',
    stackwalk: 1,
    debug: 1,
    startTime: 1460221352723.438,
    profilingStartTime: 0,
    profilingEndTime: 1007,
    shutdownTime: 1560221352723,
    toolkit: 'cocoa',
    version: GECKO_PROFILE_VERSION,
    logicalCPUs: 8,
    physicalCPUs: 4,
    sourceURL: '',
    updateChannel: 'nightly',
    gcpoison: 0,
    asyncstack: 1,
    categories: [
      {
        name: 'Other',
        color: 'grey',
        subcategories: ['Other'],
      },
    ],
    markerSchema: [],
    extensions: {
      schema: { id: 0, name: 1, baseURL: 2 },
      data: [
        [
          'formautofill@mozilla.org',
          'Form Autofill',
          'moz-extension://259ec0ce-9df7-8e4a-ad30-3b67bed900f3/',
        ],
        [
          'screenshots@mozilla.org',
          'Firefox Screenshots',
          'moz-extension://92d08b3e-de1d-024c-b10c-9a2570b1ac5a/',
        ],
        [
          'geckoprofiler@mozilla.com',
          'Gecko Profiler',
          'moz-extension://7f56c8ad-cf1b-7346-949e-0ec79a77b35d/',
        ],
      ],
    },
    sampleUnits: {
      time: 'ms',
      eventDelay: 'ms',
      threadCPUDelta: 'ns',
    },
    configuration: {
      threads: [],
      features: [],
      capacity: 1000000,
      activeTabID: tabID,
    },
  };

  const parentProcessPages = [
    {
      tabID: tabID,
      innerWindowID: 1,
      url: 'https://mozilla.org/',
      embedderInnerWindowID: 0,
    },
  ];

  const [
    startIPCMarker,
    sendStartIPCMarker,
    sendEndIPCMarker,
    recvEndIPCMarker,
    endIPCMarker,
  ] = _createIPCMarkerSet({
    srcPid: 3333,
    destPid: 2222,
    startTime: 30,
    sendStartTime: 30.1,
    sendEndTime: 30.2,
    recvEndTime: 30.3,
    endTime: 31,
    messageSeqno: 1,
  });
  const startIPCMarker2 = _createIPCMarkerSet({
    srcPid: 3333,
    destPid: 9999,
    startTime: 40,
    sendStartTime: 40.1,
    sendEndTime: 40.2,
    recvEndTime: 40.3,
    endTime: 41,
    messageSeqno: 2,
  })[0];

  const parentProcessThreads: GeckoThread[] = [
    {
      ..._createGeckoThread([
        startIPCMarker,
        sendStartIPCMarker,
        sendEndIPCMarker,
        startIPCMarker2,
      ]),
      name: 'GeckoMain',
      processType: 'default',
      pid: 3333,
      tid: 3333,
    },
    {
      ..._createGeckoThread(),
      name: 'Compositor',
      processType: 'default',
      pid: 3333,
      tid: 3334,
    },
  ];

  const parentProcessCounters: GeckoCounter[] = [
    createGeckoCounter(parentProcessThreads[0]),
  ];

  const parentProcessOverhead: GeckoProfilerOverhead =
    createGeckoProfilerOverhead(parentProcessThreads[0]);

  const profile = {
    meta: parentProcessMeta,
    libs: [parentProcessBinary].concat(extraBinaries),
    pages: parentProcessPages,
    counters: parentProcessCounters,
    profilerOverhead: parentProcessOverhead,
    pausedRanges: [],
    threads: parentProcessThreads,
    processes: [],
  };

  const contentProcessProfile = createGeckoSubprocessProfile(profile, [
    recvEndIPCMarker,
    endIPCMarker,
  ]);
  profile.processes.push(contentProcessProfile);

  return profile;
}

type TestDefinedGeckoMarker = {
  +name?: string,
  readonly startTime: Milliseconds | null,
  readonly endTime: Milliseconds | null,
  readonly phase: MarkerPhase,
  +category?: IndexIntoCategoryList,
  +data?: MarkerPayload_Gecko | null,
};

function _createGeckoThreadWithMarkers(
  markers: TestDefinedGeckoMarker[]
): GeckoThread {
  const thread = _createGeckoThread();
  const { stringTable } = thread;
  const testDefinedMarkerStringIndex = stringTable.length;
  thread.stringTable.push('TestDefinedMarker');
  thread.markers.data = markers.map((marker) => {
    let name = testDefinedMarkerStringIndex;
    const markerName = marker.name;
    if (markerName) {
      const nameIndex = stringTable.indexOf(markerName);
      if (nameIndex === -1) {
        name = stringTable.length;
        stringTable.push(markerName);
      } else {
        name = nameIndex;
      }
    }
    return [
      name,
      marker.startTime,
      marker.endTime,
      marker.phase,
      0, // category
      marker.data || null,
    ];
  });
  return thread;
}

/**
 * This function creates a gecko profile with some arbitrary JS timings. This was
 * primarily created for before this project had the richer profile making fixtures.
 * It most likely shouldn't be used for new tests.
 */
export function createGeckoProfileWithMarkers(
  markers: TestDefinedGeckoMarker[]
): GeckoProfile {
  const geckoProfile = createGeckoProfile();
  return {
    meta: geckoProfile.meta,
    libs: geckoProfile.libs,
    pages: geckoProfile.pages,
    pausedRanges: [],
    threads: [_createGeckoThreadWithMarkers(markers)],
    processes: [],
  };
}

function _createIPCMarker({
  time,
  otherPid,
  messageSeqno,
  side,
  direction,
  phase,
}): GeckoMarkerTuple {
  return [
    18, // IPC: see string table in _createGeckoThread
    time,
    null, // End time
    INSTANT,
    0, // Other
    ({
      type: 'IPC',
      startTime: time,
      endTime: time,
      otherPid,
      messageType: 'PContent::Msg_PreferenceUpdate',
      messageSeqno,
      side,
      direction,
      phase,
      sync: false,
    }: IPCMarkerPayload_Gecko),
  ];
}

function _createIPCMarkerSet({
  srcPid,
  destPid,
  startTime,
  sendStartTime,
  sendEndTime,
  recvEndTime,
  endTime,
  messageSeqno,
}): GeckoMarkerTuple[] {
  return [
    _createIPCMarker({
      time: startTime,
      otherPid: destPid,
      messageSeqno,
      side: 'parent',
      direction: 'sending',
      phase: 'endpoint',
    }),
    _createIPCMarker({
      time: sendStartTime,
      otherPid: destPid,
      messageSeqno,
      side: 'parent',
      direction: 'sending',
      phase: 'transferStart',
    }),
    _createIPCMarker({
      time: sendEndTime,
      otherPid: destPid,
      messageSeqno,
      side: 'parent',
      direction: 'sending',
      phase: 'transferEnd',
    }),
    _createIPCMarker({
      time: recvEndTime,
      otherPid: srcPid,
      messageSeqno,
      side: 'child',
      direction: 'receiving',
      phase: 'transferEnd',
    }),
    _createIPCMarker({
      time: endTime,
      otherPid: srcPid,
      messageSeqno,
      side: 'child',
      direction: 'receiving',
      phase: 'endpoint',
    }),
  ];
}

function _createGeckoThread(extraMarkers = []): GeckoThread {
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
        eventDelay: 2,
        threadCPUDelta: 3,
      },
      data: [
        [1, 0, 0, 2], // (root), 0x100000f84
        [2, 1, 0, 1], // (root), 0x100000f84, 0x100001a45
        [2, 2, 0, 3], // (root), 0x100000f84, 0x100001a45
        [3, 3, 0, 6], // (root), 0x100000f84, Startup::XRE_Main
        [0, 4, 0, 7], // (root)
        [1, 5, 0, 3], // (root), 0x100000f84
        [4, 6, 0, 1], // (root), 0x100000f84, frobnicate
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
        [2, 5], // (root), 0x100000f84, 0x100001a45, 0x100001bcd
        [2, 6], // (root), 0x100000f84, 0x100001a45, 0x100001bce
      ],
    },
    frameTable: {
      schema: {
        location: 0,
        relevantForJS: 1,
        innerWindowID: 2,
        implementation: 3,
        line: 4,
        column: 5,
        category: 6,
        subcategory: 7,
      },
      data: [
        [0, false, 0, null, null, null, null, null], // (root)
        [1, false, 0, null, null, null, null, null], // 0x100000f84
        [2, false, 0, null, null, null, null, null], // 0x100001a45
        [3, false, 0, null, 4391, null, 0, 0], // Startup::XRE_Main, line 4391, category Other, subcategory Other
        [7, false, 0, 6, 34, null, null, null], // frobnicate, implementation 'baseline', line 34
        [19, false, 0, null, null, null, null, null], // 0x100001bcd
        [20, false, 0, null, null, null, null, null], // 0x100001bce
      ],
    },
    markers: {
      schema: getEmptyMarkers().schema,
      data: [
        // Please keep the next marker at the start if you add more markers in
        // this structure.
        // We want to test tracing markers with the missing "start" marker. So
        // here is only the "end" marker without a matching "start" marker.
        [
          10, // Rasterize
          null, // Start time
          1, // End time
          INTERVAL_END,
          0, // Other
          {
            category: 'Paint',
            type: 'tracing',
          },
        ],
        // This marker is filtered out
        [
          4, // VsyncTimestamp
          2, // Start time
          null, // End time
          INSTANT,
          0,
          { type: 'VsyncTimestamp' },
        ],
        [
          5, // Reflow
          3,
          null, // End time
          INTERVAL_START,
          0, // Other
          {
            category: 'Paint',
            stack: createGeckoMarkerStack({ stackIndex: 2, time: 1 }), // (root), 0x100000f84, 0x100001a45
            type: 'tracing',
          },
        ],
        [
          10, // Rasterize
          4,
          null, // End time
          INTERVAL_START,
          0, // Other
          {
            category: 'Paint',
            type: 'tracing',
          },
        ],
        [
          10, // Rasterize
          null, // Start time
          5, // End time
          INTERVAL_END,
          0, // Other
          {
            category: 'Paint',
            type: 'tracing',
          },
        ],
        [
          5, // Reflow
          null, // Start time
          8, // End time
          INTERVAL_END,
          0, // Other
          {
            category: 'Paint',
            type: 'tracing',
          },
        ],
        [
          9,
          11, // Note: this marker is out of order on purpose, to test we correctly sort
          12, // End time
          INTERVAL,
          0, // Other
          { type: 'GCMinor' },
        ],
        [
          8,
          9,
          null, // End time
          INTERVAL_START,
          0, // Other
          {
            // DOMEvent at time 9ms from 9ms to 10ms, this is the start marker
            type: 'DOMEvent',
            latency: 7,
            eventType: 'mouseout',
          },
        ],
        [
          8,
          null, // Start time
          10, // End Time
          INTERVAL_END,
          0, // Other
          {
            // DOMEvent at time 9ms from 9ms to 10ms, this is the end marker
            type: 'DOMEvent',
            latency: 8,
            eventType: 'mouseout',
          },
        ],
        [
          11, // UserTiming
          12, // Start time
          13, // End time
          INTERVAL,
          0, // Other
          {
            type: 'UserTiming',
            name: 'processing-thread',
            entryType: 'measure',
          },
        ],
        // Nested reflows
        [
          5, // Reflow
          13,
          null, // End time
          INTERVAL_START,
          0, // Other
          {
            category: 'Paint',
            stack: {
              markers: getEmptyMarkers(),
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
                },
                data: [[2, 1, 0]], // (root), 0x100000f84, 0x100001a45
              },
            },
            type: 'tracing',
          },
        ],
        [
          5, // Reflow
          14,
          null, // End time
          INTERVAL_START,
          0, // Other
          {
            category: 'Paint',
            stack: {
              markers: getEmptyMarkers(),
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
                },
                data: [[2, 1, 0]], // (root), 0x100000f84, 0x100001a45
              },
            },
            type: 'tracing',
          },
        ],
        [
          5, // Reflow
          null, // Start time
          15, // End time
          INTERVAL_END,
          0, // Other
          {
            category: 'Paint',
            type: 'tracing',
          },
        ],
        [
          5, // Reflow
          null, // Start time
          18, // End time
          INTERVAL_END,
          0, // Other
          {
            category: 'Paint',
            type: 'tracing',
          },
        ],
        [
          12, // ArbitraryName
          21,
          null, // End time
          INSTANT,
          0, // Other
          {
            category: 'ArbitraryCategory',
            type: 'tracing',
          },
        ],
        [
          13, // Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5
          22, // Start time
          23, // End time
          INTERVAL,
          0, // Other
          {
            type: 'Network',
            startTime: 22,
            endTime: 23,
            id: 388634410746504,
            status: 'STATUS_START',
            pri: -20,
            count: 37838,
            URI: 'https://github.com/rustwasm/wasm-bindgen/issues/5',
          },
        ],
        [
          13, // Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5
          23, // Start time
          24, // End time
          INTERVAL,
          0, // Other
          {
            type: 'Network',
            startTime: 23,
            endTime: 24,
            id: 388634410746504,
            status: 'STATUS_STOP',
            pri: -20,
            count: 37838,
            URI: 'https://github.com/rustwasm/wasm-bindgen/issues/5',
            domainLookupStart: 23.1,
            domainLookupEnd: 23.2,
            connectStart: 23.3,
            tcpConnectEnd: 23.4,
            secureConnectionStart: 23.5,
            connectEnd: 23.6,
            requestStart: 23.7,
            responseStart: 23.8,
            responseEnd: 23.9,
          },
        ],
        [
          14, // FileIO
          22, // Start time
          24, // End time
          INTERVAL,
          0, // Other
          {
            type: 'FileIO',
            source: 'PoisionOIInterposer',
            filename: '/foo/bar/',
            operation: 'create/open',
            stack: {
              markers: getEmptyMarkers(),
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
                },
                data: [[2, 1, 0]], // (root), 0x100000f84, 0x100001a45 / Time: 1
              },
            },
          },
        ],
        [
          15, // CompositorScreenshot
          25,
          null, // End time
          INSTANT,
          0, // Other
          {
            type: 'CompositorScreenshot',
            url: 16, // data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUD
            windowID: '0x136888400',
            windowWidth: 1280,
            windowHeight: 1000,
          },
        ],

        [
          17, // PreferenceRead
          26, // Start time
          27, // End time
          INTERVAL,
          0, // Other
          {
            type: 'PreferenceRead',
            prefAccessTime: 114.9,
            prefName: 'layout.css.dpi',
            prefKind: 'User',
            prefType: 'Int',
            prefValue: '-1',
          },
        ],

        [
          21, // RefreshDriverTick
          27, // Start time
          28, // End time
          INTERVAL,
          0, // Other
          {
            type: 'Text',
            name: 'Tick reasons: HasObservers (1x Style flush observer)',
            innerWindowID: 1, // https://github.com/rustwasm/wasm-bindgen/issues/5
          },
        ],

        [
          22, // Navigation::Start
          28, // Start time
          29, // End time
          INTERVAL,
          0, // Other
          {
            type: 'NoPayloadUserData',
            innerWindowID: 1, // https://github.com/rustwasm/wasm-bindgen/issues/5
          },
        ],

        // INSERT NEW MARKERS HERE
        // Please make sure that the marker below always have a time
        // larger than the previous ones.

        ...extraMarkers,

        // Start a tracing marker but never finish it.
        [
          10, // Rasterize
          100,
          null, // End time
          INTERVAL_START,
          0, // Other
          {
            category: 'Paint',
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
      'FileIO', // 14
      'CompositorScreenshot', // 15
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUD', // 16
      'PreferenceRead', // 17
      'IPC', // 18
      '0x100001bcd', // 19
      '0x100001bce', // 20
      'RefreshDriverTick', // 21
      'Navigation::Start', // 22
    ],
  };
}

/**
 * This function creates a gecko profile with some arbitrary JS timings. This was
 * primarily created for before this project had the richer profile making fixtures.
 * It most likely shouldn't be used for new tests.
 */
export function createGeckoProfileWithJsTimings(): GeckoProfile {
  const geckoProfile = createGeckoProfile();
  return {
    meta: geckoProfile.meta,
    libs: geckoProfile.libs,
    pages: geckoProfile.pages,
    pausedRanges: [],
    threads: [
      _createGeckoThreadWithJsTimings('GeckoMain'),
      _createGeckoThreadWithJsTimings('Compositor'),
      _createGeckoThreadWithJsTimings('GeckoMain'),
    ],
    processes: [],
  };
}

function _createGeckoThreadWithJsTimings(name: string): GeckoThread {
  return {
    name,
    registerTime: 0,
    processType: 'default',
    unregisterTime: 100,
    tid: 1111,
    pid: 2222,
    samples: {
      schema: { stack: 0, time: 1, responsiveness: 2 },
      data: [
        [1, 0, 0], // (root), 0x100000f84
        [2, 10, 0], // (root), 0x100000f84, 0x100001a45
        [2, 20, 0], // (root), 0x100000f84, 0x100001a45
        [3, 30, 0], // (root), 0x100000f84, Startup::XRE_Main
        [0, 40, 0], // (root)
        [1, 50, 0], // (root), 0x100000f84
        [4, 60, 0], // (root), 0x100000f84, javascriptOne
        [5, 70, 0], // (root), 0x100000f84, javascriptOne, javascriptTwo
        [8, 80, 0], // (root), 0x100000f84, javascriptOne, javascriptTwo, 0x10000f0f0, 0x100fefefe, javascriptThree
        [4, 90, 0], // (root), 0x100000f84, javascriptOne
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
        innerWindowID: 2,
        implementation: 3,
        line: 4,
        column: 5,
        category: 6,
        subcategory: 7,
      },
      data: [
        [0, false, 0, null, null, null, null, null], // 0: (root)
        [1, false, 0, null, null, null, null, null], // 1: 0x100000f84
        [2, false, 0, null, null, null, null, null], // 2: 0x100001a45
        [3, false, 0, null, 4391, null, 0, 0], // 3: Startup::XRE_Main, line 4391, category 16
        [7, false, 1, 6, 1, null, null, null], // 4: javascriptOne, implementation 'baseline', line 1
        [8, false, 1, 6, 2, null, null, null], // 5: javascriptTwo, implementation 'baseline', line 2
        [9, false, 0, null, null, null, null, null], // 6: 0x10000f0f0
        [10, false, 0, null, null, null, null, null], // 7: 0x100fefefe
        [11, false, 0, null, 3, null, null, null], // 8: javascriptThree, implementation null, line 3
      ],
    },
    markers: getEmptyMarkers(),
    stringTable: [
      '(root)', // 0
      '0x100000f84', // 1
      '0x100001a45', // 2
      'Startup::XRE_Main', // 3
      'VsyncTimestamp', // 4
      'Reflow', // 5
      'baseline', // 6
      'javascriptOne (http://js.com/foobar:1:1)', // 7
      'javascriptTwo (self-hosted:2:2)', // 8
      '0x10000f0f0', // 9
      '0x100fefefe', // 10
      'javascriptThree (http://js.com/foobar:3:3)', // 11
    ],
  };
}

export function createGeckoCounter(thread: GeckoThread): GeckoCounter {
  const geckoCounter = {
    name: 'My Counter',
    category: 'My Category',
    description: 'My Description',
    samples: {
      schema: {
        time: 0,
        count: 1,
        number: 2,
      },
      data: [],
    },
  };
  for (let i = 0; i < thread.samples.data.length; i++) {
    // Go through all the thread samples and create a corresponding counter entry.
    const time = thread.samples.data[i][1];
    // Create some arbitrary (positive integer) values for the number.
    const number = Math.floor(50 * Math.sin(i) + 50);
    // Create some arbitrary values for the count.
    const count = Math.sin(i);
    geckoCounter.samples.data.push([time, number, count]);
  }
  return geckoCounter;
}

export function createGeckoProfilerOverhead(
  thread: GeckoThread
): GeckoProfilerOverhead {
  // Helper class to calculate statistics.
  class ProfilerStats {
    n = 0;
    sum = 0;
    min = Number.MAX_SAFE_INTEGER;
    max = 0;
    count(val: number) {
      ++this.n;
      this.sum += val;
      if (val < this.min) {
        this.min = val;
      }
      if (val > this.max) {
        this.max = val;
      }
    }
  }

  const intervals = new ProfilerStats();
  const overheads = new ProfilerStats();
  const lockings = new ProfilerStats();
  const cleanings = new ProfilerStats();
  const counters = new ProfilerStats();
  const threads = new ProfilerStats();

  // Fill the profiler overhead data.
  const data = [];
  for (let i = 0; i < thread.samples.data.length; i++) {
    // Go through all the thread samples and create a corresponding counter entry.
    const time = thread.samples.data[i][1] * 1000;
    const prevTime = i === 0 ? 0 : thread.samples.data[i - 1][1] * 1000;
    // Create some arbitrary (positive integer) values for the individual overheads.
    const lockingTime = Math.floor(50 * Math.sin(i) + 50);
    const cleaningTime = Math.floor(50 * Math.sin(i) + 55);
    const counterTime = Math.floor(50 * Math.sin(i) + 60);
    const threadTime = Math.floor(50 * Math.sin(i) + 65);
    const interval = time - prevTime;

    intervals.count(interval);
    lockings.count(lockingTime);
    cleanings.count(cleaningTime);
    counters.count(counterTime);
    threads.count(threadTime);
    overheads.count(lockingTime + cleaningTime + counterTime + threadTime);

    data.push([time, lockingTime, cleaningTime, counterTime, threadTime]);
  }

  const profiledDuration =
    thread.samples.data[thread.samples.data.length - 1][1] -
    thread.samples.data[0][1];
  const statistics: ProfilerOverheadStats = {
    profiledDuration,
    samplingCount: overheads.n,
    overheadDurations: overheads.sum,
    overheadPercentage: overheads.sum / profiledDuration,
    // Individual statistics
    maxCleaning: cleanings.max,
    maxCounter: counters.max,
    maxInterval: intervals.max,
    maxLockings: lockings.max,
    maxOverhead: overheads.max,
    maxThread: threads.max,
    meanCleaning: cleanings.sum / cleanings.n,
    meanCounter: counters.sum / counters.n,
    meanInterval: intervals.sum / intervals.n,
    meanLockings: lockings.sum / lockings.n,
    meanOverhead: overheads.sum / overheads.n,
    meanThread: threads.sum / threads.n,
    minCleaning: cleanings.min,
    minCounter: counters.min,
    minInterval: intervals.min,
    minLockings: lockings.min,
    minOverhead: overheads.min,
    minThread: threads.min,
  };

  return {
    samples: {
      schema: {
        time: 0,
        locking: 1,
        expiredMarkerCleaning: 2,
        counters: 3,
        threads: 4,
      },
      data: data,
    },
    statistics: statistics,
  };
}

export function getVisualMetrics(): VisualMetrics {
  return {
    SpeedIndex: 2942,
    FirstVisualChange: 960,
    LastVisualChange: 10480,
    VisualProgress: [
      { timestamp: 4431.321044921875, percent: 0 },
      { timestamp: 5391.321044921875, percent: 17 },
      { timestamp: 5511.321044921875, percent: 17 },
      { timestamp: 5591.321044921875, percent: 22 },
      { timestamp: 5631.321044921875, percent: 42 },
      { timestamp: 5751.321044921875, percent: 70 },
      { timestamp: 5911.321044921875, percent: 76 },
    ],
    ContentfulSpeedIndex: 2303,
    ContentfulSpeedIndexProgress: [
      { timestamp: 4431.321044921875, percent: 0 },
      { timestamp: 5391.321044921875, percent: 41 },
      { timestamp: 5511.321044921875, percent: 46 },
      { timestamp: 5591.321044921875, percent: 48 },
      { timestamp: 5631.321044921875, percent: 49 },
      { timestamp: 5751.321044921875, percent: 49 },
    ],
    PerceptualSpeedIndex: 8314,
    PerceptualSpeedIndexProgress: [
      { timestamp: 4431.321044921875, percent: 0 },
      { timestamp: 5391.321044921875, percent: 11 },
      { timestamp: 5511.321044921875, percent: 12 },
      { timestamp: 5591.321044921875, percent: 13 },
      { timestamp: 5631.321044921875, percent: 13 },
      { timestamp: 5751.321044921875, percent: 15 },
    ],
    VisualReadiness: 9520,
    VisualComplete85: 6480,
    VisualComplete95: 10200,
    VisualComplete99: 10200,
  };
}
