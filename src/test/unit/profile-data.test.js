/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
  getFuncStackInfo,
  getTracingMarkers,
  filterThreadByImplementation,
} from '../../profile-logic/profile-data';
import exampleProfile from '.././fixtures/profiles/example-profile';
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
} from '../../profile-logic/processed-profile-versioning';
import {
  upgradeGeckoProfileToCurrentVersion,
  CURRENT_VERSION,
} from '../../profile-logic/gecko-profile-versioning';
import {
  getCategoryByImplementation,
  implementationCategoryMap,
} from '../../profile-logic/color-categories';

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
    const profile = processProfile(exampleProfile);
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
      expect(profile.threads[2].samples.time[0]).toEqual(1000);
      expect(profile.threads[2].samples.time[1]).toEqual(1001);
      expect(profile.threads[0].markers.time[0]).toEqual(0);
      expect(profile.threads[0].markers.time[1]).toEqual(2);
      expect(profile.threads[0].markers.time[2]).toEqual(4);
      expect(profile.threads[0].markers.time[3]).toEqual(5);
      expect(profile.threads[0].markers.data[5].startTime).toEqual(9);
      expect(profile.threads[0].markers.data[5].endTime).toEqual(10);
      expect(profile.threads[2].markers.time[0]).toEqual(1000);
      expect(profile.threads[2].markers.time[1]).toEqual(1002);
      expect(profile.threads[2].markers.time[2]).toEqual(1004);
      expect(profile.threads[2].markers.time[3]).toEqual(1005);
      expect(profile.threads[2].markers.data[5].startTime).toEqual(1009);
      expect(profile.threads[2].markers.data[5].endTime).toEqual(1010);
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
      expect(
        thread.stringTable.getString(thread.funcTable.fileName[4])
      ).toEqual('chrome://blargh');
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
});

describe('profile-data', function() {
  describe('createFuncStackTableAndFixupSamples', function() {
    const profile = processProfile(exampleProfile);
    const thread = profile.threads[0];
    const { funcStackTable } = getFuncStackInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      thread.samples
    );
    it('should create one funcStack per stack', function() {
      expect(thread.stackTable.length).toEqual(5);
      expect(funcStackTable.length).toEqual(5);
      expect('prefix' in funcStackTable).toBeTruthy();
      expect('func' in funcStackTable).toBeTruthy();
      expect(funcStackTable.func[0]).toEqual(0);
      expect(funcStackTable.func[1]).toEqual(1);
      expect(funcStackTable.func[2]).toEqual(2);
      expect(funcStackTable.func[3]).toEqual(3);
    });
  });
  describe('getTracingMarkers', function() {
    const profile = processProfile(exampleProfile);
    const thread = profile.threads[0];
    const tracingMarkers = getTracingMarkers(thread);
    it('should fold the two reflow markers into one tracing marker', function() {
      expect(tracingMarkers.length).toEqual(3);
      expect(tracingMarkers[0].start).toEqual(2);
      expect(tracingMarkers[0].name).toEqual('Reflow');
      expect(tracingMarkers[0].dur).toEqual(6);
      expect(tracingMarkers[0].title).toEqual('Reflow for 6.00ms');
    });
    it('should fold the two Rasterize markers into one tracing marker, after the reflow tracing marker', function() {
      expect(tracingMarkers.length).toEqual(3);
      expect(tracingMarkers[1].start).toEqual(4);
      expect(tracingMarkers[1].name).toEqual('Rasterize');
      expect(tracingMarkers[1].dur).toEqual(1);
      expect(tracingMarkers[1].title).toEqual('Rasterize for 1.00ms');
    });
    it('should create a tracing marker for the MinorGC startTime/endTime marker', function() {
      expect(tracingMarkers.length).toEqual(3);
      expect(tracingMarkers[2].start).toEqual(11);
      expect(tracingMarkers[2].name).toEqual('MinorGC');
      expect(tracingMarkers[2].dur).toEqual(1);
      expect(tracingMarkers[2].title).toEqual('MinorGC for 1.00ms');
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
    ];
    it('should return the first library for addresses inside the first library', function() {
      expect(getContainingLibrary(libs, 0).name).toEqual('first');
      expect(getContainingLibrary(libs, 10).name).toEqual('first');
      expect(getContainingLibrary(libs, 19).name).toEqual('first');
    });
    it('should return the second library for addresses inside the second library', function() {
      expect(getContainingLibrary(libs, 20).name).toEqual('second');
      expect(getContainingLibrary(libs, 21).name).toEqual('second');
      expect(getContainingLibrary(libs, 27).name).toEqual('second');
      expect(getContainingLibrary(libs, 39).name).toEqual('second');
    });
    it('should return the third library for addresses inside the third library', function() {
      expect(getContainingLibrary(libs, 40).name).toEqual('third');
      expect(getContainingLibrary(libs, 41).name).toEqual('third');
      expect(getContainingLibrary(libs, 47).name).toEqual('third');
      expect(getContainingLibrary(libs, 49).name).toEqual('third');
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
      unsymbolicatedProfile = processProfile(exampleProfile);
      const symbolTable = {
        0: 'first symbol',
        0xf00: 'second symbol',
        0x1a00: 'third symbol',
        0x2000: 'last symbol',
      };
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
            symbolicatedProfile.threads[threadIndex] = applyFunctionMerging(
              symbolicatedProfile.threads[threadIndex],
              oldFuncToNewFuncMap
            );
          },
          onGotFuncNames: (threadIndex, funcIndices, funcNames) => {
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
      expect(
        functionNameForFrameInThread(unsymbolicatedProfile.threads[0], 1)
      ).toEqual('0x100000f84');
      expect(
        functionNameForFrameInThread(symbolicatedProfile.threads[0], 1)
      ).toEqual('second symbol');
      expect(
        functionNameForFrameInThread(unsymbolicatedProfile.threads[0], 2)
      ).toEqual('0x100001a45');
      expect(
        functionNameForFrameInThread(symbolicatedProfile.threads[0], 2)
      ).toEqual('third symbol');
    });
  });
  // TODO: check that functions are collapsed correctly
});

