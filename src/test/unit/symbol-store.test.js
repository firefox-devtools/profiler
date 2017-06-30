/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'babel-polyfill';
import { SymbolStore } from '../../profile-logic/symbol-store';
import { TextDecoder } from 'text-encoding';
import exampleSymbolTable from '../fixtures/example-symbol-table';
import fakeIndexedDB from 'fake-indexeddb';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

describe('SymbolStore', function() {
  let symbolProvider, symbolStore;

  function deleteDatabase() {
    return new Promise((resolve, reject) => {
      const req = fakeIndexedDB.deleteDatabase(
        'perf-html-async-storage-symbol-tables'
      );
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  beforeAll(function() {
    window.indexedDB = fakeIndexedDB;
    window.IDBKeyRange = FDBKeyRange;
    window.TextDecoder = TextDecoder;
  });

  afterAll(function() {
    delete window.indexedDB;
    delete window.IDBKeyRange;
    delete window.TextDecoder;

    symbolStore = null;
  });

  beforeEach(function() {
    symbolProvider = {
      requestSymbolTable: jest.fn(() => Promise.resolve(exampleSymbolTable)),
    };
    symbolStore = new SymbolStore('perf-html-async-storage', symbolProvider);
  });

  afterEach(async function() {
    await deleteDatabase();
  });

  it('should only request symbols from the symbol provider once per library', async function() {
    expect(symbolProvider.requestSymbolTable).not.toHaveBeenCalled();

    const lib1 = { debugName: 'firefox', breakpadId: 'dont-care' };
    const addrsForLib1 = await symbolStore.getFuncAddressTableForLib(lib1);
    expect(symbolProvider.requestSymbolTable).toHaveBeenCalledTimes(1);
    expect(Array.from(addrsForLib1)).toEqual([0, 0xf00, 0x1a00, 0x2000]);

    const secondAndThirdSymbol = await symbolStore.getSymbolsForAddressesInLib(
      [1, 2],
      lib1
    );
    expect(symbolProvider.requestSymbolTable).toHaveBeenCalledTimes(1);
    expect(secondAndThirdSymbol).toEqual(['second symbol', 'third symbol']);

    const lib2 = { debugName: 'firefox2', breakpadId: 'dont-care2' };
    const addrsForLib2 = await symbolStore.getFuncAddressTableForLib(lib2);
    expect(symbolProvider.requestSymbolTable).toHaveBeenCalledTimes(2);
    expect(Array.from(addrsForLib2)).toEqual([0, 0xf00, 0x1a00, 0x2000]);

    const firstAndLastSymbol = await symbolStore.getSymbolsForAddressesInLib(
      [0, 3],
      lib2
    );
    expect(symbolProvider.requestSymbolTable).toHaveBeenCalledTimes(2);
    expect(firstAndLastSymbol).toEqual(['first symbol', 'last symbol']);

    const addrsForLib1AfterTheSecondTime = await symbolStore.getFuncAddressTableForLib(
      lib1
    );
    expect(symbolProvider.requestSymbolTable).toHaveBeenCalledTimes(2);
    expect(addrsForLib1).toEqual(addrsForLib1AfterTheSecondTime);
  });

  it('should persist in DB', async function() {
    // Using another symbol store simulates a page reload
    const symbolStore2 = new SymbolStore(
      'perf-html-async-storage',
      symbolProvider
    );

    const lib = { debugName: 'firefox', breakpadId: 'dont-care' };
    const addrsForLib1 = await symbolStore.getFuncAddressTableForLib(lib);
    const addrsForLib2 = await symbolStore2.getFuncAddressTableForLib(lib);

    expect(symbolProvider.requestSymbolTable).toHaveBeenCalledTimes(1);
    expect(addrsForLib2).toEqual(addrsForLib1);
  });
});
