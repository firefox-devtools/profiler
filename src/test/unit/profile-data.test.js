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
import { processProfile } from '../../profile-logic/process-profile';
import {
  getCallNodeInfo,
  filterThreadByImplementation,
  getCallNodePathFromIndex,
  getSampleIndexClosestToTime,
  convertStackToCallNodePath,
  invertCallstack,
  getTimingsForPath,
  getSampleIndexToCallNodeIndex,
  getCallNodeIndexFromPath,
  getTreeOrderComparator,
  getSamplesSelectedStates,
} from '../../profile-logic/profile-data';
import { resourceTypes } from '../../profile-logic/data-structures';
import {
  createGeckoProfile,
  createGeckoProfileWithJsTimings,
  createGeckoSubprocessProfile,
} from '.././fixtures/profiles/gecko-profile';
import { UniqueStringArray } from '../../utils/unique-string-array';
import { FakeSymbolStore } from '../fixtures/fake-symbol-store';
import { sortDataTable } from '../../utils/data-table-utils';
import { ensureExists } from '../../utils/flow';
import getCallNodeProfile from '../fixtures/profiles/call-nodes';
import {
  getProfileFromTextSamples,
  getMergedProfileFromTextSamples,
  getJsTracerTable,
} from '../fixtures/profiles/processed-profile';
import { funcHasRecursiveCall } from '../../profile-logic/transforms';

