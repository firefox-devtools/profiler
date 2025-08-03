/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IDBDatabase, IDBObjectStore } from 'firefox-profiler/types';
import { SymbolsNotFoundError } from './errors';

// Contains a symbol table, which can be used to map addresses to strings.
// Symbol tables of this format are created within Firefox's implementation of
// the geckoProfiler WebExtension API, at
// https://searchfox.org/mozilla-central/source/browser/components/extensions/ParseSymbols.jsm
//
// The first element of this tuple, commonly named "addrs", is a sorted array of
// symbol addresses, as library-relative offsets in bytes, in ascending order.
// The third element of this tuple, commonly named "buffer", is a buffer of
// bytes that contains all strings from this symbol table, in the order of the
// addresses they correspond to, in utf-8 encoded form, all concatenated
// together.
// The second element of this tuple, commonly named "index", contains positions
// into "buffer". For every address, that position is where the string for that
// address starts in the buffer.
// index.length == addrs.length + 1.
// index[addrs.length] is the end position of the last string in the buffer.
//
// The string for the address addrs[i] is
// (new TextDecoder()).decode(buffer.subarray(index[i], index[i + 1]))
export type SymbolTableAsTuple = [
  Uint32Array, // addrs
  Uint32Array, // index
  Uint8Array, // buffer
];

type SymbolItem = {
  debugName: string;
  breakpadId: string;
  addrs: Uint32Array;
  index: Uint32Array;
  buffer: Uint8Array;
  lastUsedDate: Date;
};

type SymbolPrimaryKey = [string, string];
type SymbolDateKey = SymbolItem['lastUsedDate'];
type SymbolStore = IDBObjectStore<SymbolPrimaryKey, SymbolItem>;

const kTwoWeeksInMilliseconds = 2 * 7 * 24 * 60 * 60 * 1000;

/**
 * A wrapper around an IndexedDB table that stores symbol tables.
 * @class SymbolStoreDB
 * @classdesc Where does this description show up?
 */
export default class SymbolStoreDB {
  _dbPromise: Promise<IDBDatabase> | null;
  _maxCount: number;
  _maxAge: number; // in milliseconds

  /**
   * @param {string} dbName   The name of the indexedDB database that's used
   *                          to store the symbol tables.
   * @param {number} maxCount The maximum number of symbol tables to have in
   *                          storage at the same time.
   * @param {number} maxAge   The maximum age, in milliseconds, before stored
   *                          symbol tables should get evicted.
   */
  constructor(
    dbName: string,
    maxCount: number = 200,
    maxAge: number = kTwoWeeksInMilliseconds
  ) {
    this._dbPromise = this._setupDB(dbName);
    this._maxCount = maxCount;
    this._maxAge = maxAge;
  }

  _getDB(): Promise<IDBDatabase> {
    if (this._dbPromise) {
      return this._dbPromise;
    }
    return Promise.reject(new Error('The database is closed.'));
  }

  _setupDB(dbName: string): Promise<IDBDatabase> {
    const indexedDB = window.indexedDB;
    if (!indexedDB) {
      throw new Error('Could not find indexedDB on the window object.');
    }
    return new Promise((resolve, reject) => {
      const openReq = indexedDB.open(dbName, 2);
      openReq.onerror = () => {
        if (openReq.error && openReq.error.name === 'VersionError') {
          // This error fires if the database already exists, and the existing
          // database has a higher version than what we requested. So either
          // this version of profiler.firefox.com is outdated, or somebody briefly tried
          // to change this database format (and increased the version number)
          // and then downgraded to a version of profiler.firefox.com without those
          // changes.
          // We delete the database and try again.
          const deleteDBReq = indexedDB.deleteDatabase(dbName);
          deleteDBReq.onerror = () => reject(deleteDBReq.error);
          deleteDBReq.onsuccess = () => {
            // Try to open the database again.
            this._setupDB(dbName).then(resolve, reject);
          };
        } else {
          reject(openReq.error);
        }
      };
      openReq.onupgradeneeded = ({ oldVersion }) => {
        const db = openReq.result;
        db.onerror = reject;

        if (oldVersion === 1) {
          db.deleteObjectStore('symbol-tables');
        }
        const store: SymbolStore = db.createObjectStore('symbol-tables', {
          keyPath: ['debugName', 'breakpadId'],
        });
        store.createIndex('lastUsedDate', 'lastUsedDate');
      };

      openReq.onblocked = () => {
        reject(
          new Error(
            'The symbol store database could not be upgraded because it is ' +
              'open in another tab. Please close all your other profiler.firefox.com ' +
              'tabs and refresh.'
          )
        );
      };

      openReq.onsuccess = () => {
        const db = openReq.result;
        db.onversionchange = () => {
          db.close();
        };
        resolve(db);
        this._deleteAllBeforeDate(
          db,
          new Date(+new Date() - this._maxAge)
        ).catch((e) => {
          console.error('Encountered error while cleaning out database:', e);
        });
      };
    });
  }

