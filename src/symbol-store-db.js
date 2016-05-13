import { provideHostSide } from './promise-worker';

export class SymbolStoreDB {
  /**
   * SymbolStore constructor.
   * @param string dbName   The name of the indexedDB database that's used
   *                        to store the symbol tables.
   */
  constructor(dbName) {
    this._db = null;
    this._setupDBPromise = this._setupDB(dbName);
  }

  _setupDB(dbName) {
    return new Promise((resolve, reject) => {
      let openreq = indexedDB.open(dbName, 1);
      openreq.onerror = reject;
      openreq.onupgradeneeded = () => {
        let db = openreq.result;
        db.onerror = reject;
        let tableStore = db.createObjectStore('symbol-tables', { autoIncrement: true });
        tableStore.createIndex('libKey',  ['pdbName', 'breakpadId'], { unique: true });
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
      let transaction = this._db.transaction('symbol-tables', 'readonly');
      let store = transaction.objectStore('symbol-tables');
      let index = store.index('libKey');
      let req = index.openKeyCursor(IDBKeyRange.only([pdbName, breakpadId]));
      req.onerror = reject;
      req.onsuccess = () => {
        let cursor = req.result;
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
      let transaction = this._db.transaction('symbol-tables', 'readwrite');
      let libKey = null;
      transaction.onerror = reject;
      let tableStore = transaction.objectStore('symbol-tables');
      let putReq = tableStore.put({ pdbName, breakpadId, addrs, index, buffer });
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
      let transaction = this._db.transaction('symbol-tables', 'readonly');
      let store = transaction.objectStore('symbol-tables');
      let req = store.get(libKey);
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
   * @param  {array of integers} requestedAddresses The addresses to look up symbols for, *sorted from lowest to highest*.
   * @param  {integer} libKey                       The primary key for the library, as returned by getLibKey
   * @return {array of strings}                     The symbols, one for each address in requestedAddresses.
   */
  getSymbolsForAddressesInLib(requestedAddressesIndices, libKey) {
    if (!this._db) {
      return this._setupDBPromise.then(() => this.getSymbolsForAddressesInLib(requestedAddressesIndices, libKey));
    }

    return new Promise((resolve, reject) => {
      let transaction = this._db.transaction('symbol-tables', 'readonly');
      let store = transaction.objectStore('symbol-tables');
      let req = store.get(libKey);
      req.onerror = reject;
      req.onsuccess = () => {
        if (!req.result) {
          reject(new Error('unexpected null result'));
          return;
        }
        const { addrs, index, buffer } = req.result;
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
