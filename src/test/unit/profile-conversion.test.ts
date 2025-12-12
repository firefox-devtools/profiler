/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { unserializeProfileOfArbitraryFormat } from '../../profile-logic/process-profile';
import { isPerfScriptFormat } from '../../profile-logic/import/linux-perf';
import { isFlameGraphFormat } from '../../profile-logic/import/flame-graph';
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
