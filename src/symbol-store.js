import { SymbolStoreDBThreaded } from './symbol-store-db';

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
    this._db = new SymbolStoreDBThreaded(`${dbNamePrefix}-symbol-tables`);

    /**
     * A set of strings identifying libraries that we have requested
     * symbols for but gotten an error back.
     */
    this._failedRequests = new Set();

    /**
     * A map with one entry for each library that we have requested (but not yet
     * received) symbols for. The keys are strings (libid), and the values are
     * promises.
     */
    this._importingLibs = new Map();
  }

  _ensureLibraryIsInDB(lib) {
    const { pdbName, breakpadId } = lib;
    let libid = `${pdbName}/${breakpadId}`;
    if (this._failedRequests.has(libid)) {
      return Promise.reject(new Error("We've tried to request a symbol table for this library before and failed, so we're not trying again."));
    }
    return this._db.getLibKey(pdbName, breakpadId).catch(error => {
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

  getFuncAddressTableForLib(lib) {
    return this._ensureLibraryIsInDB(lib).then(
      libKey => this._db.getFuncAddressTableForLib(libKey));
  }

  getSymbolsForAddressesInLib(requestedAddresses, lib) {
    return this._ensureLibraryIsInDB(lib).then(
      libKey => this._db.getSymbolsForAddressesInLib(requestedAddresses, libKey));
  }
};