  /**
   * Store the symbol table for a given library.
   * @param {string}      The debugName of the library.
   * @param {string}      The breakpadId of the library.
   * @param {symbolTable} The symbol table, in SymbolTableAsTuple format.
   * @return              A promise that resolves (with nothing) once storage
   *                      has succeeded.
   */
  storeSymbolTable(
    debugName: string,
    breakpadId: string,
    [addrs, index, buffer]: SymbolTableAsTuple
  ): Promise<void> {
    return this._getDB().then((db) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('symbol-tables', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        const store: SymbolStore = transaction.objectStore('symbol-tables');
        this._deleteLeastRecentlyUsedUntilCountIsNoMoreThanN(
          store,
          this._maxCount - 1,
          () => {
            const lastUsedDate = new Date();
            const addReq = store.put({
              debugName,
              breakpadId,
              addrs,
              index,
              buffer,
              lastUsedDate,
            });
            addReq.onsuccess = () => resolve();
          }
        );
      });
    });
  }

  /**
   * Retrieve the symbol table for the given library.
   * @param {string}      The debugName of the library.
   * @param {string}      The breakpadId of the library.
   * @return              A promise that resolves with the symbol table (in
   *                      SymbolTableAsTuple format), or fails if we couldn't
   *                      find a symbol table for the requested library.
   */
  getSymbolTable(
    debugName: string,
    breakpadId: string
  ): Promise<SymbolTableAsTuple> {
    return this._getDB().then((db) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('symbol-tables', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        const store: SymbolStore = transaction.objectStore('symbol-tables');
        const req = store.openCursor([debugName, breakpadId]);
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const value = cursor.value;
            value.lastUsedDate = new Date();
            const updateDateReq = cursor.update(value);
            const { addrs, index, buffer } = value;
            updateDateReq.onsuccess = () => resolve([addrs, index, buffer]);
          } else {
            reject(
              new SymbolsNotFoundError(
                'The requested library does not exist in the database.',
                { debugName, breakpadId }
              )
            );
          }
        };
      });
    });
  }

  close(): Promise<void> {
    // Close the database and make all methods uncallable.
    return this._getDB().then((db) => {
      db.close();
      this._dbPromise = null;
    });
  }

  // Many of the utility functions below use callback functions instead of
  // promises. That's because IndexedDB transactions auto-close at the end of
  // the current event tick if there hasn't been a new request after the last
  // success event. So we need to synchronously add more work inside the
  // onsuccess handler, and we do that by calling the callback function.
  // Resolving a promise only calls any then() callback at the next microtask,
  // and by that time the transaction will already have closed.
  // We don't propagate errors because those will be caught by the onerror
  // handler of the transaction that we got `store` from.
  _deleteAllBeforeDate(db: IDBDatabase, beforeDate: Date): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('symbol-tables', 'readwrite');
      transaction.onerror = () => reject(transaction.error);
      const store: SymbolStore = transaction.objectStore('symbol-tables');
      this._deleteRecordsLastUsedBeforeDate(store, beforeDate, resolve);
    });
  }

  _deleteRecordsLastUsedBeforeDate(
    store: SymbolStore,
    beforeDate: Date,
    callback: () => void
  ): void {
    const lastUsedDateIndex = store.index('lastUsedDate');
    // Get a cursor that walks all records whose lastUsedDate is less than beforeDate.
    const range = window.IDBKeyRange.upperBound(beforeDate, true);
    const cursorReq = lastUsedDateIndex.openCursor(range);
    // Iterate over all records in this cursor and delete them.
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete().onsuccess = () => {
          cursor.continue();
        };
      } else {
        callback();
      }
    };
  }

  _deleteNLeastRecentlyUsedRecords(
    store: SymbolStore,
    n: number,
    callback: () => void
  ): void {
    // Get a cursor that walks the records from oldest to newest
    // lastUsedDate.
    const lastUsedDateIndex = store.index('lastUsedDate');
    const cursorReq = lastUsedDateIndex.openCursor();
    let deletedCount = 0;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const deleteReq = cursor.delete();
        deleteReq.onsuccess = () => {
          deletedCount++;
          if (deletedCount < n) {
            cursor.continue();
          } else {
            callback();
          }
        };
      } else {
        callback();
      }
    };
  }

  _count(store: SymbolStore, callback: (count: number) => void): void {
    const countReq = store.count();
    countReq.onsuccess = () => callback(countReq.result);
  }

  _deleteLeastRecentlyUsedUntilCountIsNoMoreThanN(
    store: SymbolStore,
    n: number,
    callback: () => void
  ): void {
    this._count(store, (symbolTableCount) => {
      if (symbolTableCount > n) {
        // We'll need to remove at least one symbol table.
        const needToRemoveCount = symbolTableCount - n;
        this._deleteNLeastRecentlyUsedRecords(
          store,
          needToRemoveCount,
          callback
        );
      } else {
        callback();
      }
    });
  }
}
