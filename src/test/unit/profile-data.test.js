/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import 'babel-polyfill';
import {
  getContainingLibrary,
  symbolicateProfile,
  applyFunctionMerging,
  setFuncNames,
} from '../../profile-logic/symbolication';
import {
  processProfile,
  unserializeProfileOfArbitraryFormat,
  serializeProfile,
} from '../../profile-logic/process-profile';
import {
  resourceTypes,
  getCallNodeInfo,
  getTracingMarkers,
  filterThreadByImplementation,
  getCallNodePath,
  getSampleIndexClosestToTime,
  convertStackToCallNodePath,
} from '../../profile-logic/profile-data';
import getGeckoProfile from '.././fixtures/profiles/gecko-profile';
import profileWithJS from '.././fixtures/profiles/timings-with-js';
import { UniqueStringArray } from '../../utils/unique-string-array';
import { FakeSymbolStore } from '../fixtures/fake-symbol-store';
import { sortDataTable } from '../../utils/data-table-utils';
import {
  isOldCleopatraFormat,
  convertOldCleopatraProfile,
} from '../../profile-logic/old-cleopatra-profile-format';
import {
  isProcessedProfile,
  upgradeProcessedProfileToCurrentVersion,
  CURRENT_VERSION as CURRENT_PROCESSED_VERSION,
} from '../../profile-logic/processed-profile-versioning';
import {
  upgradeGeckoProfileToCurrentVersion,
  CURRENT_VERSION as CURRENT_GECKO_VERSION,
} from '../../profile-logic/gecko-profile-versioning';
import {
  getCategoryByImplementation,
  implementationCategoryMap,
} from '../../profile-logic/color-categories';
import getCallNodeProfile from '../fixtures/profiles/call-nodes';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { funcHasRecursiveCall } from '../../profile-logic/transforms';

import type { Thread, IndexIntoStackTable } from '../../types/profile';

describe('unique-string-array', function() {
  const u = new UniqueStringArray(['foo', 'bar', 'baz']);
  it('should return the right strings', function() {
    expect(u.getString(0)).toEqual('foo');
    expect(u.getString(1)).toEqual('bar');
    expect(u.getString(2)).toEqual('baz');
  });
  it('should return the correct index for existing strings', function() {
    expect(u.indexForString('foo')).toEqual(0);
    expect(u.indexForString('bar')).toEqual(1);
    expect(u.indexForString('baz')).toEqual(2);
  });
  it('should return a new index for a new string', function() {
    expect(u.indexForString('qux')).toEqual(3);
    expect(u.indexForString('qux')).toEqual(3);
    expect(u.indexForString('hello')).toEqual(4);
    expect(u.indexForString('bar')).toEqual(1);
    expect(u.indexForString('qux')).toEqual(3);
    expect(u.getString(3)).toEqual('qux');
    expect(u.getString(4)).toEqual('hello');
  });
});

