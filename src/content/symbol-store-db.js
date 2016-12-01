import { provideHostSide } from './promise-worker';

/**
 * A wrapper around an IndexedDB table that stores symbol tables.
 * @class SymbolStoreDB
 * @classdesc Where does this description show up?
 */
export class SymbolStoreDB {
  /**
   * @param {string} dbName The name of the indexedDB database that's used
   *                        to store the symbol tables.
   */
  constructor(dbName) {
    this._db = null;
    this._setupDBPromise = this._setupDB(dbName);
  }

  _setupDB(dbName) {
    return new Promise((resolve, reject) => {
      const openreq = indexedDB.open(dbName, 1);
      openreq.onerror = reject;
      openreq.onupgradeneeded = () => {
        const db = openreq.result;
        db.onerror = reject;
        const tableStore = db.createObjectStore('symbol-tables', { autoIncrement: true });
        tableStore.createIndex('libKey', ['pdbName', 'breakpadId'], { unique: true });
      };
      openreq.onsuccess = () => {
        this._db = openreq.result;
        resolve();
      };
    });
  }

  getLibKey(pdbName, breakpadId) {
    if (!this._db) {
      return this._setupDBPromise.then(() => this.getLibKey(pdbName, breakpadId));
    }

    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction('symbol-tables', 'readonly');
      const store = transaction.objectStore('symbol-tables');
      const index = store.index('libKey');
      const req = index.openKeyCursor(IDBKeyRange.only([pdbName, breakpadId]));
      req.onerror = reject;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          resolve(cursor.primaryKey);
        } else {
          reject(new Error('Nothing in the async cache for this library.'));
        }
      };
    });
  }

  importLibrary(pdbName, breakpadId, [addrs, index, buffer]) {
    if (!this._db) {
      return this._setupDBPromise.then(() => this.importLibrary(pdbName, breakpadId, [addrs, index, buffer]));
    }

    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction('symbol-tables', 'readwrite');
      transaction.onerror = reject;
      const tableStore = transaction.objectStore('symbol-tables');
      const putReq = tableStore.put({ pdbName, breakpadId, addrs, index, buffer });
      putReq.onsuccess = () => {
        resolve(putReq.result);
      };
    });
  }

  getFuncAddressTableForLib(libKey) {
    if (!this._db) {
      return this._setupDBPromise.then(() => this.getFuncAddressTableForLib(libKey));
    }

    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction('symbol-tables', 'readonly');
      const store = transaction.objectStore('symbol-tables');
      const req = store.get(libKey);
      req.onerror = reject;
      req.onsuccess = () => {
        if (req.result) {
          const { addrs } = req.result;
          resolve(addrs);
        } else {
          reject();
        }
      };
    });
  }

  /**
   * Returns a promise of an array with symbol names, matching the order of
   * the requested addresses.
   * @param  {Array<Number>} requestedAddressesIndices The indices of each symbol that should be looked up.
   * @param  {Number} libKey The primary key for the library, as returned by getLibKey
   * @return {Array<String>} The symbols, one for each address in requestedAddresses.
   */
  getSymbolsForAddressesInLib(requestedAddressesIndices, libKey) {
    if (!this._db) {
      return this._setupDBPromise.then(() => this.getSymbolsForAddressesInLib(requestedAddressesIndices, libKey));
    }

    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction('symbol-tables', 'readonly');
      const store = transaction.objectStore('symbol-tables');
      const req = store.get(libKey);
      req.onerror = reject;
      req.onsuccess = () => {
        if (!req.result) {
          reject(new Error('unexpected null result'));
          return;
        }
        const { index, buffer } = req.result;
        const decoder = new TextDecoder();
        resolve(requestedAddressesIndices.map(addrIndex => {
          const startOffset = index[addrIndex];
          const endOffset = index[addrIndex + 1];
          const subarray = buffer.subarray(startOffset, endOffset);
          return decoder.decode(subarray);
        }));
      };
    });
  }
}

export const SymbolStoreDBThreaded = provideHostSide('symbol-store-db-worker.js', [
  'getLibKey',
  'importLibrary',
  'getFuncAddressTableForLib',
  'getSymbolsForAddressesInLib',
]);
