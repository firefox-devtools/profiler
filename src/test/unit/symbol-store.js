import 'babel-polyfill';
import { assert, config } from 'chai';
import { SymbolStore } from '../../content/symbol-store';
import { TextDecoder } from 'text-encoding';
import exampleSymbolTable from '../fixtures/example-symbol-table';
import fakeIndexedDB from 'fake-indexeddb';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

config.truncateThreshold = 0;

describe('SymbolStore', function () {
  global.window = { indexedDB: fakeIndexedDB, IDBKeyRange: FDBKeyRange };
  global.TextDecoder = TextDecoder;

  let requestCount = 0;
  const symbolProvider = {
    requestSymbolTable: () => {
      requestCount++;
      return Promise.resolve(exampleSymbolTable);
    },
  };

  const symbolStore = new SymbolStore('perf-html-async-storage', symbolProvider);

  it('should only request symbols from the symbol provider once per library', async function () {
    assert.equal(requestCount, 0);

    const lib1 = { debugName: 'firefox', breakpadId: 'dont-care' };
    const addrsForLib1 = await symbolStore.getFuncAddressTableForLib(lib1);
    assert.equal(requestCount, 1);
    assert.deepEqual(Array.from(addrsForLib1), [0, 0xf00, 0x1a00, 0x2000]);
    const secondAndThirdSymbol = await symbolStore.getSymbolsForAddressesInLib([1, 2], lib1);
    assert.equal(requestCount, 1);
    assert.deepEqual(secondAndThirdSymbol, ['second symbol', 'third symbol']);

    const lib2 = { debugName: 'firefox2', breakpadId: 'dont-care2' };
    const addrsForLib2 = await symbolStore.getFuncAddressTableForLib(lib2);
    assert.equal(requestCount, 2);
    assert.deepEqual(Array.from(addrsForLib2), [0, 0xf00, 0x1a00, 0x2000]);
    const firstAndLastSymbol = await symbolStore.getSymbolsForAddressesInLib([0, 3], lib2);
    assert.equal(requestCount, 2);
    assert.deepEqual(firstAndLastSymbol, ['first symbol', 'last symbol']);

    const addrsForLib1AfterTheSecondTime = await symbolStore.getFuncAddressTableForLib(lib1);
    assert.equal(requestCount, 2);
    assert.deepEqual(addrsForLib1, addrsForLib1AfterTheSecondTime);
  });
});
