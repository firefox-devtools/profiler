/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  completeSymbolTable,
  partialSymbolTable,
} from '../fixtures/example-symbol-table';
import type { ExampleSymbolTable } from '../fixtures/example-symbol-table';
import type { MarkerPayload } from 'firefox-profiler/types';
import type {
  AddressResult,
  LibSymbolicationRequest,
  LibSymbolicationResponse,
  SymbolProvider,
} from '../../profile-logic/symbol-store';
import {
  readSymbolsFromSymbolTable,
  SymbolStore,
} from '../../profile-logic/symbol-store';
import * as ProfileViewSelectors from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { INTERVAL } from 'firefox-profiler/app-logic/constants';
import {
  resourceTypes,
  getEmptyRawMarkerTable,
} from '../../profile-logic/data-structures';
import { doSymbolicateProfile } from '../../actions/receive-profile';
import {
  changeSelectedCallNode,
  changeExpandedCallNodes,
} from '../../actions/profile-view';
import { formatTree, formatStack } from '../fixtures/utils';
import { assertSetContainsOnly } from '../fixtures/custom-assertions';
import { StringTable } from '../../utils/string-table';
import { ensureExists } from 'firefox-profiler/utils/types';

import { stripIndent } from 'common-tags';
import { SymbolsNotFoundError } from '../../profile-logic/errors';

/**
 * Symbolication happens across actions and reducers, so test this functionality in
 * its own file.
 */