describe('data-table-utils', function() {
  describe('sortDataTable', function() {
    const originalDataTable = {
      length: 6,
      word: ['a', 'is', 'now', 'This', 'array', 'sorted'],
      order: [13, 0.7, 2, -0.2, 100, 20.1],
      wordLength: [1, 2, 3, 4, 5, 6],
    };
    const dt = JSON.parse(JSON.stringify(originalDataTable));
    it('test preparation', function() {
      // verify copy
      expect(dt).not.toBe(originalDataTable);
      expect(dt).toEqual(originalDataTable);
      expect(dt.word.map(w => w.length)).toEqual(dt.wordLength);
    });
    it('should sort this data table by order', function() {
      // sort by order
      sortDataTable(dt, dt.order, (a, b) => a - b);

      expect(dt.length).toEqual(originalDataTable.length);
      expect(dt.word.length).toEqual(originalDataTable.length);
      expect(dt.order.length).toEqual(originalDataTable.length);
      expect(dt.wordLength.length).toEqual(originalDataTable.length);
      expect(dt.word.map(w => w.length)).toEqual(dt.wordLength);
      expect(dt.order).toEqual([...dt.order].sort((a, b) => a - b));
      expect(dt.word.join(' ')).toEqual('This is now a sorted array');
    });
    it('should sort this data table by wordLength', function() {
      // sort by wordLength
      sortDataTable(dt, dt.wordLength, (a, b) => a - b);
      expect(dt).toEqual(originalDataTable);
    });
    const differentDataTable = {
      length: 7,
      keyColumn: [1, 2, 3, 5, 6, 4, 7],
    };
    it('should sort this other data table', function() {
      sortDataTable(
        differentDataTable,
        differentDataTable.keyColumn,
        (a, b) => a - b
      );
      expect(differentDataTable.keyColumn).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });
});

describe('process-profile', function() {
  describe('processProfile', function() {
    const profile = processProfile(getGeckoProfile());
    it('should have three threads', function() {
      expect(profile.threads.length).toEqual(3);
    });
    it('should not have a profile-wide libs property', function() {
      expect('libs' in profile).toBeFalsy();
    });
    it('should have threads that are objects of the right shape', function() {
      for (const thread of profile.threads) {
        expect(typeof thread).toEqual('object');
        expect('libs' in thread).toBeTruthy();
        expect('samples' in thread).toBeTruthy();
        expect('stackTable' in thread).toBeTruthy();
        expect('frameTable' in thread).toBeTruthy();
        expect('markers' in thread).toBeTruthy();
        expect('stringTable' in thread).toBeTruthy();
        expect('funcTable' in thread).toBeTruthy();
        expect('resourceTable' in thread).toBeTruthy();
      }
    });
    it('should sort libs by start address', function() {
      const libs = profile.threads[0].libs;
      let lastStartAddress = -Infinity;
      for (const lib of libs) {
        expect(lib.start).toBeGreaterThan(lastStartAddress);
        lastStartAddress = lib.start;
      }
    });
    it('should have reasonable debugName fields on each library', function() {
      expect(profile.threads[0].libs[0].debugName).toEqual('firefox');
      expect(profile.threads[0].libs[1].debugName).toEqual('examplebinary');
      expect(profile.threads[0].libs[2].debugName).toEqual(
        'examplebinary2.pdb'
      );
      expect(profile.threads[1].libs[0].debugName).toEqual('firefox');
      expect(profile.threads[1].libs[1].debugName).toEqual('examplebinary');
      expect(profile.threads[1].libs[2].debugName).toEqual(
        'examplebinary2.pdb'
      );

      // Thread 2 is the content process main thread
      expect(profile.threads[2].libs[0].debugName).toEqual(
        'firefox-webcontent'
      );
      expect(profile.threads[2].libs[1].debugName).toEqual('examplebinary');
      expect(profile.threads[2].libs[2].debugName).toEqual(
        'examplebinary2.pdb'
      );
    });
    it('should have reasonable breakpadId fields on each library', function() {
      for (const thread of profile.threads) {
        for (const lib of thread.libs) {
          expect('breakpadId' in lib).toBeTruthy();
          expect(lib.breakpadId.length).toEqual(33);
          expect(lib.breakpadId).toEqual(lib.breakpadId.toUpperCase());
        }
      }
    });
    it('should shift the content process by 1 second', function() {
      // Should be Content, but modified by workaround for bug 1322471.
      expect(profile.threads[2].name).toEqual('GeckoMain');

      expect(profile.threads[0].samples.time[0]).toEqual(0);
      expect(profile.threads[0].samples.time[1]).toEqual(1);

      // 1 second later than the same samples in the main process because the
      // content process' start time is 1s later.
      expect(profile.threads[2].samples.time[0]).toEqual(1000);
      expect(profile.threads[2].samples.time[1]).toEqual(1001);

      // Now about markers
      expect(profile.threads[0].markers.time[0]).toEqual(1);
      expect(profile.threads[0].markers.time[1]).toEqual(2);
      expect(profile.threads[0].markers.time[2]).toEqual(3);
      expect(profile.threads[0].markers.time[3]).toEqual(4);
      expect(profile.threads[0].markers.time[4]).toEqual(5);
      expect(
        profile.threads[0].markers.data[6]
          ? profile.threads[0].markers.data[6].startTime
          : null
      ).toEqual(9);
      expect(
        profile.threads[0].markers.data[6]
          ? profile.threads[0].markers.data[6].endTime
          : null
      ).toEqual(10);

      // 1 second later than the same markers in the main process.
      expect(profile.threads[2].markers.time[0]).toEqual(1001);
      expect(profile.threads[2].markers.time[1]).toEqual(1002);
      expect(profile.threads[2].markers.time[2]).toEqual(1003);
      expect(profile.threads[2].markers.time[3]).toEqual(1004);
      expect(profile.threads[2].markers.time[4]).toEqual(1005);
      expect(
        profile.threads[2].markers.data[6]
          ? profile.threads[2].markers.data[6].startTime
          : null
      ).toEqual(1009);
      expect(
        profile.threads[2].markers.data[6]
          ? profile.threads[2].markers.data[6].endTime
          : null
      ).toEqual(1010);
      expect(
        profile.threads[2].markers.data[6] &&
        profile.threads[2].markers.data[6].type === 'DOMEvent'
          ? profile.threads[2].markers.data[6].timeStamp
          : null
      ).toEqual(1001);
      // TODO: also shift the samples inside marker callstacks
    });
    it('should create one function per frame', function() {
      const thread = profile.threads[0];
      expect(thread.frameTable.length).toEqual(5);
      expect('location' in thread.frameTable).toBeFalsy();
      expect('func' in thread.frameTable).toBeTruthy();
      expect('resource' in thread.funcTable).toBeTruthy();
      expect(thread.funcTable.length).toEqual(5);
      expect(thread.frameTable.func[0]).toEqual(0);
      expect(thread.frameTable.func[1]).toEqual(1);
      expect(thread.frameTable.func[2]).toEqual(2);
      expect(thread.frameTable.func[3]).toEqual(3);
      expect(thread.frameTable.func[4]).toEqual(4);
      expect(thread.frameTable.address[0]).toEqual(-1);
      expect(thread.frameTable.address[1]).toEqual(3972);
      expect(thread.frameTable.address[2]).toEqual(6725);
      expect(thread.frameTable.address[3]).toEqual(-1);
      expect(thread.frameTable.address[4]).toEqual(-1);
      expect(thread.funcTable.name[0]).toEqual(0);
      expect(thread.funcTable.name[1]).toEqual(1);
      expect(thread.funcTable.name[2]).toEqual(2);
      expect(thread.funcTable.name[3]).toEqual(3);
      expect(thread.stringTable.getString(thread.funcTable.name[4])).toEqual(
        'frobnicate'
      );
      const chromeStringIndex = thread.funcTable.fileName[4];
      if (typeof chromeStringIndex !== 'number') {
        throw new Error('chromeStringIndex must be a number');
      }
      expect(thread.stringTable.getString(chromeStringIndex)).toEqual(
        'chrome://blargh'
      );
      expect(thread.funcTable.lineNumber[4]).toEqual(34);
      expect(thread.funcTable.address[0]).toEqual(-1);
      expect(thread.funcTable.address[1]).toEqual(3972);
      expect(thread.funcTable.address[2]).toEqual(6725);
      expect(thread.funcTable.address[3]).toEqual(-1);
      expect(thread.funcTable.address[4]).toEqual(-1);
    });
    it('should create one resource per used library', function() {
      const thread = profile.threads[0];
      expect(thread.resourceTable.length).toEqual(2);
      expect(thread.resourceTable.type[0]).toEqual(resourceTypes.library);
      expect(thread.resourceTable.type[1]).toEqual(resourceTypes.url);
      const [name0, name1] = thread.resourceTable.name;
      expect(thread.stringTable.getString(name0)).toEqual('firefox');
      expect(thread.stringTable.getString(name1)).toEqual('chrome://blargh');
    });
  });
  describe('DevTools profiles', function() {
    it('should process correctly', function() {
      // Mock out a DevTools profile.
      const profile = processProfile({
        label: null,
        duration: null,
        markers: null,
        frames: null,
        memory: null,
        ticks: null,
        allocations: null,
        profile: getGeckoProfile(),
        configuration: null,
        systemHost: null,
        systemClient: null,
        fileType: null,
        version: null,
      });
      expect(profile.threads.length).toEqual(3);
    });
  });
  describe('extensions metadata', function() {
    it('should be processed correctly', function() {
      const geckoProfile = getGeckoProfile();
      geckoProfile.meta.extensions = {
        schema: {
          id: 0,
          name: 1,
          baseURL: 2,
        },
        data: [
          [
            'geckoprofiler@mozilla.com',
            'Gecko Profiler',
            'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/',
          ],
          [
            'screenshots@mozilla.org',
            'Firefox Screenshots',
            'moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/',
          ],
        ],
      };

      const profile = processProfile(geckoProfile);
      expect(profile.meta.extensions).toEqual({
        baseURL: [
          'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/',
          'moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/',
        ],
        id: ['geckoprofiler@mozilla.com', 'screenshots@mozilla.org'],
        name: ['Gecko Profiler', 'Firefox Screenshots'],
        length: 2,
      });
    });
    it('should be handled correctly if missing', function() {
      const geckoProfile = getGeckoProfile();
      delete geckoProfile.meta.extensions;

      const profile = processProfile(geckoProfile);
      expect(profile.meta.extensions).toEqual({
        baseURL: [],
        id: [],
        name: [],
        length: 0,
      });
    });
  });
});

describe('profile-data', function() {
  describe('createCallNodeTableAndFixupSamples', function() {
    const profile = processProfile(getGeckoProfile());
    const thread = profile.threads[0];
    const { callNodeTable } = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable
    );
    it('should create one callNode per stack', function() {
      expect(thread.stackTable.length).toEqual(5);
      expect(callNodeTable.length).toEqual(5);
      expect('prefix' in callNodeTable).toBeTruthy();
      expect('func' in callNodeTable).toBeTruthy();
      expect(callNodeTable.func[0]).toEqual(0);
      expect(callNodeTable.func[1]).toEqual(1);
      expect(callNodeTable.func[2]).toEqual(2);
      expect(callNodeTable.func[3]).toEqual(3);
    });
  });

  function _getStackList(
    thread: Thread,
    stackIndex: IndexIntoStackTable | null
  ) {
    if (typeof stackIndex !== 'number') {
      throw new Error('stackIndex must be a number');
    }
    const { prefix } = thread.stackTable;
    const stackList = [];
    let nextStack = stackIndex;
    while (nextStack !== null) {
      if (typeof nextStack !== 'number') {
        throw new Error('nextStack must be a number');
      }

      stackList.unshift(nextStack);
      nextStack = prefix[nextStack];
    }
    return stackList;
  }

  describe('getCallNodeInfo', function() {
    const { threads: [thread] } = getCallNodeProfile();
    const { callNodeTable, stackIndexToCallNodeIndex } = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable
    );
    const stack0 = thread.samples.stack[0];
    const stack1 = thread.samples.stack[1];
    if (stack0 === null || stack1 === null) {
      throw new Error('Stacks must not be null.');
    }
    const originalStackListA = _getStackList(thread, stack0);
    const originalStackListB = _getStackList(thread, stack1);
    const mergedFuncListA = getCallNodePath(
      stackIndexToCallNodeIndex[stack0],
      callNodeTable
    );
    const mergedFuncListB = getCallNodePath(
      stackIndexToCallNodeIndex[stack1],
      callNodeTable
    );

    it('starts with a fully unduplicated set stack frames', function() {
      /**
       * Assert this original structure:
       *
       *            stack0 (funcA)
       *                 |
       *                 v
       *            stack1 (funcB)
       *                 |
       *                 v
       *            stack2 (funcC)
       *            /            \
       *           V              V
       *    stack3 (funcD)     stack5 (funcD)
       *         |                  |
       *         v                  V
       *    stack4 (funcE)     stack6 (funcF)
       *
       *       ^sample 0          ^sample 1
       */

      expect(thread.stackTable.length).toEqual(7);
      expect(originalStackListA).toEqual([0, 1, 2, 3, 4]);
      expect(originalStackListB).toEqual([0, 1, 2, 5, 6]);
    });

    it('creates a callNodeTable with merged stacks that share functions', function() {
      /**
       * This structure represents the desired de-duplication.
       *
       *            callNode0 (funcA)
       *                 |
       *                 v
       *            callNode1 (funcB)
       *                 |
       *                 v
       *            callNode2 (funcC)
       *                 |
       *                 v
       *            callNode3 (funcD)
       *          /               \
       *         V                 V
       * callNode4 (funcE)       callNode5 (funcF)
       *
       *       ^sample 0          ^sample 1
       */
      expect(mergedFuncListA).toEqual([0, 1, 2, 3, 4]);
      expect(mergedFuncListB).toEqual([0, 1, 2, 3, 5]);
      expect(callNodeTable.length).toEqual(6);
    });
  });
  describe('getTracingMarkers', function() {
    const profile = processProfile(getGeckoProfile());
    const thread = profile.threads[0];
    const tracingMarkers = getTracingMarkers(thread);

    it('should fold the two reflow markers into one tracing marker', function() {
      expect(tracingMarkers.length).toEqual(9);
      expect(tracingMarkers[1]).toMatchObject({
        start: 3,
        dur: 5,
        name: 'Reflow',
        title: null,
      });
    });
    it('should fold the two Rasterize markers into one tracing marker, after the reflow tracing marker', function() {
      expect(tracingMarkers[2]).toMatchObject({
        start: 4,
        dur: 1,
        name: 'Rasterize',
        title: null,
      });
    });
    it('should create a tracing marker for the MinorGC startTime/endTime marker', function() {
      expect(tracingMarkers[4]).toMatchObject({
        start: 11,
        dur: 1,
        name: 'MinorGC',
        title: null,
      });
    });
    it('should create a tracing marker for the DOMEvent marker', function() {
      expect(tracingMarkers[3]).toMatchObject({
        dur: 1,
        name: 'DOMEvent',
        start: 9,
        title: null,
      });
    });
    it('should create a tracing marker for the marker UserTiming', function() {
      expect(tracingMarkers[5]).toMatchObject({
        dur: 1,
        name: 'UserTiming',
        start: 12,
        title: null,
      });
    });
    it('should handle tracing markers without a start', function() {
      expect(tracingMarkers[0]).toMatchObject({
        start: -1,
        dur: 2, // This duration doesn't represent much and won't be displayed anyway
        name: 'Rasterize',
        title: null,
      });
    });
    it('should handle tracing markers without an end', function() {
      expect(tracingMarkers[8]).toMatchObject({
        start: 20,
        dur: Infinity,
        name: 'Rasterize',
        title: null,
      });
    });
    it('should handle nested tracing markers correctly', function() {
      expect(tracingMarkers[6]).toMatchObject({
        start: 13,
        dur: 5,
        name: 'Reflow',
        title: null,
      });
      expect(tracingMarkers[7]).toMatchObject({
        start: 14,
        dur: 1,
        name: 'Reflow',
        title: null,
      });
    });
  });
});

