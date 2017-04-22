import 'babel-polyfill';
import { assert, config } from 'chai';
import { SymbolStoreDB } from '../../content/symbol-store-db';
import exampleSymbolTable from '../fixtures/example-symbol-table';
import fakeIndexedDB from 'fake-indexeddb';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

config.truncateThreshold = 0;

describe('SymbolStoreDB', function () {
  const libs = Array.from({ length: 10 }).map((_, i) => ({ debugName: `firefox${i}`, breakpadId: `breakpadId${i}` }));

  it('should respect the maximum number of tables limit', async function () {
    global.window = { indexedDB: fakeIndexedDB, IDBKeyRange: FDBKeyRange };
    const symbolStoreDB = new SymbolStoreDB('testing-symbol-tables', 5); // maximum 5

    // Try to store 10 symbol tables in a database that only allows 5.
    // All stores should succeed but the first 5 should be evicted again.
    for (const lib of libs) {
      await symbolStoreDB.storeSymbolTable(lib.debugName, lib.breakpadId, exampleSymbolTable);
    }

    for (let i = 0; i < 5; i++) {
      try {
        await symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId);
        assert.ok(false, 'should not get any of the first 5 tables back');
      } catch (e) {
        assert.ok(true, 'should not get any of the first 5 tables back');
      }
    }

    for (let i = 5; i < 10; i++) {
      try {
        await symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId);
        assert.ok(true, 'the last 5 tables should have been inserted and kept successfully');
      } catch (e) {
        assert.ok(false, 'the last 5 tables should have been inserted and kept successfully');
      }
    }

    await symbolStoreDB.close();
  });

  it('should still contain those five symbol tables after opening the database a second time', async function () {
    global.window = { indexedDB: fakeIndexedDB, IDBKeyRange: FDBKeyRange };
    const symbolStoreDB = new SymbolStoreDB('testing-symbol-tables', 5); // maximum 5

    for (let i = 0; i < 5; i++) {
      try {
        await symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId);
        assert.ok(false, 'should not get any of the first 5 tables back');
      } catch (e) {
        assert.ok(true, 'should not get any of the first 5 tables back');
      }
    }

    for (let i = 5; i < 10; i++) {
      try {
        await symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId);
        assert.ok(true, 'the last 5 tables should have been inserted and kept successfully');
      } catch (e) {
        assert.ok(false, 'the last 5 tables should have been inserted and kept successfully');
      }
    }

    await symbolStoreDB.close();
  });

  it('should still evict all tables when opening with the age limit set to 0ms', async function () {
    global.window = { indexedDB: fakeIndexedDB, IDBKeyRange: FDBKeyRange };
    const symbolStoreDB = new SymbolStoreDB('testing-symbol-tables', 10, 0); // maximum count 10, maximum age 0

    for (let i = 0; i < 10; i++) {
      try {
        await symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId);
        assert.ok(false, 'should not get any of the tables back');
      } catch (e) {
        assert.ok(true, 'should not get any of the tables back');
      }
    }

    await symbolStoreDB.close();
  });
});
