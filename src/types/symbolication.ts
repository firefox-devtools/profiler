/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export interface ISymbolStoreDB {
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
    symbolTable: SymbolTableAsTuple
  ): Promise<void>;

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
  ): Promise<SymbolTableAsTuple>;

  close(): Promise<void>;
}

export type SymbolTableAsTuple = [
  Uint32Array, // addrs
  Uint32Array, // index
  Uint8Array, // buffer
];
