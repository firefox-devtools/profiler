/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { unserializeProfileOfArbitraryFormat } from '../../profile-logic/process-profile';
import { isPerfScriptFormat } from '../../profile-logic/import/linux-perf';
import { isFlameGraphFormat } from '../../profile-logic/import/flame-graph';
import {
  isStreamedProfileFormat,
  convertStreamedProfile,
} from '../../profile-logic/import/streamed-profile';
import { GECKO_PROFILE_VERSION } from '../../app-logic/constants';

import { storeWithProfile } from '../fixtures/stores';
import { selectedThreadSelectors } from 'firefox-profiler/selectors';

import type {
  TracingEventUnion,
  CpuProfileEvent,
} from '../../profile-logic/import/chrome';
import type { Profile } from 'firefox-profiler/types';

function checkProfileContainsUniqueTid(profile: Profile) {
  const foundTids = new Set<unknown>();

  for (const thread of profile.threads) {
    const { tid } = thread;
    if (tid === undefined) {
      throw new Error('Found an undefined tid!');
    }

    if (foundTids.has(tid)) {
      console.error(`Found a duplicate tid ${tid}!`);
    }

    foundTids.add(tid);
  }
}

describe('converting Linux perf profile', function () {
  async function loadProfile(filename: string): Promise<Profile> {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync(filename);
    const decompressedArrayBuffer = zlib.gunzipSync(buffer);
    const text = decompressedArrayBuffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    return profile;
  }

  it('should not detect a JSON profile as perf script', function () {
    expect(
      isPerfScriptFormat('{"meta": {"product": "Cool stuff 123 456:"}}')
    ).toBe(false);
  });

  it('should import a perf profile', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/test.perf.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('should import a simple perf profile', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/simple-perf.txt.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('should import a perf profile of gzip', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/gzip.perf.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('should import a perf profile of graphviz with a header', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/graphviz.perf.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});

describe('converting dhat profiles', function () {
  it('should import a dhat profile', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync('src/test/fixtures/upgrades/dhat.json.gz');
    const decompressedArrayBuffer = zlib.gunzipSync(buffer);
    const text = decompressedArrayBuffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});

describe('converting Google Chrome profile', function () {
  it('successfully imports a chunked profile (one that uses Profile + ProfileChunk trace events)', async function () {
    // Mock out image loading behavior as the screenshots rely on the Image loading
    // behavior.
    jest
      .spyOn(Image.prototype, 'addEventListener')
      // @ts-expect-error - TypeScript thinks addEventListener takes ...unknown[]
      .mockImplementation((name: string, callback: () => void) => {
        if (name === 'load') {
          callback();
        }
      });

    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync('src/test/fixtures/upgrades/test.chrome.gz');
    const decompressedArrayBuffer = zlib.gunzipSync(buffer);
    const text = decompressedArrayBuffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a chrome profile with an invalid "endTime" entry', async () => {
    // Mock out image loading behavior as the screenshots rely on the Image loading
    // behavior.
    jest
      .spyOn(Image.prototype, 'addEventListener')
      // @ts-expect-error - TypeScript thinks addEventListener takes ...unknown[]
      .mockImplementation((name: string, callback: () => void) => {
        if (name === 'load') {
          callback();
        }
      });

    const fs = require('fs');
    const zlib = require('zlib');
    const compressedBuffer = fs.readFileSync(
      'src/test/fixtures/upgrades/test.chrome.gz'
    );
    const buffer = zlib.gunzipSync(compressedBuffer);
    const events: TracingEventUnion[] = JSON.parse(buffer.toString('utf8'));
    events.push({
      args: { data: { endTime: 300269884209 } },
      cat: 'disabled-by-default-v8.cpu_profiler',
      id: '0x2', // same id than in the original profile
      name: 'ProfileChunk',
      ph: 'P',
      pid: 88999, // same pid than in the original profile
      tid: 1,
      ts: 300269884230,
      tts: 24162,
    });

    const text = JSON.stringify(events);
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a non-chunked profile (one that uses a CpuProfile trace event)', async function () {
    const fs = require('fs');
    const buffer = fs.readFileSync(
      'src/test/fixtures/upgrades/test.chrome-unchunked.json'
    );
    const text = buffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a single CpuProfile, e.g. from node', async function () {
    const fs = require('fs');
    let cpuProfile: CpuProfileEvent | undefined;
    {
      // Load the existing saved profile, but then find a single CpuProfile entry in it.

      const buffer = fs.readFileSync(
        'src/test/fixtures/upgrades/test.chrome-unchunked.json'
      );
      const events: TracingEventUnion[] = JSON.parse(buffer.toString('utf8'));

      // Use a for loop to look this up, as Flow is happier than a .find().
      for (const event of events) {
        if (event.name === 'CpuProfile') {
          cpuProfile = event;
          break;
        }
      }

      if (!cpuProfile) {
        throw new Error('Could not find a CPU profile');
      }
    }

    // Now use the single CpuProfile to test that we can convert a node-like export
    // format.
    const text = JSON.stringify(cpuProfile.args.data.cpuProfile);
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a profile with DevTools timestamp in filename', async function () {
    const fs = require('fs');
    const profileFilename =
      'src/test/fixtures/upgrades/hello.cjs-20231120T211435.cpuprofile';
    const json = fs.readFileSync(profileFilename, 'utf8');
    const profile = await unserializeProfileOfArbitraryFormat(
      json,
      profileFilename
    );
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a profile using the chrome tracing format', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const compressedBuffer = fs.readFileSync(
      'src/test/fixtures/upgrades/chrome-tracing.json.gz'
    );
    const decompressedBuffer = zlib.gunzipSync(compressedBuffer);
    const profile =
      await unserializeProfileOfArbitraryFormat(decompressedBuffer);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a profile with the chrome array format', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const compressedBuffer = fs.readFileSync(
      'src/test/fixtures/upgrades/chrome-trace-issue-5429.json.gz'
    );
    const decompressedBuffer = zlib.gunzipSync(compressedBuffer);
    const profile =
      await unserializeProfileOfArbitraryFormat(decompressedBuffer);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a chrome profile using markers of different types', async function () {
    const chromeProfile = {
      traceEvents: [
        {
          cat: 'RunTask',
          name: 'RunTask',
          ph: 'B',
          pid: 54782,
          scope: 'blink.user_timing',
          tid: 259,
          ts: 1,
        },
        {
          cat: 'RunTask',
          name: 'RunTask',
          ph: 'E',
          pid: 54782,
          scope: 'blink.user_timing',
          tid: 259,
          ts: 2,
        },
        {
          args: {},
          cat: 'disabled-by-default-devtools.timeline',
          dur: 2,
          name: 'RunTask Complete',
          ph: 'X',
          pid: 54782,
          tdur: 1,
          tid: 259,
          ts: 3,
          tts: 2522144,
        },
        {
          cat: 'Instant',
          name: 'Instant 1',
          ph: 'i',
          pid: 54782,
          scope: 'blink.user_timing',
          tid: 259,
          ts: 7,
        },
        {
          cat: 'Instant',
          name: 'Instant 2',
          ph: 'I',
          pid: 54782,
          scope: 'blink.user_timing',
          tid: 259,
          ts: 8,
        },
        {
          args: { startTime: 3907.5999999940395 },
          cat: 'blink.user_timing',
          id: '0x2981878b',
          name: 'async event',
          ph: 'b',
          pid: 54782,
          scope: 'blink.user_timing',
          tid: 259,
          ts: 10,
        },
        {
          args: {},
          cat: 'blink.user_timing',
          id: '0x2981878b',
          name: 'async event',
          ph: 'e',
          pid: 54782,
          scope: 'blink.user_timing',
          tid: 259,
          ts: 11,
        },
        {
          args: {},
          cat: 'blink.user_timing',
          id: '0x2981878b',
          name: 'async event instant',
          ph: 'n',
          pid: 54782,
          scope: 'blink.user_timing',
          tid: 259,
          ts: 12,
        },
        {
          args: {
            data: {
              stackTrace: [
                {
                  columnNumber: 38358,
                  functionName: 'buildFragment',
                  lineNumber: 40,
                  scriptId: '117',
                  url: 'https://journals.physiology.org/products/physio/releasedAssets/js/main.bundle-1bbca34150268d61be9d.js',
                },
              ],
              type: 'DOMSubtreeModified',
            },
          },
          cat: 'devtools.timeline',
          dur: 51,
          name: 'EventDispatch',
          ph: 'X',
          pid: 54782,
          tdur: 4,
          tid: 259,
          ts: 13,
          tts: 3934607,
        },
      ],
    };
    const strChromeProfile = JSON.stringify(chromeProfile);
    const profile = await unserializeProfileOfArbitraryFormat(strChromeProfile);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    const state = storeWithProfile(profile).getState();
    const mainGetMarker = selectedThreadSelectors.getMarkerGetter(state);
    const markers = selectedThreadSelectors
      .getFullMarkerListIndexes(state)
      .map(mainGetMarker);

    checkProfileContainsUniqueTid(profile);
    expect(markers.map(({ name }) => name)).toEqual([
      'RunTask',
      'RunTask Complete',
      'Instant 1',
      'Instant 2',
      'async event',
      'async event instant',
      'EventDispatch',
    ]);
    expect(markers[6]).toMatchObject({
      name: 'EventDispatch',
      data: {
        type: 'EventDispatch',
        type2: 'DOMSubtreeModified',
      },
    });
    expect(markers).toMatchSnapshot();
  });
});

describe('converting ART trace', function () {
  it('successfully imports a non-streaming ART trace', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync(
      'src/test/fixtures/upgrades/art-trace-regular.trace.gz'
    );
    const uncompressedBytes = zlib.gunzipSync(buffer);
    const profile =
      await unserializeProfileOfArbitraryFormat(uncompressedBytes);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a streaming ART trace', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync(
      'src/test/fixtures/upgrades/art-trace-streaming.trace.gz'
    );
    const uncompressedBytes = zlib.gunzipSync(buffer);
    const profile =
      await unserializeProfileOfArbitraryFormat(uncompressedBytes);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});

describe('converting Simpleperf trace', function () {
  it('successfully imports a simpleperf trace with task-clock', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync(
      'src/test/fixtures/upgrades/simpleperf-task-clock.trace.gz'
    );
    const uncompressedBytes = zlib.gunzipSync(buffer);
    const profile =
      await unserializeProfileOfArbitraryFormat(uncompressedBytes);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('successfully imports a simpleperf trace with cpu-clock', async function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync(
      'src/test/fixtures/upgrades/simpleperf-cpu-clock.trace.gz'
    );
    const uncompressedBytes = zlib.gunzipSync(buffer);
    const profile =
      await unserializeProfileOfArbitraryFormat(uncompressedBytes);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});

describe('converting flamegraph profile', function () {
  it('should detect flamegraph format', function () {
    const flamegraphText = 'func1;func2;func3 10\nfunc1;func4 5';
    expect(isFlameGraphFormat(flamegraphText)).toBe(true);
  });

  it('should not detect JSON as flamegraph format', function () {
    expect(isFlameGraphFormat('{"meta": {"product": "Firefox"}}')).toBe(false);
  });

  it('should not detect empty string as flamegraph format', function () {
    expect(isFlameGraphFormat('')).toBe(false);
  });

  it('should import a simple flamegraph profile', async function () {
    const flamegraphText = [
      'func1;func2;func3 10',
      'func1;func2;func4 5',
      'func1;func5 3',
    ].join('\n');

    const profile = await unserializeProfileOfArbitraryFormat(flamegraphText);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    expect(profile.meta.product).toBe('Flamegraph');
    expect(profile.threads).toHaveLength(1);

    const thread = profile.threads[0];
    expect(thread.name).toBe('Program');
    expect(thread.samples.length).toBe(18); // 10 + 5 + 3 samples

    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });

  it('should import a flamegraph profile with Java frames', async function () {
    const flamegraphText = [
      'java.lang.Thread.run_[j];MyClass.method_[j] 5',
      'native_func;cpp::function 3',
    ].join('\n');

    const profile = await unserializeProfileOfArbitraryFormat(flamegraphText);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    const thread = profile.threads[0];
    // 5 + 3 stacks
    expect(thread.samples.length).toBe(8);

    // Should not contain the suffix for the Java frames.
    expect(
      profile.shared.stringArray.find((s) => s.includes('[j]'))
    ).toBeUndefined();
    checkProfileContainsUniqueTid(profile);
  });

  it('should handle empty lines in flamegraph', async function () {
    const flamegraphText = ['func1;func2 2', '', 'func3 1', ''].join('\n');

    const profile = await unserializeProfileOfArbitraryFormat(flamegraphText);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    const thread = profile.threads[0];
    // 2 + 1 stacks
    expect(thread.samples.length).toBe(3);
    checkProfileContainsUniqueTid(profile);
  });

  it('should import a real-world flamegraph file', async function () {
    const fs = require('fs');
    const text = fs.readFileSync(
      'src/test/fixtures/upgrades/flamegraph.txt',
      'utf8'
    );

    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    expect(profile.meta.product).toBe('Flamegraph');
    expect(profile.threads).toHaveLength(1);

    const thread = profile.threads[0];
    expect(thread.name).toBe('Program');
    expect(thread.samples.length).toBeGreaterThan(0);

    checkProfileContainsUniqueTid(profile);
    expect(profile).toMatchSnapshot();
  });
});

describe('converting streamed profile', function () {
  const metaLine = JSON.stringify({
    type: 'meta',
    product: 'mach',
    interval: 500,
    startTime: 1000000,
    logicalCPUs: 4,
    physicalCPUs: 2,
    version: 27,
    preprocessedProfileVersion: 47,
    categories: [{ name: 'Other', color: 'grey', subcategories: ['Other'] }],
    markerSchema: [
      {
        name: 'Text',
        tooltipLabel: '{marker.name}',
        display: ['marker-chart', 'marker-table'],
        data: [{ key: 'text', label: 'Description', format: 'string' }],
      },
    ],
  });

  const threadLine = '{"type":"thread"}';

  it('should detect streamed profile format', function () {
    const input =
      metaLine +
      '\n' +
      '{"type":"marker","name":"test","startTime":0,"endTime":null,"data":null}';
    expect(isStreamedProfileFormat(input)).toBe(true);
  });

  it('should not detect object without type:meta first key', function () {
    const input = JSON.stringify({ markerSchema: [], categories: [] });
    expect(isStreamedProfileFormat(input)).toBe(false);
  });

  it('should not detect regular JSON object', function () {
    expect(isStreamedProfileFormat('{"meta": {"product": "Firefox"}}')).toBe(
      false
    );
  });

  it('should not detect non-JSON', function () {
    expect(isStreamedProfileFormat('hello world')).toBe(false);
  });

  it('should not detect empty string', function () {
    expect(isStreamedProfileFormat('')).toBe(false);
  });

  it('should apply thread configuration from type=thread line', function () {
    const lines = [
      metaLine,
      JSON.stringify({
        type: 'thread',
        name: '',
        processName: 'mach',
        isMainThread: false,
        showMarkersInTimeline: true,
        pid: '0',
        tid: 0,
      }),
      JSON.stringify({
        type: 'marker',
        name: 'test',
        startTime: 0,
        endTime: 100,
        data: null,
      }),
    ];
    const profile = convertStreamedProfile(lines.join('\n'));
    const thread = profile.threads[0];

    expect(thread.name).toBe('');
    expect(thread.processName).toBe('mach');
    expect(thread.isMainThread).toBe(false);
    expect(thread.showMarkersInTimeline).toBe(true);
    expect(thread.pid).toBe('0');
    expect(thread.tid).toBe(0);
    expect(thread.markers.length).toBe(1);
  });

  it('should error if no thread is declared', function () {
    const lines = [metaLine];
    expect(() => convertStreamedProfile(lines.join('\n'))).toThrow(
      'no thread declaration'
    );
  });

  it('should error if a marker appears before any thread', function () {
    const lines = [
      metaLine,
      JSON.stringify({
        type: 'marker',
        name: 'test',
        startTime: 0,
        endTime: null,
        data: null,
      }),
    ];
    expect(() => convertStreamedProfile(lines.join('\n'))).toThrow(
      'before any thread declaration'
    );
  });

  it('should convert a simple streamed profile', function () {
    const lines = [
      metaLine,
      threadLine,
      JSON.stringify({
        type: 'marker',
        name: 'test_start',
        startTime: 100,
        endTime: null,
        data: { type: 'Text', text: 'Starting test' },
      }),
      JSON.stringify({
        type: 'marker',
        name: 'test',
        startTime: 100,
        endTime: 200,
        data: {
          type: 'Test',
          test: 'test.js',
          name: 'test.js',
          status: 'PASS',
          color: 'green',
        },
      }),
    ];
    const profile = convertStreamedProfile(lines.join('\n'));

    expect(profile.meta.product).toBe('mach');
    expect(profile.meta.interval).toBe(500);
    expect(profile.meta.startTime).toBe(1000000);
    expect(profile.threads).toHaveLength(1);

    const thread = profile.threads[0];
    expect(thread.markers.length).toBe(2);

    // First marker: instant (endTime is null)
    expect(thread.markers.startTime[0]).toBe(100);
    expect(thread.markers.endTime[0]).toBe(null);
    expect(thread.markers.phase[0]).toBe(0); // INSTANT

    // Second marker: interval
    expect(thread.markers.startTime[1]).toBe(100);
    expect(thread.markers.endTime[1]).toBe(200);
    expect(thread.markers.phase[1]).toBe(1); // INTERVAL

    // All markers have category 0
    expect(thread.markers.category[0]).toBe(0);
    expect(thread.markers.category[1]).toBe(0);

    // Marker data is preserved
    expect(thread.markers.data[0]).toEqual({
      type: 'Text',
      text: 'Starting test',
    });
  });

  it('should import via unserializeProfileOfArbitraryFormat', async function () {
    // The full thread structure required at version 47 so that upgraders
    // can process it. The producing tool emits this at the version it declares.
    const fullThreadLine = JSON.stringify({
      type: 'thread',
      name: '',
      processType: 'default',
      processStartupTime: 0,
      processShutdownTime: null,
      registerTime: 0,
      unregisterTime: null,
      pausedRanges: [],
      isMainThread: false,
      pid: '0',
      tid: 0,
      samples: {
        weightType: 'samples',
        weight: null,
        eventDelay: [],
        stack: [],
        time: [],
        length: 0,
      },
      stackTable: { frame: [], prefix: [], length: 0 },
      frameTable: {
        address: [],
        inlineDepth: [],
        category: [],
        subcategory: [],
        func: [],
        nativeSymbol: [],
        innerWindowID: [],
        line: [],
        column: [],
        length: 0,
      },
      funcTable: {
        isJS: [],
        relevantForJS: [],
        name: [],
        resource: [],
        fileName: [],
        lineNumber: [],
        columnNumber: [],
        length: 0,
      },
      resourceTable: { lib: [], name: [], host: [], type: [], length: 0 },
      nativeSymbols: {
        libIndex: [],
        address: [],
        name: [],
        functionSize: [],
        length: 0,
      },
    });
    const lines = [
      metaLine,
      fullThreadLine,
      JSON.stringify({
        type: 'marker',
        name: 'CPU Use',
        startTime: 0,
        endTime: 500,
        data: { type: 'CPU', cpuPercent: '4.2%' },
      }),
    ];
    const profile = await unserializeProfileOfArbitraryFormat(lines.join('\n'));

    expect(profile.threads).toHaveLength(1);
    expect(profile.threads[0].markers.length).toBe(1);
  });

  it('should skip unknown line types', function () {
    const lines = [
      metaLine,
      threadLine,
      JSON.stringify({ type: 'unknown_future_type', data: {} }),
      JSON.stringify({
        type: 'marker',
        name: 'test',
        startTime: 0,
        endTime: 100,
        data: null,
      }),
    ];
    const profile = convertStreamedProfile(lines.join('\n'));
    expect(profile.threads[0].markers.length).toBe(1);
  });

  it('should use per-marker category when provided', function () {
    const lines = [
      metaLine,
      threadLine,
      JSON.stringify({
        type: 'marker',
        name: 'Phase',
        startTime: 0,
        endTime: 100,
        data: null,
        category: 2,
      }),
      JSON.stringify({
        type: 'marker',
        name: 'test',
        startTime: 0,
        endTime: null,
        data: null,
      }),
      JSON.stringify({
        type: 'marker',
        name: 'Phase',
        startTime: 100,
        endTime: 200,
        data: null,
        category: 1,
      }),
    ];
    const profile = convertStreamedProfile(lines.join('\n'));
    const { markers } = profile.threads[0];

    expect(markers.category[0]).toBe(2);
    expect(markers.category[1]).toBe(0); // default when absent
    expect(markers.category[2]).toBe(1);
  });

  it('should deduplicate marker name strings', function () {
    const lines = [
      metaLine,
      threadLine,
      JSON.stringify({
        type: 'marker',
        name: 'CPU Use',
        startTime: 0,
        endTime: 500,
        data: null,
      }),
      JSON.stringify({
        type: 'marker',
        name: 'CPU Use',
        startTime: 500,
        endTime: 1000,
        data: null,
      }),
      JSON.stringify({
        type: 'marker',
        name: 'Memory',
        startTime: 0,
        endTime: 500,
        data: null,
      }),
    ];
    const profile = convertStreamedProfile(lines.join('\n'));
    const { markers } = profile.threads[0];

    // Both "CPU Use" markers should share the same name index
    expect(markers.name[0]).toBe(markers.name[1]);
    // "Memory" should have a different index
    expect(markers.name[2]).not.toBe(markers.name[0]);
  });
});
