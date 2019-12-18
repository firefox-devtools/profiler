/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import exampleSymbolTable from '../fixtures/example-symbol-table';
import { SymbolStore } from '../../profile-logic/symbol-store.js';
import * as selectors from 'selectors';
import { resourceTypes } from '../../profile-logic/data-structures';
import { doSymbolicateProfile } from '../../actions/receive-profile';
import {
  changeSelectedCallNode,
  changeExpandedCallNodes,
} from '../../actions/profile-view';
import { formatTree } from '../fixtures/utils';
import { assertSetContainsOnly } from '../fixtures/custom-assertions';

import fakeIndexedDB from 'fake-indexeddb';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { TextDecoder } from 'util';
import { SymbolsNotFoundError } from '../../profile-logic/errors';

/**
 * Symbolication happens across actions and reducers, so test this functionality in
 * its own file.
 */
describe('doSymbolicateProfile', function() {
  const symbolStoreName = 'test-db';
  beforeAll(function() {
    window.indexedDB = fakeIndexedDB;
    window.IDBKeyRange = FDBKeyRange;
    window.TextDecoder = TextDecoder;
  });

  afterAll(async function() {
    delete window.indexedDB;
    delete window.IDBKeyRange;
    delete window.TextDecoder;
    await _deleteDatabase(`${symbolStoreName}-symbol-tables`);
  });

  // Initialize a store, an unsymbolicated profile, and helper functions.
  function init() {
    // The rejection in `requestSymbolsFromServer` outputs an error log, let's
    // silence it here. The fact that we call it is tested in
    // symbol-store.test.js.
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const profile = _createUnsymbolicatedProfile();
    const store = storeWithProfile(profile);

    return {
      profile,
      store,
      // Provide an easy way to turn func names to current func indexes.
      funcNamesToFuncIndexes: (names: string[]) =>
        names.map(name => {
          // Get the current thread in the store every time this is called, so it
          // is always up to date for the latest store changes. This is a convenience
          // to make the tests easier to read.
          const thread = getThread(store.getState());
          const stringIndex = thread.stringTable.indexForString(name);
          return thread.funcTable.name.indexOf(stringIndex);
        }),
      symbolStore: new SymbolStore(symbolStoreName, {
        requestSymbolsFromServer: requests =>
          requests.map(() => Promise.reject(new Error(''))),
        requestSymbolTableFromAddon: async lib => {
          if (lib.debugName === 'firefox.pdb') {
            return exampleSymbolTable;
          }
          throw new SymbolsNotFoundError(
            'Should only have libs called firefox.pdb',
            lib
          );
        },
      }),
    };
  }

  const {
    getSelectedCallNodePath,
    getExpandedCallNodePaths,
    getThread,
    getCallTree,
  } = selectors.selectedThread;

  describe('doSymbolicateProfile', function() {
    it('can symbolicate a profile', async () => {
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

    it('updates the symbolication status', async () => {
      const {
        store: { dispatch, getState },
        profile,
        symbolStore,
      } = init();
      // Starts out as DONE.
      expect(selectors.getSymbolicationStatus(getState())).toEqual('DONE');
      const symbolication = doSymbolicateProfile(
        dispatch,
        profile,
        symbolStore
      );
      expect(selectors.getSymbolicationStatus(getState())).toEqual(
        'SYMBOLICATING'
      );
      await symbolication;
      expect(selectors.getSymbolicationStatus(getState())).toEqual('DONE');
    });
  });

  describe('merging of functions with different memory addresses, but in the same function', () => {
    it('starts with expanded call nodes of multiple memory addresses', async function() {
      // Don't use the mocks on this test, as no SymbolStore database is needed.
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

    it('symbolicates and merges functions in the stored call node paths', async function() {
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
  const thread = profile.threads[0];

  // Add a mock lib.
  const libIndex = 0;
  thread.libs[libIndex] = {
    start: 0,
    end: 0x4000,
    offset: 0,
    arch: '',
    name: 'firefox.exe',
    path: '',
    debugName: 'firefox.pdb',
    debugPath: '',
    breakpadId: '000000000000000000000000000000000',
  };

  thread.resourceTable = {
    length: 1,
    lib: [libIndex],
    name: [thread.stringTable.indexForString('example lib')],
    host: [thread.stringTable.indexForString('example host')],
    type: [resourceTypes.library],
  };
  for (let i = 0; i < thread.funcTable.length; i++) {
    thread.funcTable.resource[i] = 0;
  }
  return profile;
}

function _deleteDatabase(dbName: string) {
  return new Promise((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
