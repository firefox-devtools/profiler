/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import SymbolStoreDB from '../../profile-logic/symbol-store-db';
import { completeSymbolTableAsTuple } from '../fixtures/example-symbol-table';
// fake-indexeddb no longer includes a structuredClone polyfill, so we need to
// import it explicitly.
import 'core-js/stable/structured-clone';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

describe('SymbolStoreDB', function () {
  const libs = Array.from({ length: 10 }).map((_, i) => ({
    debugName: `firefox${i}`,
    breakpadId: `breakpadId${i}`,
  }));

  beforeAll(function () {
    // The SymbolStore requires IndexedDB, otherwise symbolication will be skipped.
    (window as any).indexedDB = indexedDB;
    (window as any).IDBKeyRange = IDBKeyRange;
  });

  afterAll(function () {
    delete (window as any).indexedDB;
    delete (window as any).IDBKeyRange;
  });

  it('should respect the maximum number of tables limit', async function () {
    const symbolStoreDB = new SymbolStoreDB('testing-symbol-tables', 5); // maximum 5

    // Try to store 10 symbol tables in a database that only allows 5.
    // All stores should succeed but the first 5 should be evicted again.
    for (const lib of libs) {
      await symbolStoreDB.storeSymbolTable(
        lib.debugName,
        lib.breakpadId,
        completeSymbolTableAsTuple
      );
    }

    for (let i = 0; i < 5; i++) {
      await expect(
        symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId)
      ).resolves.toBeNull();
      //        .rejects.toMatch('does not exist in the database'); // TODO Some future verison of jest should make this work
    }

    for (let i = 5; i < 10; i++) {
      // We should be able to retrieve all last 5 tables
      await expect(
        symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId)
      ).resolves.toBeInstanceOf(Array);
    }

    await symbolStoreDB.close();
  });

  it('should still contain those five symbol tables after opening the database a second time', async function () {
    const symbolStoreDB = new SymbolStoreDB('testing-symbol-tables', 5); // maximum 5

    for (let i = 0; i < 5; i++) {
      await expect(
        symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId)
      ).resolves.toBeNull();
    }

    for (let i = 5; i < 10; i++) {
      // We should be able to retrieve all last 5 tables
      await expect(
        symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId)
      ).resolves.toBeInstanceOf(Array);
    }

    await symbolStoreDB.close();
  });

  it('should still evict all tables when opening with the age limit set to 0ms', async function () {
    // maximum count 10, maximum age -1
    // Note we use -1 to force an eviction. With 0 in some platforms (cough cough
    // Windows) we don't get an eviction because Date.now() isn't updated often
    // enough.
    const symbolStoreDB = new SymbolStoreDB('testing-symbol-tables', 10, -1);

    for (let i = 0; i < 10; i++) {
      await expect(
        symbolStoreDB.getSymbolTable(libs[i].debugName, libs[i].breakpadId)
      ).resolves.toBeNull();
    }

    await symbolStoreDB.close();
  });
});
