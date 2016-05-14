import { SymbolStoreDB } from './symbol-store-db';

/**
 * Lets you get symbol tables and only requests them from the symbol provider once.
 * @class SymbolStore
 * @classdesc A broker that lets you request stuff as often as you want.
 */
export class SymbolStore {
  /**
   * SymbolStore constructor.
   * @param {string} dbNamePrefix   A prefix for the indexedDB database which the SymbolStore
   *                                uses internally (using asyncStorage) to store symbol tables.
   * @param {object} symbolProvider An object with a method 'requestSymbolTable(pdbName, breakpadId)'
   *                                which will be called whenever we need a symbol table. This method
   *                                needs to return a promise of [addr, syms] (the symbol table).
   */
  constructor(dbNamePrefix, symbolProvider) {
    this._symbolProvider = symbolProvider;
    this._db = new SymbolStoreDB(`${dbNamePrefix}-symbol-tables`);

    // A set of strings identifying libraries that we have requested
    // symbols for but gotten an error back.
    this._failedRequests = new Set();

    // A map with one entry for each library that we have requested (but not yet
    // received) symbols for. The keys are strings (libid), and the values are
    // promises.
    this._importingLibs = new Map();
  }

  _ensureLibraryIsInDB(lib) {
    const { pdbName, breakpadId } = lib;
    let libid = `${pdbName}/${breakpadId}`;
    if (this._failedRequests.has(libid)) {
      return Promise.reject(new Error('We\'ve tried to request a symbol table for this library before and failed, so we\'re not trying again.'));
    }
    return this._db.getLibKey(pdbName, breakpadId).catch(() => {
      if (this._importingLibs.has(libid)) {
        // We've already requested a symbol table for this library and are
        // waiting for the result, so just return the promise for the existing
        // request.
        return this._importingLibs.get(libid);
      }

      // Request the symbol table from the symbol provider.
      let symbolTablePromise = this._symbolProvider.requestSymbolTable(lib.pdbName, lib.breakpadId);
      let importPromise = symbolTablePromise.then(symbolTable => {
        this._importingLibs.delete(libid);
        return this._db.importLibrary(pdbName, breakpadId, symbolTable);
      }, error => {
        this._importingLibs.delete(libid);
        console.error(`Failed to symbolicate library ${pdbName}.`);
        throw error;
      });
      this._importingLibs.set(libid, importPromise);
      return importPromise;
    }).catch(error => {
      this._failedRequests.add(libid);
      throw error;
    });
  }

  /**
   * Get the array of symbol addresses for the given library.
   * @param  {object} lib A library object with the properties `pdbName` and `breakpadId`.
   * @return {Promise<Array<Number>>} A promise of the array of addresses.
   */
  getFuncAddressTableForLib(lib) {
    return this._ensureLibraryIsInDB(lib).then(
      libKey => this._db.getFuncAddressTableForLib(libKey));
  }

  /**
   * Get an array of symbol strings for the given symbol indices.
   * @param  {Array<Number>} requestedAddressesIndices An array where each element is the index of the symbol whose string should be looked up.
   * @param  {Object} lib A library object with the properties `pdbName` and `breakpadId`.
   * @return {Promise<Array<String>>} An promise array of strings, in the order as requested.
   */
  getSymbolsForAddressesInLib(requestedAddressesIndices, lib) {
    return this._ensureLibraryIsInDB(lib).then(
      libKey => this._db.getSymbolsForAddressesInLib(requestedAddressesIndices, libKey));
  }
}
