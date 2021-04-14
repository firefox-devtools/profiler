/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { SymbolStore } from '../../profile-logic/symbol-store';
import { SymbolsNotFoundError } from '../../profile-logic/errors';
import { TextDecoder } from 'util';
import exampleSymbolTable from '../fixtures/example-symbol-table';
import fakeIndexedDB from 'fake-indexeddb';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { FakeSymbolStore } from '../fixtures/fake-symbol-store';
import { ensureExists } from '../../utils/flow';

describe('SymbolStore', function() {
  let symbolProvider, symbolStore;

  function deleteDatabase() {
    return new Promise((resolve, reject) => {
      const req = fakeIndexedDB.deleteDatabase(
        'profiler-async-storage-symbol-tables'
      );
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  beforeAll(function() {
    // The SymbolStore requires IndexedDB, otherwise symbolication will be skipped.
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

  afterEach(async function() {
    if (symbolStore) {
      await symbolStore.closeDb().catch(() => {});
    }
    await deleteDatabase();
  });

  it('should only request symbols from the symbol provider once per library', async function() {
    symbolProvider = {
      requestSymbolsFromServer: jest.fn(requests =>
        requests.map(request => {
          expect(request.lib.breakpadId).not.toBe('');
          return Promise.reject(
            new Error('this example only supports symbol tables')
          );
        })
      ),
      requestSymbolTableFromAddon: jest.fn(() =>
        Promise.resolve(exampleSymbolTable)
      ),
    };
    symbolStore = new SymbolStore('profiler-async-storage', symbolProvider);

    expect(symbolProvider.requestSymbolTableFromAddon).not.toHaveBeenCalled();

    const lib1 = { debugName: 'firefox', breakpadId: 'dont-care' };
    let secondAndThirdSymbol = new Map();
    const errorCallback = jest.fn((_request, _error) => {});
    await symbolStore.getSymbols(
      [{ lib: lib1, addresses: new Set([0xf01, 0x1a50]) }],
      (request, results) => {
        secondAndThirdSymbol = results;
      },
      errorCallback
    );
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(1);
    expect(symbolProvider.requestSymbolTableFromAddon).toHaveBeenCalledTimes(1);
    expect(errorCallback).not.toHaveBeenCalled();
    expect(secondAndThirdSymbol.get(0xf01)).toEqual({
      name: 'second symbol',
      functionOffset: 1,
    });
    expect(secondAndThirdSymbol.get(0x1a50)).toEqual({
      name: 'third symbol',
      functionOffset: 0x50,
    });

    const lib2 = { debugName: 'firefox2', breakpadId: 'dont-care2' };
    let firstAndLastSymbol = new Map();
    await symbolStore.getSymbols(
      [{ lib: lib2, addresses: new Set([0x33, 0x2000]) }],
      (request, results) => {
        firstAndLastSymbol = results;
      },
      errorCallback
    );
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(2);
    expect(symbolProvider.requestSymbolTableFromAddon).toHaveBeenCalledTimes(2);
    expect(errorCallback).not.toHaveBeenCalled();
    expect(firstAndLastSymbol.get(0x33)).toEqual({
      name: 'first symbol',
      functionOffset: 0x33,
    });
    expect(firstAndLastSymbol.get(0x2000)).toEqual({
      name: 'last symbol',
      functionOffset: 0,
    });

    const libWithEmptyBreakpadId = {
      debugName: 'dalvik-jit-code-cache',
      breakpadId: '',
    };
    await symbolStore.getSymbols(
      [{ lib: libWithEmptyBreakpadId, addresses: new Set([0x33, 0x2000]) }],
      (_request, _results) => {},
      errorCallback
    );
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(2);
    expect(symbolProvider.requestSymbolTableFromAddon).toHaveBeenCalledTimes(2);

    // Empty breakpadIds should result in an error.
    expect(errorCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        lib: { breakpadId: '', debugName: 'dalvik-jit-code-cache' },
      }),
      expect.objectContaining({
        message: expect.stringContaining('Invalid debugName or breakpadId'),
      })
    );
  });

  it('should persist in DB', async function() {
    symbolProvider = {
      requestSymbolsFromServer: jest.fn(requests =>
        requests.map(() =>
          Promise.reject(new Error('this example only supports symbol tables'))
        )
      ),
      requestSymbolTableFromAddon: jest.fn(() =>
        Promise.resolve(exampleSymbolTable)
      ),
    };
    symbolStore = new SymbolStore('profiler-async-storage', symbolProvider);

    const lib = { debugName: 'firefox', breakpadId: 'dont-care' };
    const errorCallback = jest.fn((_request, _error) => {});
    await symbolStore.getSymbols(
      [{ lib: lib, addresses: new Set([0]) }],
      (_request, _results) => {},
      errorCallback
    );
    expect(errorCallback).not.toHaveBeenCalled();

    // Using another symbol store simulates a page reload
    // Due to https://github.com/dumbmatter/fakeIndexedDB/issues/22 we need to
    // take care to sequence the DB open requests.
    await symbolStore.closeDb().catch(() => {});
    symbolStore = new SymbolStore('profiler-async-storage', symbolProvider);

    await symbolStore.getSymbols(
      [{ lib: lib, addresses: new Set([0x1]) }],
      (_request, _results) => {},
      errorCallback
    );

    expect(symbolProvider.requestSymbolTableFromAddon).toHaveBeenCalledTimes(1);
    expect(errorCallback).not.toHaveBeenCalled();
  });

  it('should call requestSymbolsFromServer first', async function() {
    const symbolTable = new Map([
      [0, 'first symbol'],
      [0xf00, 'second symbol'],
      [0x1a00, 'third symbol'],
      [0x2000, 'last symbol'],
    ]);
    const fakeSymbolStore = new FakeSymbolStore(
      new Map([['available-for-addresses', symbolTable]])
    );

    let symbolsForAddressesRequestCount = 0;

    symbolProvider = {
      requestSymbolsFromServer: jest.fn(requests => {
        symbolsForAddressesRequestCount += requests.length;
        return requests.map(
          request =>
            new Promise((resolve, reject) => {
              fakeSymbolStore.getSymbols(
                [request],
                (_request, results) => resolve(results),
                (_request, error) => reject(error)
              );
            })
        );
      }),
      requestSymbolTableFromAddon: jest
        .fn()
        .mockResolvedValue(exampleSymbolTable),
    };
    symbolStore = new SymbolStore('profiler-async-storage', symbolProvider);

    const lib1 = {
      debugName: 'available-for-addresses',
      breakpadId: 'dont-care',
    };
    const lib2 = {
      debugName: 'available-as-entire-symboltable-only',
      breakpadId: 'dont-care',
    };

    const symbolsPerLibrary = new Map();
    const errorCallback = jest.fn((_request, _error) => {});
    await symbolStore.getSymbols(
      [
        { lib: lib1, addresses: new Set([0xf01, 0x1a50]) },
        { lib: lib2, addresses: new Set([0x33, 0x2000]) },
      ],
      (request, results) => {
        symbolsPerLibrary.set(request.lib, results);
      },
      errorCallback
    );

    // Both requests should have been coalesced into one call to
    // requestSymbolsFromServer.
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(1);
    expect(symbolsForAddressesRequestCount).toEqual(2);
    expect(errorCallback).not.toHaveBeenCalled();

    // requestSymbolsFromServer should have failed for lib2, so
    // requestSymbolTableFromAddon should have been called for it, once.
    expect(symbolProvider.requestSymbolTableFromAddon).toHaveBeenCalledTimes(1);

    const lib1Symbols = ensureExists(symbolsPerLibrary.get(lib1));
    const lib2Symbols = ensureExists(symbolsPerLibrary.get(lib2));
    expect(lib1Symbols.get(0xf01)).toEqual({
      name: 'second symbol',
      functionOffset: 1,
    });
    expect(lib1Symbols.get(0x1a50)).toEqual({
      name: 'third symbol',
      functionOffset: 0x50,
    });
    expect(lib2Symbols.get(0x33)).toEqual({
      name: 'first symbol',
      functionOffset: 0x33,
    });
    expect(lib2Symbols.get(0x2000)).toEqual({
      name: 'last symbol',
      functionOffset: 0,
    });

    // Using another symbol store simulates a page reload
    // Due to https://github.com/dumbmatter/fakeIndexedDB/issues/22 we need to
    // take care to sequence the DB open requests.
    const symbolStore2 = new SymbolStore(
      'profiler-async-storage',
      symbolProvider
    );

    await symbolStore2.getSymbols(
      [
        { lib: lib1, addresses: new Set([0xf01, 0x1a50]) },
        { lib: lib2, addresses: new Set([0x33, 0x2000]) },
      ],
      (_request, _results) => {},
      errorCallback
    );

    // The symbolStore should already have a cached symbol table for lib2 now,
    // so requestSymbolsFromServer should only have been called for one request.
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(2);
    expect(symbolsForAddressesRequestCount).toEqual(3);
    expect(errorCallback).not.toHaveBeenCalled();

    // requestSymbolsFromServer should have succeeded for that one request,
    // so requestSymbolTableFromAddon should not have been called again.
    expect(symbolProvider.requestSymbolTableFromAddon).toHaveBeenCalledTimes(1);
  });

  it('should should report the right errors', async function() {
    const libs = [
      {
        debugName: 'available-from-both-server-and-addon',
        breakpadId: 'dont-care',
      },
      {
        debugName: 'available-from-server',
        breakpadId: 'dont-care',
      },
      {
        debugName: 'available-from-addon',
        breakpadId: 'dont-care',
      },
      {
        debugName: 'available-from-neither',
        breakpadId: 'dont-care',
      },
      {
        debugName: 'empty-breakpadid',
        breakpadId: '',
      },
      {
        debugName: '',
        breakpadId: 'empty-debugname',
      },
    ];

    const symbolTable = new Map([
      [0, 'first symbol'],
      [0xf00, 'second symbol'],
      [0x1a00, 'third symbol'],
      [0x2000, 'last symbol'],
    ]);
    const fakeSymbolStore = new FakeSymbolStore(
      new Map([
        ['available-from-both-server-and-addon', symbolTable],
        ['available-from-server', symbolTable],
      ])
    );
    symbolProvider = {
      requestSymbolsFromServer: requests => {
        return requests.map(request => {
          const { debugName, breakpadId } = request.lib;
          expect(debugName).not.toEqual('');
          expect(breakpadId).not.toEqual('');
          return new Promise((resolve, reject) => {
            fakeSymbolStore.getSymbols(
              [request],
              (_request, results) => resolve(results),
              (_request, error) => reject(error)
            );
          });
        });
      },
      requestSymbolTableFromAddon: async ({ debugName, breakpadId }) => {
        expect(debugName).not.toEqual('');
        expect(breakpadId).not.toEqual('');
        if (
          debugName === 'available-from-addon' ||
          debugName === 'available-from-both-server-and-addon'
        ) {
          return exampleSymbolTable;
        }
        throw new Error('The add-on does not have symbols for this library.');
      },
    };
    symbolStore = new SymbolStore('profiler-async-storage', symbolProvider);

    const addresses = new Set([0xf01, 0x1a50]);
    const succeededLibs = new Set();
    const failedLibs = new Map();
    await symbolStore.getSymbols(
      libs.map(lib => ({ lib, addresses })),
      (request, _results) => {
        succeededLibs.add(request.lib);
      },
      (request, error) => {
        failedLibs.set(request.lib.debugName, error);
      }
    );

    // If symbols are available from at least one source, symbolication for that
    // library should be successful and no error should be returned.
    expect(succeededLibs).toEqual(
      new Set([
        expect.objectContaining({ debugName: 'available-from-addon' }),
        expect.objectContaining({ debugName: 'available-from-server' }),
        expect.objectContaining({
          debugName: 'available-from-both-server-and-addon',
        }),
      ])
    );

    // Empty debugNames or breakpadIds should cause errors. And if symbols are
    // not available from any source, all errors along the way should be included
    // in the reported error.
    expect(failedLibs.size).toBe(3);
    expect(failedLibs.get('empty-breakpadid')).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('Invalid debugName or breakpadId'),
      })
    );
    expect(failedLibs.get('')).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('Invalid debugName or breakpadId'),
      })
    );

    // For error objects, Jest's deep equality checks only check the message.
    expect(failedLibs.get('available-from-neither')).toEqual(
      new SymbolsNotFoundError(
        'Could not obtain symbols for available-from-neither/dont-care.\n' +
          ' - Error: symbol table not found\n' +
          ' - Error: The add-on does not have symbols for this library.',
        {
          debugName: 'available-from-neither',
          breakpadId: 'dont-care',
        }
      )
    );
  });
});
