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
        db.createObjectStore('symbols', { keyPath: ['libKey', 'address'] });
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
          reject(new Error("Nothing in the async cache for this library."));
        }
      };
    });
  }

  importLibrary(pdbName, breakpadId, [addrs, syms]) {
    if (!this._db) {
      return this._setupDBPromise.then(() => this.importLibrary(pdbName, breakpadId, [addrs, syms]));
    }

    return new Promise((resolve, reject) => {
      let transaction = this._db.transaction(['symbol-tables', 'symbols'], 'readwrite');
      let libKey = null;
      transaction.onerror = reject;
      transaction.oncomplete = () => resolve(libKey);
      let tableStore = transaction.objectStore('symbol-tables');
      let putReq = tableStore.put({ pdbName, breakpadId, addrs });
      putReq.onsuccess = () => {
        libKey = putReq.result;
        let symStore = transaction.objectStore('symbols');
        for (let i = 0; i < addrs.length; i++) {
          let address = addrs[i];
          let symbol = syms[i];
          symStore.put({ libKey, address, symbol });
        }
      }
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
  getSymbolsForAddressesInLib(requestedAddresses, libKey) {
    if (!this._db) {
      return this._setupDBPromise.then(() => this.getSymbolsForAddressesInLib(requestedAddresses, libKey));
    }

    return new Promise((resolve, reject) => {
      let transaction = this._db.transaction('symbols', 'readonly');
      let store = transaction.objectStore('symbols');
      let req = store.openCursor(IDBKeyRange.lowerBound([libKey, requestedAddresses[0]]));
      let resultArray = [];
      let i = 0;
      req.onerror = reject;
      req.onsuccess = () => {
        let cursor = req.result;
        if (!cursor) {
          reject(new Error("unexpected null cursor"));
          return;
        }
        resultArray.push(cursor.value.symbol);
        i++;
        if (i === requestedAddresses.length) {
          resolve(resultArray);
          return;
        }
        cursor.continue([libKey, requestedAddresses[i]]);
      };
    });
  }
};

export const SymbolStoreDBThreaded = provideHostSide('symbol-store-db-worker.js', [
  'getLibKey',
  'importLibrary',
  'getFuncAddressTableForLib',
  'getSymbolsForAddressesInLib'
]);