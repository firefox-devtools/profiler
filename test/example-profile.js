/**
 * export defaults one object that is an example profile, in the 'raw' format,
 * i.e. the format that nsIProfiler.getProfileDataAsync outputs.
 */

const parentProcessBinary = {
  breakpadId: 'F1D957D30B413D55A539BBA06F90DD8F0',
  debugName: 'firefox',
  name: 'firefox',
  path: '/Applications/FirefoxNightly.app/Contents/MacOS/firefox',
  debugPath: '/Applications/FirefoxNightly.app/Contents/MacOS/firefox',
  start: 0x100000000,
  end: 0x100000000 + 10000,
  arch: 'x86_64',
};

const contentProcessBinary = {
  breakpadId: '9F950E2CE3CD3E1ABD06D80788B606E60',
  debugName: 'firefox-webcontent',
  name: 'firefox-webcontent',
  path: '/Applications/FirefoxNightly.app/Contents/MacOS/firefox-webcontent.app/Contents/MacOS/firefox-webcontent',
  debugPath: '/Applications/FirefoxNightly.app/Contents/MacOS/firefox-webcontent.app/Contents/MacOS/firefox-webcontent',
  start: 0x100000000,
  end: 0x100000000 + 10000,
  arch: 'x86_64',
};

const extraBinaries = [
  {
    breakpadId: '1000000000000000000000000000000A1',
    debugName: 'examplebinary',
    name: 'examplebinary',
    path: '/tmp/examplebinary',
    debugPath: '/tmp/examplebinary',
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
    start: 0x200000000 + 20,
    end: 0x200000000 + 40,
    arch: 'x86_64',
  },
];

const thread = {
  samples: {
    schema: { stack: 0, time: 1, responsiveness: 2, rss: 3, uss: 4, frameNumber: 5, power: 6 },
    data: [
      [1, 0, 0], // (root), 0x100000f84
      [2, 1, 0], // (root), 0x100000f84, 0x100001a45
      [2, 2, 0], // (root), 0x100000f84, 0x100001a45
      [3, 3, 0], // (root), 0x100000f84, Startup::XRE_Main
      [0, 4, 0], // (root)
      [1, 5, 0], // (root), 0x100000f84
      [4, 6, 0], // (root), 0x100000f84, frobnicate
    ]
  },
  stackTable: {
    schema: { prefix: 0, frame: 1 },
    data: [
      [null, 0], // (root)
      [0, 1],    // (root), 0x100000f84
      [1, 2],    // (root), 0x100000f84, 0x100001a45
      [1, 3],    // (root), 0x100000f84, Startup::XRE_Main
      [1, 4],    // (root), 0x100000f84, frobnicate
    ],
  },
  frameTable: {
    schema: { location: 0, implementation: 1, optimizations: 2, line: 3, category: 4 },
    data: [
      [0],                       // (root)
      [1],                       // 0x100000f84
      [2],                       // 0x100001a45
      [3, null, null, 4391, 16], // Startup::XRE_Main, line 4391, category 16
      [7, 6, null, 34],          // frobnicate, implementation 'baseline', line 34
    ]
  },
  markers: {
    schema: { name: 0, time: 1, data: 2 },
    data: [
      [4, 0, { category: 'VsyncTimestamp', vsync: 0 }],
      [5, 2, {
        category: 'Paint',
        interval: 'start',
        stack: {
          markers: { schema: { name: 0, time: 1, data: 2 }, data: [] },
          name: 'SyncProfile',
          samples: {
            schema: { stack: 0, time: 1, responsiveness: 2, rss: 3, uss: 4, frameNumber: 5, power: 6 },
            data: [[2, 1]] // (root), 0x100000f84, 0x100001a45
          }
        },
        type: 'tracing'
      }],
      [10, 4, {
        category: 'Paint',
        interval: 'start',
        type: 'tracing'
      }],
      [10, 5, {
        category: 'Paint',
        interval: 'end',
        type: 'tracing'
      }],
      [5, 8, {
        category: 'Paint',
        interval: 'end',
        type: 'tracing'
      }],
      [9, 11, { // MinorGC at time 7ms from 7ms to 8ms
        startTime: 11,
        endTime: 12,
      }],
      [8, 9, { // DOMEvent at time 5ms from 5ms to 6ms
        startTime: 9,
        endTime: 10,
        type: 'mouseout',
        phase: 3,
      }],
    ]
  },
  stringTable: [
    '(root)',
    '0x100000f84',
    '0x100001a45',
    'Startup::XRE_Main',
    'VsyncTimestamp',
    'Reflow',
    'baseline',
    'frobnicate (chrome://blargh:34)',
    'DOMEvent',
    'MinorGC',
    'Rasterize',
  ],
};

const parentProcessMeta = {
  abi: 'x86_64-gcc3',
  interval: 1,
  misc: 'rv:48.0',
  oscpu: 'Intel Mac OS X 10.11',
  platform: 'Macintosh',
  processType: 0,
  product: 'Firefox',
  stackwalk: 1,
  startTime: 1460221352723.438,
  toolkit: 'cocoa',
  version: 4,
};

const contentProcessMeta = Object.assign({}, parentProcessMeta, {
  processType: 2,
  startTime: parentProcessMeta.startTime + 1000 // content process was launched 1 second after parent process
});

const contentProcessProfile = {
  meta: contentProcessMeta,
  libs: [contentProcessBinary].concat(extraBinaries), // libs are stringified in the raw profile
  threads: [
    Object.assign({ name: 'GeckoMain', processType: 'tab' }, thread),
  ],
};

const profile = {
  meta: parentProcessMeta,
  libs: [parentProcessBinary].concat(extraBinaries),
  threads: [
    Object.assign({ name: 'GeckoMain', processType: 'default' }, thread),
    Object.assign({ name: 'Compositor', processType: 'default' }, thread),
    JSON.stringify(contentProcessProfile), // subprocesses are stringified, too
  ],
};

export default profile;
