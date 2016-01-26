import * as asyncStorage from './async-storage';

export class SymbolStore {
  /**
   * SymbolStore constructor.
   * @param string dbNamePrefix   A prefix for the indexedDB database which the SymbolStore
   *                              uses internally (using asyncStorage) to store symbol tables.
   * @param object symbolProvider An object with a method 'requestSymbolTable(pdbName, breakpadId)'
   *                              which will be called whenever we need a symbol table. This method
   *                              needs to return a promise of [addr, syms] (the symbol table).
   */
  constructor(dbNamePrefix, symbolProvider) {
    this._symbolProvider = symbolProvider;

    /**
     * A set of strings identifying libraries that we have requested
     * symbols for but gotten an error back.
     */
    this._failedRequests = new Set();

    this._db = null;
    this._setupDBPromise = this._setupDB(`${dbNamePrefix}-symbol-tables`);

    /**
     * A map with one entry for each library that we have requested (but not yet
     * received) symbols for. The keys are strings (libid), and the values are
     * promises.
     */
    this._waitingForLibs = new Map();
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

  /**
   * Returns a promise of the symbol table. If the promise resolve to a symbol table,
   * that's your symbol table. If the promise resolves to null, it means that we've
   * already tried to request it and failed, so don't request again. If the promise
   * is rejected, that means we have no cached symbol table and also haven't received
   * a response for this library in the past. There might be an in-flight request for it,
   * though - this method doesn't know about those.
   * @param  string libid A string identifying the library
   * @return Promise      A promise of the cached symbol table
   */
  _checkIfCached(pdbName, breakpadId) {
    if (!this._db) {
      return this._setupDBPromise.then(() => this._checkIfCached(pdbName, breakpadId));
    }

    if (this._failedRequests.has(`${pdbName}/${breakpadId}`)) {
      return Promise.resolve(null);
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

  _importIntoDB(pdbName, breakpadId, [addrs, syms]) {
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
      }/**/
    });
  }

  _ensureLibraryIsCached(lib) {
    const { pdbName, breakpadId } = lib;
    let libid = `${pdbName}/${breakpadId}`;
    return this._checkIfCached(pdbName, breakpadId).then(libKey => {
      if (libKey === null) {
        throw new Error("We've tried to request a symbol table for this library before and failed, don't try again.");
      }
      return libKey;
    }, error => {
      if (this._waitingForLibs.has(libid)) {
        // We've already requested a symbol table for this library and are
        // waiting for the result, so just return the promise for the existing
        // request.
        return this._waitingForLibs.get(libid);
      }

      // Request the symbol table from the symbol provider.
      let symbolTablePromise = this._symbolProvider.requestSymbolTable(lib.pdbName, lib.breakpadId);
      let libKeyPromise = symbolTablePromise.then(symbolTable => {
        this._waitingForLibs.delete(libid);
        return this._importIntoDB(pdbName, breakpadId, symbolTable);
      }, error => {
        this._waitingForLibs.delete(libid);
        console.log(`Failed to symbolicate library ${pdbName}.`);
        throw error;
      });
      this._waitingForLibs.set(libid, libKeyPromise);
      return libKeyPromise;
    });
  }

  getFuncAddressTableForLib(lib) {
    return this._ensureLibraryIsCached(lib).then(libKey => {
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
    });
  }

  getSymbolsForAddressesInLib(requestedAddresses, lib) {
    const { pdbName, breakpadId } = lib;
    return this._ensureLibraryIsCached(lib).then(libKey => {
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
    });
  }
};
