// @flow
import { SymbolStoreDB } from './symbol-store-db';
import type { SymbolTableAsTuple } from './symbol-store-db';

type Library = {
  debugName: string,
  breakpadId: string,
}

interface SymbolProvider {
  requestSymbolTable(debugName: string, breakpadId: string): Promise<SymbolTableAsTuple>;
}

/**
 * Lets you get symbol tables and only requests them from the symbol provider once.
 * @class SymbolStore
 * @classdesc A broker that lets you request stuff as often as you want.
 */
export class SymbolStore {
  _symbolProvider: SymbolProvider;
  _db: SymbolStoreDB;
  _failedRequests: Set<string>;
  _requestedSymbolTables: Map<string, Promise<SymbolTableAsTuple>>;

  /**
   * SymbolStore constructor.
   * @param {string} dbNamePrefix   A prefix for the indexedDB database which the SymbolStore
   *                                uses internally (using asyncStorage) to store symbol tables.
   * @param {object} symbolProvider An object with a method 'requestSymbolTable(debugName, breakpadId)'
   *                                which will be called whenever we need a symbol table. This method
   *                                needs to return a promise of [addr, syms] (the symbol table).
   */
  constructor(dbNamePrefix: string, symbolProvider: SymbolProvider) {
    this._symbolProvider = symbolProvider;
    this._db = new SymbolStoreDB(`${dbNamePrefix}-symbol-tables`);

    // A set of strings identifying libraries that we have requested
    // symbols for but gotten an error back.
    this._failedRequests = new Set();

    // A map with one entry for each library that we have requested (but not yet
    // received) symbols for. The keys are strings (libid), and the values are
    // promises that resolve to [ addrs, index, buffer ] symbol tables.
    this._requestedSymbolTables = new Map();
  }

  _getSymbolTable(lib: Library): Promise<SymbolTableAsTuple> {
    const { debugName, breakpadId } = lib;
    const libid = `${debugName}/${breakpadId}`;

    if (this._failedRequests.has(libid)) {
      return Promise.reject(
        new Error('We\'ve tried to request a symbol table for this library before and failed, so we\'re not trying again.'));
    }

    const existingRequest = this._requestedSymbolTables.get(libid);
    if (existingRequest !== undefined) {
      // We've already requested a symbol table for this library and are
      // waiting for the result, so just return the promise for the existing
      // request.
      return existingRequest;
    }

    // Try to get the symbol table from the database
    const symbolTablePromise = this._db.getSymbolTable(debugName, breakpadId).catch(() => {
      // Request the symbol table from the symbol provider.
      const symbolTablePromise = this._symbolProvider.requestSymbolTable(debugName, breakpadId).catch(error => {
        console.error(`Failed to symbolicate library ${debugName}`, error);
        this._failedRequests.add(libid);
        this._requestedSymbolTables.delete(libid);
        throw error;
      });

      // Once the symbol table comes in, store it in the database, but don't
      // let that block the promise that we return to our caller.
      symbolTablePromise.then(symbolTable => {
        this._db.storeSymbolTable(debugName, breakpadId, symbolTable).then(() => {
          this._requestedSymbolTables.delete(libid);
        }, error => {
          console.error(`Failed to store the symbol table for ${debugName} ${breakpadId} in the database:`, error);
          // We'll keep the symbolTablePromise in _requestedSymbolTables so
          // that we'll the symbolTable around for future requests even though
          // we failed to put it into the database.
        });
      });

      return symbolTablePromise;
    });
    this._requestedSymbolTables.set(libid, symbolTablePromise);
    return symbolTablePromise;
  }

  /**
   * Get the array of symbol addresses for the given library.
   * @param  {Library} lib A library object with the properties `debugName` and `breakpadId`.
   * @return {Promise<number[]>} A promise of the array of addresses.
   */
  async getFuncAddressTableForLib(lib: Library): Promise<Uint32Array> {
    const [addrs] = await this._getSymbolTable(lib);
    return addrs;
  }

  /**
   * Get an array of symbol strings for the given symbol indices.
   * @param  {number[]} requestedAddressesIndices An array where each element is the index of the symbol whose string should be looked up.
   * @param  {Library} lib A library object with the properties `debugName` and `breakpadId`.
   * @return {Promise<string[]>} An promise array of strings, in the order as requested.
   */
  async getSymbolsForAddressesInLib(requestedAddressesIndices: number[], lib: Library): Promise<string[]> {
    const [, index, buffer] = await this._getSymbolTable(lib);
    const decoder = new TextDecoder();
    return requestedAddressesIndices.map(addrIndex => {
      const startOffset = index[addrIndex];
      const endOffset = index[addrIndex + 1];
      const subarray = buffer.subarray(startOffset, endOffset);
      return decoder.decode(subarray);
    });
  }
}