describe('symbolication', function() {
  describe('getContainingLibrary', function() {
    const libs = [
      { start: 0, end: 20, name: 'first' },
      { start: 20, end: 40, name: 'second' },
      { start: 40, end: 50, name: 'third' },
      { start: 60, end: 80, name: 'fourth' },
      { start: 80, end: 100, name: 'fifth' },
    ].map(lib => {
      // Make sure our fixtures are correctly typed.
      return Object.assign({}, lib, {
        offset: 0,
        arch: '',
        path: '',
        debugName: '',
        debugPath: '',
        breakpadId: '',
      });
    });

    // Help flow out here.
    function getLibName(lib) {
      if (lib) {
        return lib.name;
      }
      return null;
    }
    it('should return the first library for addresses inside the first library', function() {
      expect(getLibName(getContainingLibrary(libs, 0))).toEqual('first');
      expect(getLibName(getContainingLibrary(libs, 10))).toEqual('first');
      expect(getLibName(getContainingLibrary(libs, 19))).toEqual('first');
    });
    it('should return the second library for addresses inside the second library', function() {
      expect(getLibName(getContainingLibrary(libs, 20))).toEqual('second');
      expect(getLibName(getContainingLibrary(libs, 21))).toEqual('second');
      expect(getLibName(getContainingLibrary(libs, 27))).toEqual('second');
      expect(getLibName(getContainingLibrary(libs, 39))).toEqual('second');
    });
    it('should return the third library for addresses inside the third library', function() {
      expect(getLibName(getContainingLibrary(libs, 40))).toEqual('third');
      expect(getLibName(getContainingLibrary(libs, 41))).toEqual('third');
      expect(getLibName(getContainingLibrary(libs, 47))).toEqual('third');
      expect(getLibName(getContainingLibrary(libs, 49))).toEqual('third');
    });
    it('should return no library when outside or in holes', function() {
      expect(getContainingLibrary(libs, -1)).toEqual(null);
      expect(getContainingLibrary(libs, -10)).toEqual(null);
      expect(getContainingLibrary(libs, 100)).toEqual(null);
      expect(getContainingLibrary(libs, 256)).toEqual(null);
      expect(getContainingLibrary(libs, 50)).toEqual(null);
      expect(getContainingLibrary(libs, 55)).toEqual(null);
      expect(getContainingLibrary(libs, 59)).toEqual(null);
    });
  });

  describe('symbolicateProfile', function() {
    let unsymbolicatedProfile = null;
    let symbolicatedProfile = null;

    beforeAll(function() {
      unsymbolicatedProfile = processProfile(getGeckoProfile());
      const symbolTable = {};
      symbolTable[0] = 'first symbol';
      symbolTable[0xf00] = 'second symbol';
      symbolTable[0x1a00] = 'third symbol';
      symbolTable[0x2000] = 'last symbol';
      const symbolProvider = new FakeSymbolStore({
        firefox: symbolTable,
        'firefox-webcontent': symbolTable,
      });
      symbolicatedProfile = Object.assign({}, unsymbolicatedProfile, {
        threads: unsymbolicatedProfile.threads.slice(),
      });
      const symbolicationPromise = symbolicateProfile(
        unsymbolicatedProfile,
        symbolProvider,
        {
          onMergeFunctions: (threadIndex, oldFuncToNewFuncMap) => {
            if (!symbolicatedProfile) {
              throw new Error('symbolicatedProfile cannot be null');
            }
            symbolicatedProfile.threads[threadIndex] = applyFunctionMerging(
              symbolicatedProfile.threads[threadIndex],
              oldFuncToNewFuncMap
            );
          },
          onGotFuncNames: (threadIndex, funcIndices, funcNames) => {
            if (!symbolicatedProfile) {
              throw new Error('symbolicatedProfile cannot be null');
            }
            symbolicatedProfile.threads[threadIndex] = setFuncNames(
              symbolicatedProfile.threads[threadIndex],
              funcIndices,
              funcNames
            );
          },
        }
      );
      return symbolicationPromise;
    });

    it('should assign correct symbols to frames', function() {
      function functionNameForFrameInThread(thread, frameIndex) {
        const funcIndex = thread.frameTable.func[frameIndex];
        const funcNameStringIndex = thread.funcTable.name[funcIndex];
        return thread.stringTable.getString(funcNameStringIndex);
      }
      if (!unsymbolicatedProfile || !symbolicatedProfile) {
        throw new Error('Profiles cannot be null');
      }
      const symbolicatedThread = symbolicatedProfile.threads[0];
      const unsymbolicatedThread = unsymbolicatedProfile.threads[0];

      expect(functionNameForFrameInThread(unsymbolicatedThread, 1)).toEqual(
        '0x100000f84'
      );
      expect(functionNameForFrameInThread(symbolicatedThread, 1)).toEqual(
        'second symbol'
      );
      expect(functionNameForFrameInThread(unsymbolicatedThread, 2)).toEqual(
        '0x100001a45'
      );
      expect(functionNameForFrameInThread(symbolicatedThread, 2)).toEqual(
        'third symbol'
      );
    });
  });
  // TODO: check that functions are collapsed correctly
});