describe('upgrades', function() {
  describe('old-cleopatra-profile', function() {
    const exampleOldCleopatraProfiles = [
      require('../fixtures/upgrades/old-cleopatra-profile.sps.json'),
      require('../fixtures/upgrades/ancient-cleopatra-profile.sps.json'),
    ];
    exampleOldCleopatraProfiles.forEach(exampleOldCleopatraProfile => {
      it('should detect the profile as an old cleopatra profile', function() {
        expect(isOldCleopatraFormat(exampleOldCleopatraProfile)).toBe(true);
      });
      it('should be able to convert the old cleopatra profile into a processed profile', function() {
        const profile = convertOldCleopatraProfile(exampleOldCleopatraProfile);
        expect(isProcessedProfile(profile)).toBe(true);
        // For now, just test that upgrading doesn't throw any exceptions.
        upgradeProcessedProfileToCurrentVersion(profile);
        expect(profile.threads.length).toBeGreaterThanOrEqual(1);
        expect(profile.threads[0].name).toBe('GeckoMain');
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
    require('../fixtures/upgrades/processed-5.json')
  );

  // Uncomment this to output your next ./upgrades/processed-X.json
  // console.log(serializeProfile(afterUpgradeReference));

  it('should import an old profile and upgrade it to be the same as the reference processed profile', function() {
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

    const geckoProfile3 = require('../fixtures/upgrades/gecko-3.json');
    const upgradedGeckoProfile3 = unserializeProfileOfArbitraryFormat(
      geckoProfile3
    );
    compareProcessedProfiles(upgradedGeckoProfile3, afterUpgradeReference);

    // const serializedOldProcessedProfile2 = require('../fixtures/upgrades/processed-2.json');
    // const upgradedProfile2 = unserializeProfileOfArbitraryFormat(serializedOldProcessedProfile2);
    // compareProcessedProfiles(upgradedProfile2, afterUpgradeReference);

    // const geckoProfile4 = require('../fixtures/upgrades/gecko-4.json');
    // const upgradedGeckoProfile4 = unserializeProfileOfArbitraryFormat(geckoProfile4);
    // compareProcessedProfiles(upgradedGeckoProfile4, afterUpgradeReference);
  });
  it('should import an old Gecko profile and upgrade it to be the same as the newest Gecko profile', function() {
    const afterUpgradeGeckoReference = require('../fixtures/upgrades/gecko-6.json');
    // Uncomment this to output your next ./upgrades/gecko-X.json
    // upgradeGeckoProfileToCurrentVersion(afterUpgradeGeckoReference);
    // console.log(JSON.stringify(afterUpgradeGeckoReference));
    expect(afterUpgradeGeckoReference.meta.version).toEqual(CURRENT_VERSION);

    const geckoProfile3 = require('../fixtures/upgrades/gecko-3.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile3);
    expect(geckoProfile3).toEqual(afterUpgradeGeckoReference);

    const geckoProfile4 = require('../fixtures/upgrades/gecko-4.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile4);
    expect(geckoProfile4).toEqual(afterUpgradeGeckoReference);

    const geckoProfile5 = require('../fixtures/upgrades/gecko-5.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile5);
    expect(geckoProfile5).toEqual(afterUpgradeGeckoReference);
  });
});

describe('color-categories', function() {
  const profile = processProfile(exampleProfile);
  const [thread] = profile.threads;
  it('calculates the category for each frame', function() {
    const categories = thread.samples.stack.map(stackIndex => {
      return getCategoryByImplementation(
        thread,
        thread.stackTable.frame[stackIndex]
      );
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
  const profile = processProfile(profileWithJS);
  const thread = profile.threads[0];

  function stackIsJS(filteredThread, stackIndex) {
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