describe('doSymbolicateProfile', function () {
  // Initialize a store, an unsymbolicated profile, and helper functions.
  function init() {
    // The rejection in `requestSymbolsFromServer` outputs an error log, let's
    // silence it here. The fact that we call it is tested in
    // symbol-store.test.js.
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const profile = _createUnsymbolicatedProfile();
    const store = storeWithProfile(profile);

    let symbolTable = completeSymbolTable;
    function switchSymbolTable(otherSymbolTable: ExampleSymbolTable) {
      symbolTable = otherSymbolTable;
    }
    let symbolicationProviderMode: 'from-server' | 'from-browser' =
      'from-browser';
    function switchSymbolProviderMode(newMode: 'from-server' | 'from-browser') {
      symbolicationProviderMode = newMode;
    }

    const symbolProvider: SymbolProvider = {
      requestSymbolsFromServer: async (requests: LibSymbolicationRequest[]) =>
        requests.map<LibSymbolicationResponse>((request) => {
          const { lib, addresses } = request;
          if (lib.debugName !== 'firefox.pdb') {
            return {
              type: 'ERROR' as const,
              request,
              error: new SymbolsNotFoundError(
                'Should only have lib called firefox.pdb',
                lib
              ),
            };
          }

          if (symbolicationProviderMode !== 'from-server') {
            return {
              type: 'ERROR' as const,
              request,
              error: new SymbolsNotFoundError(
                'Not in from-server mode, try requestSymbolsViaSymbolTableFromBrowser.',
                lib
              ),
            };
          }

          const map = new Map<number, AddressResult>();
          for (const address of addresses) {
            const addressResult = symbolTable.getAddressResult(address);
            if (addressResult !== null) {
              map.set(address, addressResult);
            }
          }
          return { type: 'SUCCESS', lib, results: map };
        }),

      requestSymbolsFromBrowser: async (
        _requests: LibSymbolicationRequest[]
      ) => {
        throw new Error('requestSymbolsFromBrowser unsupported in this test');
      },

      requestSymbolsViaSymbolTableFromBrowser: async (
        request: LibSymbolicationRequest,
        _ignoreCache: boolean
      ) => {
        const { lib, addresses } = request;
        if (lib.debugName !== 'firefox.pdb') {
          throw new SymbolsNotFoundError(
            'Should only have libs called firefox.pdb',
            lib
          );
        }
        if (symbolicationProviderMode !== 'from-browser') {
          throw new Error(
            'should not call requestSymbolsViaSymbolTableFromBrowser if requestSymbolsFromServer is successful'
          );
        }
        return readSymbolsFromSymbolTable(
          addresses,
          symbolTable.asTuple,
          (s: string) => s
        );
      },
    };

    return {
      profile,
      store,
      // Provide an easy way to turn func names to current func indexes.
      funcNamesToFuncIndexes: (names: string[]) =>
        names.map((name) => {
          // Get the current thread in the store every time this is called, so it
          // is always up to date for the latest store changes. This is a convenience
          // to make the tests easier to read.
          const thread = getThread(store.getState());
          const stringIndex = thread.stringTable.indexForString(name);
          return thread.funcTable.name.indexOf(stringIndex);
        }),
      switchSymbolTable,
      switchSymbolProviderMode,
      symbolStore: new SymbolStore(symbolProvider),
    };
  }

  const {
    getSelectedCallNodePath,
    getExpandedCallNodePaths,
    getThread,
    getCallTree,
  } = selectedThreadSelectors;

  describe('doSymbolicateProfile', function () {
    it('can symbolicate a profile when symbols come from-browser', async () => {
      const {
        store: { dispatch, getState },
        profile,
        symbolStore,
      } = init();

      expect(formatTree(getCallTree(getState()))).toEqual([
        '- 0x000a (total: 1, self: —)',
        '  - 0x2000 (total: 1, self: 1)',
        '- 0x0000 (total: 1, self: —)',
        '  - 0x2000 (total: 1, self: 1)',
        '- 0x1a0f (total: 1, self: 1)',
        '- 0x0f0f (total: 1, self: 1)',
      ]);

      await doSymbolicateProfile(dispatch, profile, symbolStore);
      expect(formatTree(getCallTree(getState()))).toEqual([
        // 0x0000 and 0x000a get merged together.
        '- first symbol (total: 2, self: —)',
        '  - last symbol (total: 2, self: 2)',
        '- third symbol (total: 1, self: 1)',
        '- second symbol (total: 1, self: 1)',
      ]);
    });

    it('does different merging depending on available symbols', async () => {
      const {
        store: { dispatch, getState },
        profile,
        symbolStore,
        switchSymbolTable,
      } = init();

      await doSymbolicateProfile(dispatch, profile, symbolStore);
      expect(formatTree(getCallTree(getState()))).toEqual([
        // 0x0000 and 0x000a get merged together.
        '- first symbol (total: 2, self: —)',
        '  - last symbol (total: 2, self: 2)',
        '- third symbol (total: 1, self: 1)',
        '- second symbol (total: 1, self: 1)',
      ]);

      // Now re-symbolicate with the partial symbol table.
      switchSymbolTable(partialSymbolTable);
      await doSymbolicateProfile(
        dispatch,
        profile,
        symbolStore,
        /* ignoreCache */ true
      );
      expect(formatTree(getCallTree(getState()))).toEqual([
        '- overencompassing first symbol (total: 4, self: 2)',
        '  - last symbol (total: 2, self: 2)',
      ]);
    });

    it('can symbolicate a profile when symbols come from-server', async () => {
      const {
        store: { dispatch, getState },
        profile,
        symbolStore,
        switchSymbolProviderMode,
        funcNamesToFuncIndexes,
      } = init();
      expect(formatTree(getCallTree(getState()))).toEqual([
        '- 0x000a (total: 1, self: —)',
        '  - 0x2000 (total: 1, self: 1)',
        '- 0x0000 (total: 1, self: —)',
        '  - 0x2000 (total: 1, self: 1)',
        '- 0x1a0f (total: 1, self: 1)',
        '- 0x0f0f (total: 1, self: 1)',
      ]);

      switchSymbolProviderMode('from-server');

      await doSymbolicateProfile(dispatch, profile, symbolStore);
      expect(formatTree(getCallTree(getState()))).toEqual([
        // 0x0000 and 0x000a get merged together.
        '- first symbol (total: 2, self: —)',
        '  - second symbol (total: 1, self: —)',
        '    - last symbol (total: 1, self: 1)',
        '  - last symbol (total: 1, self: 1)',
        '- third symbol (total: 1, self: 1)',
        '- second symbol (total: 1, self: 1)',
      ]);

      const thread = getThread(getState());
      const { frameTable, funcTable, stringTable } = thread;
      const sources = ProfileViewSelectors.getSourceTable(getState());
      expect(funcTable.length).toBeGreaterThanOrEqual(4);

      // Helper function to get filename from source index
      const getFileName = (funcIndex: number): string | null => {
        const sourceIndex = funcTable.source[funcIndex];
        if (sourceIndex === null) return null;
        const urlIndex = sources.filename[sourceIndex];
        return stringTable.getString(urlIndex);
      };

      const [
        firstSymbolFuncIndex,
        secondSymbolFuncIndex,
        thirdSymbolFuncIndex,
        lastSymbolFuncIndex,
      ] = funcNamesToFuncIndexes([
        'first symbol',
        'second symbol',
        'third symbol',
        'last symbol',
      ]);

      // Check that the first sample's stack (0x000a -> 0x2000) has been symbolicated
      // correctly. The 0x000a frame expands to two frames: there is an "inlined call"
      // from "first symbol" to "second symbol" at this address. 0x2000 symbolicates to
      // just one frame ("last symbol"). We also check that the frame line numbers
      // are correct.
      expect(formatStack(thread, ensureExists(thread.samples.stack[0])))
        .toBe(stripIndent`
          first symbol (first_and_last.cpp:14)
          second symbol (second_and_third.rs:37)
          last symbol (first_and_last.cpp)`);

      // Do the same check for the marker stack. We only have one marker, and its stack
      // is the same as the stack of the first sample (see _createUnsymbolicatedProfile).
      // We're doing this check in a test which adds inlined frames during symbolication,
      // because with inlining we know that symbolication has to create a new stack
      // table, and so stack indexes have to be updated.
      const firstMarkerData = ensureExists(thread.markers.data[0]);
      expect(firstMarkerData.type).toBe('Text');
      const firstMarkerCause = ensureExists((firstMarkerData as any).cause);
      expect(formatStack(thread, firstMarkerCause.stack)).toBe(stripIndent`
        first symbol (first_and_last.cpp:14)
        second symbol (second_and_third.rs:37)
        last symbol (first_and_last.cpp)`);

      // The first and last symbol function should have the filename first_and_last.cpp.
      expect(getFileName(firstSymbolFuncIndex)).toBe(
        getFileName(lastSymbolFuncIndex)
      );
      let fileName = getFileName(firstSymbolFuncIndex);
      expect(fileName).not.toBeNull();
      expect(fileName).toBe('first_and_last.cpp');

      // The second and third symbol function should have the filename second_and_third.rs.
      expect(getFileName(secondSymbolFuncIndex)).toBe(
        getFileName(thirdSymbolFuncIndex)
      );
      fileName = getFileName(secondSymbolFuncIndex);
      expect(fileName).not.toBeNull();
      expect(fileName).toBe('second_and_third.rs');

      // Check line numbers.

      // First, find the frame for 0x0000, and make sure there's only one.
      const frameAt0x0000 = frameTable.address.indexOf(0x0000);
      expect(frameAt0x0000).not.toBe(-1);
      expect(frameTable.address.indexOf(0x0000, frameAt0x0000 + 1)).toBe(-1);
      // 0x0000 should be at line 12.
      expect(frameTable.line[frameAt0x0000]).toBe(12);

      // Now, find the frames for 0x000a.
      // There should be two: One with inline depth 0, and one with inline depth 1.
      const firstFrameAt0x000a = frameTable.address.indexOf(0x000a);
      expect(firstFrameAt0x000a).not.toBe(-1);
      const secondFrameAt0x000a = frameTable.address.indexOf(
        0x000a,
        firstFrameAt0x000a + 1
      );
      expect(secondFrameAt0x000a).not.toBe(-1);
      const thirdFrameAt0x000a = frameTable.address.indexOf(
        0x000a,
        secondFrameAt0x000a + 1
      );
      // There should be no third frame for 0x000a.
      expect(thirdFrameAt0x000a).toBe(-1);

      // 0x000a at inline depth 0 should be at line 14, in the first symbol.
      expect(frameTable.line[firstFrameAt0x000a]).toBe(14);
      expect(frameTable.inlineDepth[firstFrameAt0x000a]).toBe(0);
      expect(frameTable.func[firstFrameAt0x000a]).toBe(firstSymbolFuncIndex);

      // 0x000a at inline depth 1 should be at line 37, in the second symbol.
      expect(frameTable.line[secondFrameAt0x000a]).toBe(37);
      expect(frameTable.inlineDepth[secondFrameAt0x000a]).toBe(1);
      expect(frameTable.func[secondFrameAt0x000a]).toBe(secondSymbolFuncIndex);
    });

    it('updates the symbolication status', async () => {
      const {
        store: { dispatch, getState },
        profile,
        symbolStore,
      } = init();
      // Starts out as DONE.
      expect(ProfileViewSelectors.getSymbolicationStatus(getState())).toEqual(
        'DONE'
      );
      const symbolication = doSymbolicateProfile(
        dispatch,
        profile,
        symbolStore
      );
      expect(ProfileViewSelectors.getSymbolicationStatus(getState())).toEqual(
        'SYMBOLICATING'
      );
      await symbolication;
      expect(ProfileViewSelectors.getSymbolicationStatus(getState())).toEqual(
        'DONE'
      );
    });
  });

  describe('merging of functions with different memory addresses, but in the same function', () => {
    it('starts with expanded call nodes of multiple memory addresses', async function () {
      const {
        store: { dispatch, getState },
        funcNamesToFuncIndexes,
      } = init();

      const threadIndex = 0;
      const selectedCallNodePath = funcNamesToFuncIndexes(['0x000a', '0x2000']);
      // Both of these expanded nodes are actually in the same function, but
      // they are different memory addresses.
      const expandedCallNodePaths = [['0x000a'], ['0x0000']].map(
        funcNamesToFuncIndexes
      );

      dispatch(changeSelectedCallNode(threadIndex, selectedCallNodePath));
      dispatch(changeExpandedCallNodes(threadIndex, expandedCallNodePaths));

      expect(getSelectedCallNodePath(getState())).toEqual(selectedCallNodePath);
      assertSetContainsOnly(
        getExpandedCallNodePaths(getState()),
        expandedCallNodePaths
      );
    });

    it('symbolicates and merges functions in the stored call node paths', async function () {
      const {
        store: { dispatch, getState },
        profile,
        symbolStore,
        funcNamesToFuncIndexes,
      } = init();

      const threadIndex = 0;
      const selectedCallNodePath = funcNamesToFuncIndexes(['0x000a', '0x2000']);
      const expandedCallNodePaths = [['0x000a'], ['0x0000']].map(
        funcNamesToFuncIndexes
      );

      dispatch(changeSelectedCallNode(threadIndex, selectedCallNodePath));
      // Both of these expanded nodes are actually in the same function, but
      // they are different memory addresses. See exampleSymbolTable and
      // _createUnsymbolicatedProfile().
      dispatch(changeExpandedCallNodes(threadIndex, expandedCallNodePaths));
      expect(getSelectedCallNodePath(getState())).toEqual(selectedCallNodePath);
      assertSetContainsOnly(
        getExpandedCallNodePaths(getState()),
        expandedCallNodePaths
      );

      await doSymbolicateProfile(dispatch, profile, symbolStore);
      expect(getSelectedCallNodePath(getState())).toEqual(
        // The CallNodePath is now symbolicated.
        funcNamesToFuncIndexes(['first symbol', 'last symbol'])
      );

      assertSetContainsOnly(
        getExpandedCallNodePaths(getState()),
        [['first symbol']].map(funcNamesToFuncIndexes)
      );
    });
  });

  it('can symbolicate a profile with a partial symbol table and re-symbolicate it with a complete symbol table', async () => {
    const {
      store: { dispatch, getState },
      symbolStore,
      switchSymbolTable,
      switchSymbolProviderMode,
    } = init();

    let profile = ProfileViewSelectors.getProfile(getState());

    switchSymbolProviderMode('from-server');
    switchSymbolTable(partialSymbolTable);

    expect(formatTree(getCallTree(getState()))).toEqual([
      '- 0x000a (total: 1, self: —)',
      '  - 0x2000 (total: 1, self: 1)',
      '- 0x0000 (total: 1, self: —)',
      '  - 0x2000 (total: 1, self: 1)',
      '- 0x1a0f (total: 1, self: 1)',
      '- 0x0f0f (total: 1, self: 1)',
    ]);

    await doSymbolicateProfile(dispatch, profile, symbolStore);
    profile = ProfileViewSelectors.getProfile(getState());

    expect(formatTree(getCallTree(getState()))).toEqual([
      // 0x0000, 0x000a, 0x0f0f and 0x1a0f get merged together.
      '- overencompassing first symbol (total: 4, self: 2)',
      '  - last symbol (total: 2, self: 2)',
    ]);

    switchSymbolTable(completeSymbolTable);

    await doSymbolicateProfile(dispatch, profile, symbolStore);
    expect(formatTree(getCallTree(getState()))).toEqual([
      // "overencompassing first symbol" gets split into "first symbol",
      // "second symbol" and "third symbol".
      '- first symbol (total: 2, self: —)',
      '  - second symbol (total: 1, self: —)',
      '    - last symbol (total: 1, self: 1)',
      '  - last symbol (total: 1, self: 1)',
      '- third symbol (total: 1, self: 1)',
      '- second symbol (total: 1, self: 1)',
    ]);
  });

  it('can re-symbolicate a partially-symbolicated profile even if it needs to add funcs to the funcTable', async () => {
    const {
      store: { dispatch, getState },
      symbolStore,
      switchSymbolTable,
      switchSymbolProviderMode,
    } = init();

    let profile = ProfileViewSelectors.getProfile(getState());

    switchSymbolProviderMode('from-server');
    switchSymbolTable(partialSymbolTable);

    expect(formatTree(getCallTree(getState()))).toEqual([
      '- 0x000a (total: 1, self: —)',
      '  - 0x2000 (total: 1, self: 1)',
      '- 0x0000 (total: 1, self: —)',
      '  - 0x2000 (total: 1, self: 1)',
      '- 0x1a0f (total: 1, self: 1)',
      '- 0x0f0f (total: 1, self: 1)',
    ]);

    await doSymbolicateProfile(dispatch, profile, symbolStore);
    profile = ProfileViewSelectors.getProfile(getState());

    expect(formatTree(getCallTree(getState()))).toEqual([
      // 0x0000, 0x000a, 0x0f0f and 0x1a0f get merged together.
      '- overencompassing first symbol (total: 4, self: 2)',
      '  - last symbol (total: 2, self: 2)',
    ]);

    const thread = profile.threads[0];
    const { frameTable, funcTable, nativeSymbols } = profile.shared;
    expect(funcTable.length).toBeGreaterThanOrEqual(2);
    expect(nativeSymbols.length).toBeGreaterThanOrEqual(2);

    // Only nativeSymbol 0 and 1 should be in use. These are the funcs for the first and
    // last symbol.
    expect(frameTable.nativeSymbol).toContain(0);
    expect(frameTable.nativeSymbol).toContain(1);
    expect(new Set(frameTable.nativeSymbol).size).toBe(2);
    // The same should be true for the funcs.
    expect(frameTable.func).toContain(0);
    expect(frameTable.func).toContain(1);
    expect(new Set(frameTable.func).size).toBe(2);

    // Now forcefully truncate nativeSymbols and funcTable.
    const newFuncTable = { ...funcTable, length: 2 };
    const newNativeSymbols = { ...nativeSymbols, length: 2 };
    const newThread = {
      ...thread,
      funcTable: newFuncTable,
      nativeSymbols: newNativeSymbols,
    };
    const newProfile = { ...profile, threads: [newThread] };
    dispatch({
      type: 'PROFILE_LOADED',
      profile: newProfile,
      implementationFilter: null,
      pathInZipFile: null,
      transformStacks: null,
    });
    profile = ProfileViewSelectors.getProfile(getState());
    expect(profile).toBe(newProfile);

    switchSymbolTable(completeSymbolTable);

    await doSymbolicateProfile(dispatch, profile, symbolStore);
    profile = ProfileViewSelectors.getProfile(getState());

    expect(formatTree(getCallTree(getState()))).toEqual([
      // "overencompassing first symbol" gets split into "first symbol",
      // "second symbol" and "third symbol".
      '- first symbol (total: 2, self: —)',
      '  - second symbol (total: 1, self: —)',
      '    - last symbol (total: 1, self: 1)',
      '  - last symbol (total: 1, self: 1)',
      '- third symbol (total: 1, self: 1)',
      '- second symbol (total: 1, self: 1)',
    ]);
  });
});