import type { Thread, IndexIntoStackTable } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type { BreakdownByCategory } from '../../profile-logic/profile-data';

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
    const profile = processProfile(createGeckoProfile());
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
      const thread0 = profile.threads[0];
      const thread2 = profile.threads[2];

      // Should be Content, but modified by workaround for bug 1322471.
      expect(thread2.name).toEqual('GeckoMain');

      expect(thread0.samples.time[0]).toEqual(0);
      expect(thread0.samples.time[1]).toEqual(1);

      // 1 second later than the same samples in the main process because the
      // content process' start time is 1s later.
      expect(thread2.samples.time[0]).toEqual(1000);
      expect(thread2.samples.time[1]).toEqual(1001);

      // Now about markers
      expect(thread0.markers.time[0]).toEqual(1);
      expect(thread0.markers.time[1]).toEqual(2);
      expect(thread0.markers.time[2]).toEqual(3);
      expect(thread0.markers.time[3]).toEqual(4);
      expect(thread0.markers.time[4]).toEqual(5);

      expect(thread0.markers.time[6]).toEqual(9);
      expect(thread0.markers.time[7]).toEqual(10);

      // 1 second later than the same markers in the main process.
      expect(thread2.markers.time[0]).toEqual(1001);
      expect(thread2.markers.time[1]).toEqual(1002);
      expect(thread2.markers.time[2]).toEqual(1003);
      expect(thread2.markers.time[3]).toEqual(1004);
      expect(thread2.markers.time[4]).toEqual(1005);

      expect(thread2.markers.time[6]).toEqual(1009);
      expect(thread2.markers.time[7]).toEqual(1010);

      expect(
        thread2.markers.data[6] &&
          thread2.markers.data[6].type === 'tracing' &&
          thread2.markers.data[6].category === 'DOMEvent'
          ? thread2.markers.data[6].timeStamp
          : null
      ).toEqual(1001);
      expect(
        thread2.markers.data[7] &&
          thread2.markers.data[7].type === 'tracing' &&
          thread2.markers.data[7].category === 'DOMEvent'
          ? thread2.markers.data[7].timeStamp
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
      expect(thread.funcTable.columnNumber[4]).toEqual(35);
      expect(thread.funcTable.address[0]).toEqual(-1);
      expect(thread.funcTable.address[1]).toEqual(3972);
      expect(thread.funcTable.address[2]).toEqual(6725);
      expect(thread.funcTable.address[3]).toEqual(-1);
      expect(thread.funcTable.address[4]).toEqual(-1);
    });
    it('should create one resource per used library', function() {
      const thread = profile.threads[0];
      expect(thread.resourceTable.length).toEqual(3);
      expect(thread.resourceTable.type[0]).toEqual(resourceTypes.addon);
      expect(thread.resourceTable.type[1]).toEqual(resourceTypes.library);
      expect(thread.resourceTable.type[2]).toEqual(resourceTypes.url);
      const [name0, name1, name2] = thread.resourceTable.name;
      expect(thread.stringTable.getString(name0)).toEqual(
        'Extension "Form Autofill" (ID: formautofill@mozilla.org)'
      );
      expect(thread.stringTable.getString(name1)).toEqual('firefox');
      expect(thread.stringTable.getString(name2)).toEqual('chrome://blargh');
    });
  });

  describe('JS tracer', function() {
    it('does not have JS tracer information by default', function() {
      const profile = processProfile(createGeckoProfile());
      expect(profile.threads[0].jsTracer).toBe(undefined);
    });

    it('processes JS tracer and offsets the timestamps', function() {
      const geckoProfile = createGeckoProfile();
      let timestampOffsetMs = 33;

      {
        // Build the custom thread with JS tracer information. The startTime is offset
        // from the parent process.
        const geckoSubprocess = createGeckoSubprocessProfile(geckoProfile);
        const childProcessThread = geckoSubprocess.threads[0];
        const stringTable = new UniqueStringArray();
        const jsTracer = getJsTracerTable(stringTable, [
          ['jsTracerA', 0, 10],
          ['jsTracerB', 1, 9],
          ['jsTracerC', 2, 8],
        ]);
        childProcessThread.jsTracerEvents = jsTracer;
        geckoSubprocess.jsTracerDictionary = stringTable._array;
        geckoSubprocess.meta.startTime += timestampOffsetMs;
        // Update the timestampOffset taking into account the subprocess offset
        timestampOffsetMs =
          geckoSubprocess.meta.startTime - geckoProfile.meta.startTime;
        geckoProfile.processes.push(geckoSubprocess);
      }

      const timestampOffsetMicro = timestampOffsetMs * 1000;

      // Process the profile, and grab the threads we are interested in.
      const processedProfile = processProfile(geckoProfile);
      const childProcessThread = ensureExists(
        processedProfile.threads.find(thread => thread.jsTracer),
        'Could not find the thread with the JS tracer information'
      );
      const processedJsTracer = ensureExists(
        childProcessThread.jsTracer,
        'The JS tracer table was not found on the subprocess'
      );

      // Check that the values are correct from the test defined data.
      expect(
        processedJsTracer.events.map(index =>
          childProcessThread.stringTable.getString(index)
        )
      ).toEqual(['jsTracerA', 'jsTracerB', 'jsTracerC']);
      expect(processedJsTracer.durations).toEqual([10000, 8000, 6000]);
      expect(processedJsTracer.timestamps).toEqual([
        0 + timestampOffsetMicro,
        1000 + timestampOffsetMicro,
        2000 + timestampOffsetMicro,
      ]);
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
        profile: createGeckoProfile(),
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
      const geckoProfile = createGeckoProfile();
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
      const geckoProfile = createGeckoProfile();
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
    const profile = processProfile(createGeckoProfile());
    const defaultCategory = profile.meta.categories.findIndex(
      c => c.name === 'Other'
    );
    const thread = profile.threads[0];
    const { callNodeTable } = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
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
    const {
      meta,
      threads: [thread],
    } = getCallNodeProfile();
    const defaultCategory = meta.categories.findIndex(c => c.name === 'Other');
    const { callNodeTable, stackIndexToCallNodeIndex } = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );
    const stack0 = thread.samples.stack[0];
    const stack1 = thread.samples.stack[1];
    if (stack0 === null || stack1 === null) {
      throw new Error('Stacks must not be null.');
    }
    const originalStackListA = _getStackList(thread, stack0);
    const originalStackListB = _getStackList(thread, stack1);
    const mergedFuncListA = getCallNodePathFromIndex(
      stackIndexToCallNodeIndex[stack0],
      callNodeTable
    );
    const mergedFuncListB = getCallNodePathFromIndex(
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
      unsymbolicatedProfile = processProfile(createGeckoProfile());
      const symbolTable = new Map();
      symbolTable.set(0, 'first symbol');
      symbolTable.set(0xf00, 'second symbol');
      symbolTable.set(0x1a00, 'third symbol');
      symbolTable.set(0x2000, 'last symbol');
      const symbolStore = new FakeSymbolStore(
        new Map([['firefox', symbolTable], ['firefox-webcontent', symbolTable]])
      );
      symbolicatedProfile = Object.assign({}, unsymbolicatedProfile, {
        threads: unsymbolicatedProfile.threads.slice(),
      });
      const symbolicationPromise = symbolicateProfile(
        unsymbolicatedProfile,
        symbolStore,
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

describe('filter-by-implementation', function() {
  const profile = processProfile(createGeckoProfileWithJsTimings());
  const defaultCategory = profile.meta.categories.findIndex(
    c => c.name === 'Other'
  );
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
    expect(
      filterThreadByImplementation(thread, 'combined', defaultCategory)
    ).toEqual(thread);
  });

  it('will return only JS samples if filtering to "js"', function() {
    const jsOnlyThread = filterThreadByImplementation(
      thread,
      'js',
      defaultCategory
    );
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
    const cppOnlyThread = filterThreadByImplementation(
      thread,
      'cpp',
      defaultCategory
    );
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
        .join('  ')
    );
    const defaultCategory = profile.meta.categories.findIndex(
      c => c.name === 'Other'
    );
    const thread = profile.threads[0];
    const { samples } = filterThreadByImplementation(
      thread,
      'js',
      defaultCategory
    );

    const interval = profile.meta.interval;
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
    const {
      threads: [thread],
    } = getCallNodeProfile();
    const stack1 = thread.samples.stack[0];
    const stack2 = thread.samples.stack[1];
    if (stack1 === null || stack2 === null) {
      // Makes flow happy
      throw new Error("stack shouldn't be null");
    }
    let callNodePath = convertStackToCallNodePath(thread, stack1);
    expect(callNodePath).toEqual([0, 1, 2, 3, 4]);
    callNodePath = convertStackToCallNodePath(thread, stack2);
    expect(callNodePath).toEqual([0, 1, 2, 3, 5]);
  });
});

// Creates a BreakdownByCategory for the case where every category has just one
// subcategory (the "Other" subcategory), so that it's easier to write the
// reference structures.
function withSingleSubcategory(
  categoryBreakdown: Milliseconds[]
): BreakdownByCategory {
  return categoryBreakdown.map(value => ({
    entireCategoryValue: value,
    subcategoryBreakdown: [value],
  }));
}

describe('getTimingsForPath in a non-inverted tree', function() {
  function setup() {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A                  A             A             A              A
      B                  B             B             B              B
      Cjs                Cjs           Cjs           H[cat:Layout]  H[cat:Layout]
      D                  D             F             I[cat:Idle]
      Ejs[jit:baseline]  Ejs[jit:ion]  Ejs[jit:ion]
    `);

    const defaultCategory = profile.meta.categories.findIndex(
      c => c.name === 'Other'
    );
    const thread = profile.threads[0];
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );
    const curriedGetTimingsForPath = path =>
      getTimingsForPath(
        path,
        callNodeInfo,
        profile.meta.interval,
        false,
        thread,
        profile.meta.categories
      );

    return {
      getTimingsForPath: curriedGetTimingsForPath,
      funcNamesDict: funcNamesDictPerThread[0],
    };
  }

  it('returns good timings for a root node', () => {
    const {
      getTimingsForPath,
      funcNamesDict: { A },
    } = setup();

    // This is a root node: it should have no self time but all the total time.
    const timings = getTimingsForPath([A]);
    expect(timings).toEqual({
      forPath: {
        selfTime: {
          value: 0,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 5,
          breakdownByImplementation: { native: 2, baseline: 1, ion: 2 },
          breakdownByCategory: withSingleSubcategory([1, 0, 1, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
      },
      forFunc: {
        selfTime: {
          value: 0,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 5,
          breakdownByImplementation: { native: 2, baseline: 1, ion: 2 },
          breakdownByCategory: withSingleSubcategory([1, 0, 1, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript ...]
        },
      },
      rootTime: 5,
    });
  });

  it('returns good timings for a leaf node, also present in other stacks', () => {
    const {
      getTimingsForPath,
      funcNamesDict: { A, B, Cjs, D, Ejs },
    } = setup();

    // This is a leaf node: it should have some self time and some total time
    // holding the same value.
    //
    // This is also a JS node so it should have some js engine implementation
    // implementations.
    //
    // The same func is also present in 2 different stacks so it should have
    // different timings for the `forFunc` property.
    const timings = getTimingsForPath([A, B, Cjs, D, Ejs]);
    expect(timings).toEqual({
      forPath: {
        selfTime: {
          value: 2,
          breakdownByImplementation: { ion: 1, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 0, 2, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
        totalTime: {
          value: 2,
          breakdownByImplementation: { ion: 1, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 0, 2, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
      },
      forFunc: {
        selfTime: {
          value: 3,
          breakdownByImplementation: { ion: 2, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 0, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
        totalTime: {
          value: 3,
          breakdownByImplementation: { ion: 2, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 0, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
      },
      rootTime: 5,
    });
  });

  it('returns good timings for a node that has both children and self time', () => {
    const {
      getTimingsForPath,
      funcNamesDict: { A, B, H },
    } = setup();

    // This is a node that has both children and some self time. So it should
    // have some running time that's different than the self time.
    const timings = getTimingsForPath([A, B, H]);
    expect(timings).toEqual({
      forPath: {
        selfTime: {
          value: 1,
          breakdownByImplementation: { native: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript ...]
        },
        totalTime: {
          value: 2,
          breakdownByImplementation: { native: 2 },

          breakdownByCategory: withSingleSubcategory([1, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript ...]
        },
      },
      forFunc: {
        selfTime: {
          value: 1,
          breakdownByImplementation: { native: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript ...]
        },
        totalTime: {
          value: 2,
          breakdownByImplementation: { native: 2 },
          breakdownByCategory: withSingleSubcategory([1, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript ...]
        },
      },
      rootTime: 5,
    });
  });
});

describe('getTimingsForPath for an inverted tree', function() {
  function setup() {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A                  A             A             A              A
      B                  B             B             B              B
      Cjs                Cjs           Cjs           H[cat:Layout]  H[cat:Layout]
      D                  D             F             I[cat:Idle]
      Ejs[jit:baseline]  Ejs[jit:ion]  Ejs[jit:ion]
    `);
    const defaultCategory = profile.meta.categories.findIndex(
      c => c.name === 'Other'
    );
    const thread = invertCallstack(profile.threads[0], defaultCategory);
    // Now the profile should look like this:
    //
    // Ejs  Ejs  Ejs  I[cat:Idle]    H[cat:Layout]
    // D    D    F    H[cat:Layout]  B
    // Cjs  Cjs  Cjs  B              A
    // B    B    B    A
    // A    A    A

    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );
    const curriedGetTimingsForPath = path =>
      getTimingsForPath(
        path,
        callNodeInfo,
        profile.meta.interval,
        true,
        thread,
        profile.meta.categories
      );

    return {
      getTimingsForPath: curriedGetTimingsForPath,
      funcNamesDict: funcNamesDictPerThread[0],
    };
  }

  it('returns good timings for a root node', () => {
    const {
      getTimingsForPath,
      funcNamesDict: { Ejs },
    } = setup();
    const timings = getTimingsForPath([Ejs]);
    expect(timings).toEqual({
      forPath: {
        selfTime: {
          value: 3,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 3,
          breakdownByImplementation: { ion: 2, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 0, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
      },
      forFunc: {
        selfTime: {
          value: 3,
          breakdownByImplementation: { ion: 2, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 0, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
        totalTime: {
          value: 3,
          breakdownByImplementation: { ion: 2, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 0, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
      },
      rootTime: 5,
    });
  });

  it('returns good timings for a node present in several stacks without self time', () => {
    const {
      getTimingsForPath,
      funcNamesDict: { Ejs, D, Cjs, B },
    } = setup();
    const timings = getTimingsForPath([Ejs, D, Cjs, B]);
    expect(timings).toEqual({
      forPath: {
        selfTime: {
          value: 0,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 2,
          breakdownByImplementation: { ion: 1, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 0, 2, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
      },
      forFunc: {
        selfTime: {
          value: 0,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 5,
          breakdownByImplementation: {
            ion: 2,
            baseline: 1,
            native: 2,
          },
          breakdownByCategory: withSingleSubcategory([1, 0, 1, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript, ...]
        },
      },
      rootTime: 5,
    });
  });

  it('returns good timings for a node present in several stacks with self time', () => {
    const {
      getTimingsForPath,
      funcNamesDict: { I, H },
    } = setup();

    // Select the function as a root node
    let timings = getTimingsForPath([H]);
    expect(timings).toEqual({
      forPath: {
        selfTime: {
          value: 1,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 1,
          breakdownByImplementation: { native: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout]
        },
      },
      forFunc: {
        selfTime: {
          value: 1,
          breakdownByImplementation: { native: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout]
        },
        totalTime: {
          value: 2,
          breakdownByImplementation: { native: 2 },
          breakdownByCategory: withSingleSubcategory([1, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout]
        },
      },
      rootTime: 5,
    });

    // Select the same function, but this time when it's not a root node
    timings = getTimingsForPath([I, H]);
    expect(timings).toEqual({
      forPath: {
        selfTime: {
          value: 0,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 1,
          breakdownByImplementation: { native: 1 },
          breakdownByCategory: withSingleSubcategory([1, 0, 0, 0, 0, 0, 0, 0]), // [Idle]
        },
      },
      forFunc: {
        selfTime: {
          value: 1,
          breakdownByImplementation: { native: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout]
        },
        totalTime: {
          value: 2,
          breakdownByImplementation: { native: 2 },
          breakdownByCategory: withSingleSubcategory([1, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout]
        },
      },
      rootTime: 5,
    });
  });

  it('returns good timings for a leaf node', () => {
    const {
      getTimingsForPath,
      funcNamesDict: { H, B, A },
    } = setup();
    const timings = getTimingsForPath([H, B, A]);
    expect(timings).toEqual({
      forPath: {
        selfTime: {
          value: 0,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 1,
          breakdownByImplementation: { native: 1 },
          breakdownByCategory: withSingleSubcategory([0, 0, 1, 0, 0, 0, 0, 0]), // [Idle, Other, Layout]
        },
      },
      forFunc: {
        selfTime: {
          value: 0,
          breakdownByImplementation: null,
          breakdownByCategory: null,
        },
        totalTime: {
          value: 5,
          breakdownByImplementation: { native: 2, ion: 2, baseline: 1 },
          breakdownByCategory: withSingleSubcategory([1, 0, 1, 3, 0, 0, 0, 0]), // [Idle, Other, Layout, JavaScript]
        },
      },
      rootTime: 5,
    });
  });
});

describe('getTimingsForPath for a diffing track', function() {
  function setup() {
    const { profile, funcNamesDictPerThread } = getMergedProfileFromTextSamples(
      `
      A              A  A
      B              B  C
      D[cat:Layout]  E  F
    `,
      `
      A                  A  A
      B                  B  B
      G[cat:JavaScript]  I  E
    `
    );
    const defaultCategory = profile.meta.categories.findIndex(
      c => c.name === 'Other'
    );
    const thread = profile.threads[2];

    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );
    const curriedGetTimingsForPath = path =>
      getTimingsForPath(
        path,
        callNodeInfo,
        profile.meta.interval,
        false /* inverted tree */,
        thread,
        profile.meta.categories
      );

    return {
      getTimingsForPath: curriedGetTimingsForPath,
      funcNamesDictPerThread,
    };
  }

  it('computes the right breakdowns', () => {
    const {
      getTimingsForPath,
      funcNamesDictPerThread: [{ A }],
    } = setup();
    const timings = getTimingsForPath([A]);
    expect(timings.forPath).toEqual({
      selfTime: {
        breakdownByCategory: null,
        breakdownByImplementation: null,
        value: 0,
      },
      totalTime: {
        breakdownByCategory: withSingleSubcategory([0, 0, -1, 1, 0, 0, 0, 0]), // Idle, Other, Layout, JavaScript, etc.
        breakdownByImplementation: {
          native: 0,
        },
        value: 0,
      },
    });
  });
});

describe('getSamplesSelectedStates', function() {
  const {
    profile,
    funcNamesDictPerThread: [{ A, B, D, E, F }],
  } = getProfileFromTextSamples(`
     A  A  A  A  A
     B  D  B  D  D
     C  E  F  G
  `);
  const thread = profile.threads[0];
  const { callNodeTable, stackIndexToCallNodeIndex } = getCallNodeInfo(
    thread.stackTable,
    thread.frameTable,
    thread.funcTable,
    0
  );
  const sampleCallNodes = getSampleIndexToCallNodeIndex(
    thread.samples.stack,
    stackIndexToCallNodeIndex
  );

  const A_B = getCallNodeIndexFromPath([A, B], callNodeTable);
  const A_B_F = getCallNodeIndexFromPath([A, B, F], callNodeTable);
  const A_D = getCallNodeIndexFromPath([A, D], callNodeTable);
  const A_D_E = getCallNodeIndexFromPath([A, D, E], callNodeTable);

  it('determines the selection status of all the samples', function() {
    expect(
      getSamplesSelectedStates(callNodeTable, sampleCallNodes, A_B)
    ).toEqual([
      'SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
    ]);
    expect(
      getSamplesSelectedStates(callNodeTable, sampleCallNodes, A_D)
    ).toEqual([
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'SELECTED',
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'SELECTED',
      'SELECTED',
    ]);
    expect(
      getSamplesSelectedStates(callNodeTable, sampleCallNodes, A_B_F)
    ).toEqual([
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
    ]);
    expect(
      getSamplesSelectedStates(callNodeTable, sampleCallNodes, A_D_E)
    ).toEqual([
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'SELECTED',
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
      'UNSELECTED_ORDERED_AFTER_SELECTED',
      'UNSELECTED_ORDERED_BEFORE_SELECTED',
    ]);
  });
  it('can sort the samples based on their selection status', function() {
    const comparator = getTreeOrderComparator(callNodeTable, sampleCallNodes);
    const samples = [4, 1, 3, 0, 2]; // some random order
    samples.sort(comparator);
    expect(samples).toEqual([0, 2, 4, 1, 3]);
    expect(comparator(0, 0)).toBe(0);
    expect(comparator(1, 1)).toBe(0);
    expect(comparator(4, 4)).toBe(0);
    expect(comparator(0, 2)).toBeLessThan(0);
    expect(comparator(2, 0)).toBeGreaterThan(0);
  });
});