describe('upgrades', function() {
  describe('old-cleopatra-profile', function() {
    const oldCleopatraProfile = require('../fixtures/upgrades/old-cleopatra-profile.sps.json');
    const ancientCleopatraProfile = require('../fixtures/upgrades/ancient-cleopatra-profile.sps.json');

    [oldCleopatraProfile, ancientCleopatraProfile].forEach(
      exampleOldCleopatraProfile => {
        it('should detect the profile as an old cleopatra profile', function() {
          expect(isOldCleopatraFormat(exampleOldCleopatraProfile)).toBe(true);
        });

        it('should be able to convert the old cleopatra profile into a processed profile', function() {
          const profile = convertOldCleopatraProfile(
            exampleOldCleopatraProfile
          );
          expect(isProcessedProfile(profile)).toBe(true);
          // For now, just test that upgrading doesn't throw any exceptions.
          upgradeProcessedProfileToCurrentVersion(profile);
          expect(profile.threads.length).toBeGreaterThanOrEqual(1);
          expect(profile.threads[0].name).toBe('GeckoMain');
        });
      }
    );

    // Executing this only for oldCleopatraProfile because
    // ancientCleopatraProfile doesn't have any causes for markers.
    it('should be able to convert causes from old cleopatra profiles', function() {
      const profile = unserializeProfileOfArbitraryFormat(oldCleopatraProfile);

      const [thread] = profile.threads;
      const { markers } = thread;

      const markerWithCauseIndex = markers.data.findIndex(
        marker => marker !== null && marker.type === 'tracing' && marker.cause
      );

      if (markerWithCauseIndex < -1) {
        throw new Error('We should have found one marker with a cause!');
      }

      const markerNameIndex = markers.name[markerWithCauseIndex];
      expect(thread.stringTable.getString(markerNameIndex)).toEqual('Styles');

      const markerWithCause = markers.data[markerWithCauseIndex];

      // This makes Flow happy
      if (
        markerWithCause === null ||
        markerWithCause === undefined ||
        markerWithCause.type !== 'tracing' ||
        !markerWithCause.cause
      ) {
        throw new Error('This marker should have a cause!');
      }

      // This is the stack we should get
      expect(markerWithCause).toEqual({
        category: 'Paint',
        cause: { stack: 10563, time: 4195720.505958 },
        interval: 'start',
        type: 'tracing',
      });
    });
  });

  function compareProcessedProfiles(lhs, rhs) {
    // Processed profiles contain a stringTable which isn't easily comparable.
    // Instead, serialize the profiles first, so that the stringTable becomes a
    // stringArray, and compare the serialized versions.
    const serializedLhsAsObject = JSON.parse(serializeProfile(lhs));
    const serializedRhsAsObject = JSON.parse(serializeProfile(rhs));

    // Don't compare the version of the Gecko profile that these profiles originated from.
    delete serializedLhsAsObject.meta.version;
    delete serializedRhsAsObject.meta.version;

    expect(serializedLhsAsObject).toEqual(serializedRhsAsObject);
  }
  const afterUpgradeReference = unserializeProfileOfArbitraryFormat(
    require('../fixtures/upgrades/processed-8.json')
  );

  // Uncomment this to output your next ./upgrades/processed-X.json
  // console.log(serializeProfile(afterUpgradeReference));
  // Then run prettier on it with the following command:
  //   yarn run prettier --write <file name>
  it('should import an old profile and upgrade it to be the same as the reference processed profile', function() {
    expect(afterUpgradeReference.meta.preprocessedProfileVersion).toEqual(
      CURRENT_PROCESSED_VERSION
    );

    const serializedOldProcessedProfile0 = require('../fixtures/upgrades/processed-0.json');
    const upgradedProfile0 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile0
    );
    compareProcessedProfiles(upgradedProfile0, afterUpgradeReference);

    const serializedOldProcessedProfile1 = require('../fixtures/upgrades/processed-1.json');
    const upgradedProfile1 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile1
    );
    compareProcessedProfiles(upgradedProfile1, afterUpgradeReference);

    const serializedOldProcessedProfile2 = require('../fixtures/upgrades/processed-2.json');
    const upgradedProfile2 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile2
    );
    compareProcessedProfiles(upgradedProfile2, afterUpgradeReference);

    const serializedOldProcessedProfile3 = require('../fixtures/upgrades/processed-3.json');
    const upgradedProfile3 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile3
    );
    compareProcessedProfiles(upgradedProfile3, afterUpgradeReference);

    const serializedOldProcessedProfile4 = require('../fixtures/upgrades/processed-4.json');
    const upgradedProfile4 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile4
    );
    compareProcessedProfiles(upgradedProfile4, afterUpgradeReference);

    const serializedOldProcessedProfile5 = require('../fixtures/upgrades/processed-5.json');
    const upgradedProfile5 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile5
    );
    compareProcessedProfiles(upgradedProfile5, afterUpgradeReference);

    const serializedOldProcessedProfile6 = require('../fixtures/upgrades/processed-6.json');
    const upgradedProfile6 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile6
    );
    compareProcessedProfiles(upgradedProfile6, afterUpgradeReference);

    const serializedOldProcessedProfile7 = require('../fixtures/upgrades/processed-7.json');
    const upgradedProfile7 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile7
    );
    compareProcessedProfiles(upgradedProfile7, afterUpgradeReference);

    // processed-7a to processed-8a is testing that we properly
    // upgrade the DOMEventMarkerPayload.timeStamp field.
    const serializedOldProcessedProfile7a = require('../fixtures/upgrades/processed-7a.json');
    const afterUpgradeReference8a = unserializeProfileOfArbitraryFormat(
      require('../fixtures/upgrades/processed-8a.json')
    );
    const upgradedProfile7a = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile7a
    );
    compareProcessedProfiles(upgradedProfile7a, afterUpgradeReference8a);

    const serializedOldProcessedProfile8 = require('../fixtures/upgrades/processed-8.json');
    const upgradedProfile8 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile8
    );
    compareProcessedProfiles(upgradedProfile8, afterUpgradeReference);

    // This last test is to make sure we properly upgrade the json
    // file to same version
    const serializedOldProcessedProfile9 = require('../fixtures/upgrades/processed-9.json');
    const upgradedProfile9 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile9
    );
    compareProcessedProfiles(upgradedProfile9, afterUpgradeReference);
  });
  it('should import an old Gecko profile and upgrade it to be the same as the newest Gecko profile', function() {
    const afterUpgradeGeckoReference = require('../fixtures/upgrades/gecko-9.json');
    // Uncomment this to output your next ./upgrades/gecko-X.json
    // upgradeGeckoProfileToCurrentVersion(afterUpgradeGeckoReference);
    // console.log(JSON.stringify(afterUpgradeGeckoReference));
    // Then run prettier on it with the following command:
    //   yarn run prettier --write <file name>
    expect(afterUpgradeGeckoReference.meta.version).toEqual(
      CURRENT_GECKO_VERSION
    );

    const geckoProfile3 = require('../fixtures/upgrades/gecko-3.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile3);
    expect(geckoProfile3).toEqual(afterUpgradeGeckoReference);

    const geckoProfile4 = require('../fixtures/upgrades/gecko-4.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile4);
    expect(geckoProfile4).toEqual(afterUpgradeGeckoReference);

    const geckoProfile5 = require('../fixtures/upgrades/gecko-5.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile5);
    expect(geckoProfile5).toEqual(afterUpgradeGeckoReference);

    const geckoProfile6 = require('../fixtures/upgrades/gecko-6.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile6);
    expect(geckoProfile6).toEqual(afterUpgradeGeckoReference);

    const geckoProfile7 = require('../fixtures/upgrades/gecko-7.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile7);
    expect(geckoProfile7).toEqual(afterUpgradeGeckoReference);

    const geckoProfile8 = require('../fixtures/upgrades/gecko-8.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile8);
    expect(geckoProfile8).toEqual(afterUpgradeGeckoReference);

    // This last test is to make sure we properly upgrade the json
    // file to same version
    const geckoProfile9 = require('../fixtures/upgrades/gecko-9.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile9);
    expect(geckoProfile9).toEqual(afterUpgradeGeckoReference);
  });
});

describe('color-categories', function() {
  const profile = processProfile(getGeckoProfile());
  const [thread] = profile.threads;
  it('calculates the category for each frame', function() {
    const categories = thread.samples.stack.map(stackIndex => {
      const frameIndex =
        stackIndex === null ? null : thread.stackTable.frame[stackIndex];
      if (frameIndex === null) {
        throw new Error('frameIndex cannot be null');
      }
      return getCategoryByImplementation(thread, frameIndex);
    });
    for (let i = 0; i < 6; i++) {
      expect(categories[i].name).toEqual('Platform');
      expect(categories[i].color).toEqual(implementationCategoryMap.Platform);
    }
    expect(categories[6].name).toEqual('JS Baseline');
    expect(categories[6].color).toEqual(
      implementationCategoryMap['JS Baseline']
    );
  });
});

describe('filter-by-implementation', function() {
  const profile = processProfile(profileWithJS());
  const thread = profile.threads[0];

  function stackIsJS(filteredThread, stackIndex) {
    if (stackIndex === null) {
      throw new Error('stackIndex cannot be null');
    }
    const frameIndex = filteredThread.stackTable.frame[stackIndex];
    const funcIndex = filteredThread.frameTable.func[frameIndex];
    return filteredThread.funcTable.isJS[funcIndex];
  }

  it('will return the same thread if filtering to "all"', function() {
    expect(filterThreadByImplementation(thread, 'combined')).toEqual(thread);
  });

  it('will return only JS samples if filtering to "js"', function() {
    const jsOnlyThread = filterThreadByImplementation(thread, 'js');
    const nonNullSampleStacks = jsOnlyThread.samples.stack.filter(
      stack => stack !== null
    );
    const samplesAreAllJS = nonNullSampleStacks
      .map(stack => stackIsJS(jsOnlyThread, stack))
      .reduce((a, b) => a && b);

    expect(samplesAreAllJS).toBe(true);
    expect(nonNullSampleStacks.length).toBe(4);
  });

  it('will return only C++ samples if filtering to "cpp"', function() {
    const cppOnlyThread = filterThreadByImplementation(thread, 'cpp');
    const nonNullSampleStacks = cppOnlyThread.samples.stack.filter(
      stack => stack !== null
    );
    const samplesAreAllJS = nonNullSampleStacks
      .map(stack => !stackIsJS(cppOnlyThread, stack))
      .reduce((a, b) => a && b);

    expect(samplesAreAllJS).toBe(true);
    expect(nonNullSampleStacks.length).toBe(10);
  });
});

describe('get-sample-index-closest-to-time', function() {
  it('returns the correct sample index for a provided time', function() {
    const { profile } = getProfileFromTextSamples(
      Array(10)
        .fill('A')
        .join(' ')
    );
    const thread = profile.threads[0];
    const { samples } = filterThreadByImplementation(thread, 'js');

    // getProfileFromTextSamples will generate a profile with samples
    // with 1ms of interval
    const interval = 1;

    expect(getSampleIndexClosestToTime(samples, 0, interval)).toBe(0);
    expect(getSampleIndexClosestToTime(samples, 0.9, interval)).toBe(0);
    expect(getSampleIndexClosestToTime(samples, 1.1, interval)).toBe(1);
    expect(getSampleIndexClosestToTime(samples, 1.5, interval)).toBe(1);
    expect(getSampleIndexClosestToTime(samples, 9.9, interval)).toBe(9);
    expect(getSampleIndexClosestToTime(samples, 100, interval)).toBe(9);
  });
});

describe('funcHasRecursiveCall', function() {
  const {
    profile,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A.js
    B.js
    C.cpp
    B.js
    D.js
  `);
  const [thread] = profile.threads;

  it('correctly identifies recursive functions based taking into account implementation', function() {
    expect([
      funcHasRecursiveCall(thread, 'combined', funcNames.indexOf('A.js')),
      funcHasRecursiveCall(thread, 'combined', funcNames.indexOf('B.js')),
      funcHasRecursiveCall(thread, 'js', funcNames.indexOf('B.js')),
    ]).toEqual([false, false, true]);
  });
});

describe('convertStackToCallNodePath', function() {
  it('correctly returns a call node path for a stack', function() {
    const { threads: [thread] } = getCallNodeProfile();
    const stack1 = thread.samples.stack[0];
    const stack2 = thread.samples.stack[1];
    if (stack1 === null || stack2 === null) {
      // Makes flow happy
      throw new Error("stack shouldn't be null");
    }
    let callNodePath = convertStackToCallNodePath(thread, stack1);
    expect(callNodePath).toEqual([4, 3, 2, 1, 0]);
    callNodePath = convertStackToCallNodePath(thread, stack2);
    expect(callNodePath).toEqual([5, 3, 2, 1, 0]);
  });
});