function _createUnsymbolicatedProfile() {
  const { profile } = getProfileFromTextSamples(
    // "0x000a" and "0x0000" are both in the first symbol, and should be merged.
    // See "exampleSymbolTable" for the actual function boundary ranges.
    `
      0x000a  0x0000  0x1a0f  0x0f0f
      0x2000  0x2000
    `
  );
  const { threads, shared } = profile;
  const stringTable = StringTable.withBackingArray(shared.stringArray);
  const thread = threads[0];

  // Add a mock lib.
  const libIndex = 0;
  profile.libs[libIndex] = {
    arch: '',
    name: 'firefox.exe',
    path: '',
    debugName: 'firefox.pdb',
    debugPath: '',
    breakpadId: '000000000000000000000000000000000',
    codeId: null,
  };

  profile.shared.resourceTable = {
    length: 1,
    lib: [libIndex],
    name: [stringTable.indexForString('example lib')],
    host: [stringTable.indexForString('example host')],
    type: [resourceTypes.library],
  };
  for (let i = 0; i < profile.shared.funcTable.length; i++) {
    profile.shared.funcTable.resource[i] = 0;
  }

  // Add a marker with a cause stack. We use the stack of the first sample.
  // This sample has 0x000a in its stack, which has an inlined function call,
  // so we can test that the inlined function call is symbolicated in the marker
  // stack.
  const markerStack = ensureExists(thread.samples.stack[0]);
  const markerData: MarkerPayload = {
    type: 'Text',
    name: 'MarkerWithStack',
    cause: {
      stack: markerStack,
    },
  };

  const markers = getEmptyRawMarkerTable();
  const markerIndex = markers.length++;
  markers.data[markerIndex] = markerData;
  markers.name[markerIndex] = stringTable.indexForString('MarkerWithStack');
  markers.startTime[markerIndex] = 0;
  markers.endTime[markerIndex] = 3;
  markers.phase[markerIndex] = INTERVAL;
  markers.category[markerIndex] = 0;

  thread.markers = markers;

  return profile;
}
