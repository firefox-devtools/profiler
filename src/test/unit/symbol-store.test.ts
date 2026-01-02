/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  AddressResult,
  LibSymbolicationResponse,
  SymbolProvider,
} from '../../profile-logic/symbol-store';
import { SymbolStore } from '../../profile-logic/symbol-store';
import { SymbolsNotFoundError } from '../../profile-logic/errors';
import { completeSymbolTableAsTuple } from '../fixtures/example-symbol-table';
// fake-indexeddb no longer includes a structuredClone polyfill, so we need to
// import it explicitly.
import 'core-js/stable/structured-clone';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { FakeSymbolStore } from '../fixtures/fake-symbol-store';
import { ensureExists } from '../../utils/types';
import type { RequestedLib } from 'firefox-profiler/types';

describe('SymbolStore', function () {
  let symbolProvider: SymbolProvider | null = null;
  let symbolStore: SymbolStore | null = null;

  function deleteDatabase() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(
        'profiler-async-storage-symbol-tables'
      );
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  }

  beforeAll(function () {
    // The SymbolStore requires IndexedDB, otherwise symbolication will be skipped.
    window.indexedDB = indexedDB;
    window.IDBKeyRange = IDBKeyRange;
  });

  afterAll(function () {
    // @ts-expect-error - Check tsconfig DOM stuff in tests directory
    delete window.indexedDB;
    // @ts-expect-error - Check tsconfig DOM stuff in tests directory
    delete window.IDBKeyRange;

    symbolStore = null;
  });

  afterEach(async function () {
    if (symbolStore) {
      await symbolStore.closeDb().catch(() => {});
    }
    await deleteDatabase();
  });

  it('should only request symbols from the symbol provider once per library', async function () {
    symbolProvider = {
      requestSymbolsFromServer: jest.fn((requests) =>
        Promise.resolve(
          requests.map((request) => {
            expect(request.lib.breakpadId).not.toBe('');
            return {
              type: 'ERROR',
              request,
              error: new Error('this example only supports symbol tables'),
            };
          })
        )
      ),
      requestSymbolsFromBrowser: async (_requests) => {
        throw new Error('requestSymbolsFromBrowser unsupported in this test');
      },
      requestSymbolTableFromBrowser: jest.fn(() =>
        Promise.resolve(completeSymbolTableAsTuple)
      ),
    };
    symbolStore = new SymbolStore('profiler-async-storage', symbolProvider);

    expect(symbolProvider.requestSymbolTableFromBrowser).not.toHaveBeenCalled();

    const lib1 = { debugName: 'firefox', breakpadId: 'dont-care' };
    let secondAndThirdSymbol = new Map<unknown, unknown>();
    const errorCallback = jest.fn((_request, _error) => {});
    await symbolStore.getSymbols(
      [{ lib: lib1, addresses: new Set([0xf01, 0x1a50]) }],
      (_request, results) => {
        secondAndThirdSymbol = results;
      },
      errorCallback
    );
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(1);
    expect(symbolProvider.requestSymbolTableFromBrowser).toHaveBeenCalledTimes(
      1
    );
    expect(errorCallback).not.toHaveBeenCalled();
    expect(secondAndThirdSymbol.get(0xf01)).toEqual({
      name: 'second symbol',
      symbolAddress: 0xf00,
      functionSize: 0xb00,
    });
    expect(secondAndThirdSymbol.get(0x1a50)).toEqual({
      name: 'third symbol',
      symbolAddress: 0x1a00,
      functionSize: 0x600,
    });

    const lib2 = { debugName: 'firefox2', breakpadId: 'dont-care2' };
    let firstAndLastSymbol = new Map<unknown, unknown>();
    await symbolStore.getSymbols(
      [{ lib: lib2, addresses: new Set([0x33, 0x2000]) }],
      (_request, results) => {
        firstAndLastSymbol = results;
      },
      errorCallback
    );
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(2);
    expect(symbolProvider.requestSymbolTableFromBrowser).toHaveBeenCalledTimes(
      2
    );
    expect(errorCallback).not.toHaveBeenCalled();
    expect(firstAndLastSymbol.get(0x33)).toEqual({
      name: 'first symbol',
      symbolAddress: 0,
      functionSize: 0xf00,
    });
    expect(firstAndLastSymbol.get(0x2000)).toEqual({
      name: 'last symbol',
      symbolAddress: 0x2000,
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
    expect(symbolProvider.requestSymbolTableFromBrowser).toHaveBeenCalledTimes(
      2
    );

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

  it('should persist in DB', async function () {
    symbolProvider = {
      requestSymbolsFromServer: jest.fn((requests) =>
        Promise.resolve(
          requests.map((request) => ({
            type: 'ERROR',
            request,
            error: new Error('this example only supports symbol tables'),
          }))
        )
      ),
      requestSymbolsFromBrowser: jest.fn((_requests) =>
        Promise.reject(
          new Error('requestSymbolsFromBrowser unsupported in this test')
        )
      ),
      requestSymbolTableFromBrowser: jest.fn(() =>
        Promise.resolve(completeSymbolTableAsTuple)
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

    expect(symbolProvider.requestSymbolTableFromBrowser).toHaveBeenCalledTimes(
      1
    );
    expect(errorCallback).not.toHaveBeenCalled();
  });

  it('should call requestSymbolsFromServer first', async function () {
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
      requestSymbolsFromServer: jest.fn(async (requests) => {
        symbolsForAddressesRequestCount += requests.length;
        const responses: LibSymbolicationResponse[] = [];
        for (const request of requests) {
          await fakeSymbolStore.getSymbols(
            [request],
            (lib, results) => {
              responses.push({
                type: 'SUCCESS',
                lib,
                results,
              });
            },
            (request, error) => {
              responses.push({
                type: 'ERROR',
                request,
                error,
              });
            }
          );
        }
        return responses;
      }),
      requestSymbolsFromBrowser: jest.fn((_requests) =>
        Promise.reject(
          new Error('requestSymbolsFromBrowser unsupported in this test')
        )
      ),
      requestSymbolTableFromBrowser: jest
        .fn()
        .mockResolvedValue(completeSymbolTableAsTuple),
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

    const symbolsPerLibrary = new Map<
      RequestedLib,
      Map<number, AddressResult>
    >();
    const errorCallback = jest.fn((_request, _error) => {});
    await symbolStore.getSymbols(
      [
        { lib: lib1, addresses: new Set([0xf01, 0x1a50]) },
        { lib: lib2, addresses: new Set([0x33, 0x2000]) },
      ],
      (lib, results) => {
        symbolsPerLibrary.set(lib, results);
      },
      errorCallback
    );

    // Both requests should have been coalesced into one call to
    // requestSymbolsFromServer.
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(1);
    expect(symbolsForAddressesRequestCount).toEqual(2);
    expect(errorCallback).not.toHaveBeenCalled();

    // requestSymbolsFromServer should have failed for lib2, so
    // requestSymbolTableFromBrowser should have been called for it, once.
    expect(symbolProvider.requestSymbolTableFromBrowser).toHaveBeenCalledTimes(
      1
    );

    const lib1Symbols = ensureExists(symbolsPerLibrary.get(lib1));
    const lib2Symbols = ensureExists(symbolsPerLibrary.get(lib2));
    expect(lib1Symbols.get(0xf01)).toEqual({
      name: 'second symbol',
      symbolAddress: 0xf00,
    });
    expect(lib1Symbols.get(0x1a50)).toEqual({
      name: 'third symbol',
      symbolAddress: 0x1a00,
    });
    expect(lib2Symbols.get(0x33)).toEqual({
      name: 'first symbol',
      symbolAddress: 0,
      functionSize: 0xf00,
    });
    expect(lib2Symbols.get(0x2000)).toEqual({
      name: 'last symbol',
      symbolAddress: 0x2000,
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
    // but the cache is only checked after the API requests, so both libraries
    // are sent to requestSymbolsFromServer.
    expect(symbolProvider.requestSymbolsFromServer).toHaveBeenCalledTimes(2);
    expect(symbolsForAddressesRequestCount).toEqual(4);
    expect(errorCallback).not.toHaveBeenCalled();

    // requestSymbolsFromServer should have succeeded for lib1 and failed for lib2.
    // lib2 is then found in the cache, so requestSymbolTableFromBrowser is not called again.
    expect(symbolProvider.requestSymbolTableFromBrowser).toHaveBeenCalledTimes(
      1
    );
  });

  it('should should report the right errors', async function () {
    const libs = [
      {
        debugName: 'available-from-both-server-and-browser',
        breakpadId: 'dont-care',
      },
      {
        debugName: 'available-from-server',
        breakpadId: 'dont-care',
      },
      {
        debugName: 'available-from-browser',
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
        ['available-from-both-server-and-browser', symbolTable],
        ['available-from-server', symbolTable],
      ])
    );
    symbolProvider = {
      requestSymbolsFromServer: async (requests) => {
        const responses: LibSymbolicationResponse[] = [];
        for (const request of requests) {
          const { debugName, breakpadId } = request.lib;
          expect(debugName).not.toEqual('');
          expect(breakpadId).not.toEqual('');
          await fakeSymbolStore.getSymbols(
            [request],
            (lib, results) => {
              responses.push({
                type: 'SUCCESS',
                lib,
                results,
              });
            },
            (request, error) => {
              responses.push({
                type: 'ERROR',
                request,
                error,
              });
            }
          );
        }
        return responses;
      },
      requestSymbolsFromBrowser: jest.fn((_requests) =>
        Promise.reject(
          new Error('requestSymbolsFromBrowser unsupported in this test')
        )
      ),
      requestSymbolTableFromBrowser: async ({ debugName, breakpadId }) => {
        expect(debugName).not.toEqual('');
        expect(breakpadId).not.toEqual('');
        if (
          debugName === 'available-from-browser' ||
          debugName === 'available-from-both-server-and-browser'
        ) {
          return completeSymbolTableAsTuple;
        }
        throw new Error('The browser does not have symbols for this library.');
      },
    };
    symbolStore = new SymbolStore('profiler-async-storage', symbolProvider);

    const addresses = new Set([0xf01, 0x1a50]);
    const succeededLibs = new Set<unknown>();
    const failedLibs = new Map<unknown, unknown>();
    await symbolStore.getSymbols(
      libs.map((lib) => ({ lib, addresses })),
      (lib, _results) => {
        succeededLibs.add(lib);
      },
      (request, error) => {
        failedLibs.set(request.lib.debugName, error);
      }
    );

    // If symbols are available from at least one source, symbolication for that
    // library should be successful and no error should be returned.
    expect(succeededLibs).toEqual(
      new Set([
        expect.objectContaining({ debugName: 'available-from-browser' }),
        expect.objectContaining({ debugName: 'available-from-server' }),
        expect.objectContaining({
          debugName: 'available-from-both-server-and-browser',
        }),
      ])
    );

    // Empty debugNames or breakpadIds should cause errors. And if symbols are
    // not available from any source, all errors along the way should be included
    // in the reported error.
    expect([...failedLibs]).toBeArrayOfSize(3);
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
          ' - Error: requestSymbolsFromBrowser unsupported in this test\n' +
          ' - Error: The browser does not have symbols for this library.',
        {
          debugName: 'available-from-neither',
          breakpadId: 'dont-care',
        }
      )
    );
  });
});
