/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { unserializeProfileOfArbitraryFormat } from '../../profile-logic/process-profile';
import { isPerfScriptFormat } from '../../profile-logic/import/linux-perf';
import { isFlameGraphFormat } from '../../profile-logic/import/flame-graph';
import { GECKO_PROFILE_VERSION } from '../../app-logic/constants';

import { storeWithProfile } from '../fixtures/stores';
import { selectedThreadSelectors } from 'firefox-profiler/selectors';
import {
  assertProfileIntegrity,
  profileImportSnapshot,
} from '../fixtures/profile-summary';

import type {
  TracingEventUnion,
  CpuProfileEvent,
} from '../../profile-logic/import/chrome';
import type { Profile } from 'firefox-profiler/types';

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
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
  });

  it('should import a simple perf profile', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/simple-perf.txt.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
  });

  it('should import a perf profile of gzip', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/gzip.perf.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
  });

  it('should import a perf profile of graphviz with a header', async function () {
    const profile = await loadProfile(
      'src/test/fixtures/upgrades/graphviz.perf.gz'
    );
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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

    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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

    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
  });

  describe('positionTicks (executed line numbers)', function () {
    // A minimal node-style single-CpuProfile with:
    //  - node 2 "doWork": a JS frame whose self time spans two executed lines
    //    (12 with 3 ticks, 15 with 1 tick).
    //  - node 3 "leaf": a JS frame with a single executed line (22).
    //  - node 4 "nativeThing": a native frame (no url) that still carries
    //    positionTicks, which must be ignored.
    // Line/column in callFrame are 0-based; positionTicks lines are 1-based.
    function makeProfileText(): string {
      const cpuProfile = {
        startTime: 0,
        endTime: 10000,
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: '(root)',
              scriptId: 0,
              url: '',
              lineNumber: -1,
              columnNumber: -1,
            },
            hitCount: 0,
            children: [2, 4],
          },
          {
            id: 2,
            callFrame: {
              functionName: 'doWork',
              scriptId: 1,
              url: 'file:///app.js',
              lineNumber: 9,
              columnNumber: 2,
            },
            hitCount: 4,
            children: [3],
            positionTicks: [
              { line: 12, ticks: 3 },
              { line: 15, ticks: 1 },
            ],
          },
          {
            id: 3,
            callFrame: {
              functionName: 'leaf',
              scriptId: 1,
              url: 'file:///app.js',
              lineNumber: 19,
              columnNumber: 4,
            },
            hitCount: 2,
            positionTicks: [{ line: 22, ticks: 2 }],
          },
          {
            id: 4,
            callFrame: {
              functionName: 'nativeThing',
              scriptId: 0,
              url: '',
              lineNumber: -1,
              columnNumber: -1,
            },
            hitCount: 1,
            positionTicks: [{ line: 99, ticks: 1 }],
          },
        ],
        // One µs delta per sample: with a 500µs target interval every sample is
        // emitted, so counts below are deterministic.
        samples: [2, 2, 2, 2, 3, 3, 4],
        timeDeltas: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
      };
      return JSON.stringify(cpuProfile);
    }

    function findFuncByName(profile: Profile, name: string): number {
      const { funcTable, stringArray } = profile.shared;
      for (let i = 0; i < funcTable.length; i++) {
        if (stringArray[funcTable.name[i]] === name) {
          return i;
        }
      }
      throw new Error(`Could not find a func named "${name}".`);
    }

    function framesForFunc(profile: Profile, funcIndex: number): number[] {
      const { frameTable } = profile.shared;
      const frames = [];
      for (let i = 0; i < frameTable.length; i++) {
        if (frameTable.func[i] === funcIndex) {
          frames.push(i);
        }
      }
      return frames;
    }

    it('splits a multi-line node into per-line frames and distributes its samples', async function () {
      const profile =
        await unserializeProfileOfArbitraryFormat(makeProfileText());
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }
      assertProfileIntegrity(profile);

      const { frameTable, funcTable, stackTable } = profile.shared;
      const doWork = findFuncByName(profile, 'doWork');

      // The func keeps its 1-based definition line, and there's exactly one
      // func even though it now has multiple frames.
      expect(funcTable.lineNumber[doWork]).toBe(10);

      // The neutral structural frame is separate from the executed-line frames.
      const frames = framesForFunc(profile, doWork);
      const locations = frames
        .map((frame) => ({
          line: frameTable.line[frame],
          column: frameTable.column[frame],
        }))
        .sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
      expect(locations).toEqual([
        { line: null, column: null },
        { line: 12, column: null },
        { line: 15, column: null },
      ]);

      // Leaf samples are distributed proportionally to the tick counts (3:1).
      const thread = profile.threads[0];
      const hitsByLine = new Map();
      for (let i = 0; i < thread.samples.length; i++) {
        const stackIndex = thread.samples.stack[i];
        if (stackIndex === null) {
          continue;
        }
        const frame = stackTable.frame[stackIndex];
        if (frameTable.func[frame] === doWork) {
          const line = frameTable.line[frame];
          hitsByLine.set(line, (hitsByLine.get(line) ?? 0) + 1);
        }
      }
      expect(hitsByLine.get(12)).toBe(3);
      expect(hitsByLine.get(15)).toBe(1);
      expect(hitsByLine.has(null)).toBe(false);
    });

    it('uses the single executed line for a node with one positionTick line', async function () {
      const profile =
        await unserializeProfileOfArbitraryFormat(makeProfileText());
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      const { frameTable, funcTable, stackTable } = profile.shared;
      const doWork = findFuncByName(profile, 'doWork');
      const leaf = findFuncByName(profile, 'leaf');

      // A single executed line still has a neutral structural frame.
      const frames = framesForFunc(profile, leaf);
      const locations = frames
        .map((frame) => ({
          line: frameTable.line[frame],
          column: frameTable.column[frame],
        }))
        .sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
      expect(locations).toEqual([
        { line: null, column: null },
        { line: 22, column: null },
      ]);
      expect(funcTable.lineNumber[leaf]).toBe(20);

      const thread = profile.threads[0];
      const leafSampleStacks = thread.samples.stack.filter((stackIndex) => {
        if (stackIndex === null) {
          return false;
        }
        return frameTable.func[stackTable.frame[stackIndex]] === leaf;
      });
      expect(leafSampleStacks).toHaveLength(2);
      for (const stackIndex of leafSampleStacks) {
        if (stackIndex === null) {
          throw new Error('Expected a stack for the leaf sample.');
        }
        const leafFrame = stackTable.frame[stackIndex];
        expect(frameTable.line[leafFrame]).toBe(22);

        const prefixOffset = stackTable.prefixOffset[stackIndex];
        if (prefixOffset === 0) {
          throw new Error('Expected the leaf stack to have a prefix.');
        }
        const prefixStack = stackIndex - prefixOffset;
        const prefixFrame = stackTable.frame[prefixStack];
        expect(frameTable.func[prefixFrame]).toBe(doWork);
        expect(frameTable.line[prefixFrame]).toBe(null);
        expect(funcTable.lineNumber[doWork]).toBe(10);
      }
    });

    it('ignores positionTicks on native frames that have no source', async function () {
      const profile =
        await unserializeProfileOfArbitraryFormat(makeProfileText());
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      const { frameTable } = profile.shared;
      const nativeThing = findFuncByName(profile, 'nativeThing');
      const frames = framesForFunc(profile, nativeThing);
      expect(frames).toHaveLength(1);
      // positionTicks line 99 must be ignored; there's no source to map it to.
      expect(frameTable.line[frames[0]]).toBe(null);
    });
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

    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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

    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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

    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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

    assertProfileIntegrity(profile);
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

  it('captures source map URLs from ScriptCatchup events', async function () {
    // Traces recorded with the "v8-source-rundown" category (on by default in
    // the DevTools Performance panel) include a ScriptCatchup event per parsed
    // script that declares its source map URL. Build a small trace with a CPU
    // profile plus these events and check they land in the source table
    // verbatim (relative URLs stay relative, matching Gecko profiles).
    const chromeProfile = {
      traceEvents: [
        {
          args: { data: { startTime: 0 } },
          cat: 'disabled-by-default-v8.cpu_profiler',
          id: '0x1',
          name: 'Profile',
          ph: 'P',
          pid: 1000,
          tid: 1,
          ts: 0,
        },
        {
          args: {
            data: {
              cpuProfile: {
                nodes: [
                  {
                    callFrame: { functionName: '(root)', scriptId: 0 },
                    id: 1,
                  },
                  {
                    callFrame: {
                      functionName: 'relative',
                      scriptId: 7,
                      url: 'https://example.com/app.js',
                      lineNumber: 10,
                      columnNumber: 5,
                    },
                    id: 2,
                    parent: 1,
                  },
                  {
                    callFrame: {
                      functionName: 'absolute',
                      scriptId: 8,
                      url: 'https://example.com/vendor.js',
                      lineNumber: 20,
                      columnNumber: 3,
                    },
                    id: 3,
                    parent: 1,
                  },
                  {
                    callFrame: {
                      functionName: 'inline',
                      scriptId: 9,
                      url: 'https://example.com/inline.js',
                      lineNumber: 1,
                      columnNumber: 1,
                    },
                    id: 4,
                    parent: 1,
                  },
                  {
                    callFrame: {
                      functionName: 'nomap',
                      scriptId: 10,
                      url: 'https://example.com/nomap.js',
                      lineNumber: 2,
                      columnNumber: 2,
                    },
                    id: 5,
                    parent: 1,
                  },
                ],
                samples: [2, 3, 4, 5],
              },
              timeDeltas: [0, 500, 500, 500],
            },
          },
          cat: 'disabled-by-default-v8.cpu_profiler',
          id: '0x1',
          name: 'ProfileChunk',
          ph: 'P',
          pid: 1000,
          tid: 1,
          ts: 1,
        },
        // A source map URL relative to the script URL should be kept verbatim.
        {
          args: {
            data: {
              isolate: 'iso1',
              scriptId: 7,
              url: 'https://example.com/app.js',
              sourceMapUrl: '/app.js.map',
            },
          },
          cat: 'disabled-by-default-devtools.v8-source-rundown',
          name: 'ScriptCatchup',
          ph: 'X',
          pid: 1000,
          tid: 1,
          ts: 0,
        },
        // An absolute source map URL should be kept as-is.
        {
          args: {
            data: {
              isolate: 'iso1',
              scriptId: 8,
              url: 'https://example.com/vendor.js',
              sourceMapUrl: 'https://cdn.example.com/vendor.js.map',
            },
          },
          cat: 'disabled-by-default-devtools.v8-source-rundown',
          name: 'ScriptCatchup',
          ph: 'X',
          pid: 1000,
          tid: 1,
          ts: 0,
        },
        // An inline (data:) source map URL should be kept as-is.
        {
          args: {
            data: {
              isolate: 'iso1',
              scriptId: 9,
              url: 'https://example.com/inline.js',
              sourceMapUrl: 'data:application/json;base64,e30=',
            },
          },
          cat: 'disabled-by-default-devtools.v8-source-rundown',
          name: 'ScriptCatchup',
          ph: 'X',
          pid: 1000,
          tid: 1,
          ts: 0,
        },
        // A script without a source map URL should leave the field null.
        {
          args: {
            data: {
              isolate: 'iso1',
              scriptId: 10,
              url: 'https://example.com/nomap.js',
            },
          },
          cat: 'disabled-by-default-devtools.v8-source-rundown',
          name: 'ScriptCatchup',
          ph: 'X',
          pid: 1000,
          tid: 1,
          ts: 0,
        },
        // A ScriptCatchup for a script that isn't referenced by the CPU profile
        // should be harmless (no source is created for it).
        {
          args: {
            data: {
              isolate: 'iso1',
              scriptId: 3,
              url: 'extensions::SafeBuiltins',
              sourceMapUrl: '/should-be-ignored.map',
            },
          },
          cat: 'disabled-by-default-devtools.v8-source-rundown',
          name: 'ScriptCatchup',
          ph: 'X',
          pid: 1000,
          tid: 1,
          ts: 0,
        },
      ],
    };

    const profile = await unserializeProfileOfArbitraryFormat(
      JSON.stringify(chromeProfile)
    );
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    assertProfileIntegrity(profile);

    const { sources, stringArray } = profile.shared;
    const getSourceMapURL = (filename: string): string | null => {
      const sourceIndex = sources.filename.findIndex(
        (i) => stringArray[i] === filename
      );
      const sourceMapURLIndex = sources.sourceMapURL[sourceIndex];
      return sourceMapURLIndex === null ? null : stringArray[sourceMapURLIndex];
    };

    expect(getSourceMapURL('https://example.com/app.js')).toBe('/app.js.map');
    expect(getSourceMapURL('https://example.com/vendor.js')).toBe(
      'https://cdn.example.com/vendor.js.map'
    );
    expect(getSourceMapURL('https://example.com/inline.js')).toBe(
      'data:application/json;base64,e30='
    );
    expect(getSourceMapURL('https://example.com/nomap.js')).toBe(null);
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
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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
    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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

    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
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
    assertProfileIntegrity(profile);
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
    assertProfileIntegrity(profile);
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

    assertProfileIntegrity(profile);
    expect(profileImportSnapshot(profile)).toMatchSnapshot();
  });
});
