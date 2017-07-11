/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class FakeSymbolStore {
  constructor(symbolTables) {
    this._symbolTables = {};
    for (const debugName in symbolTables) {
      const entries = Array.from(Object.entries(symbolTables[debugName]));
      entries.sort(([addr1], [addr2]) => addr1 - addr2);
      this._symbolTables[debugName] = {
        addrs: new Uint32Array(entries.map(([addr]) => addr)),
        syms: entries.map(([, sym]) => sym),
      };
    }
  }

  getFuncAddressTableForLib(lib) {
    if (lib.debugName in this._symbolTables) {
      return Promise.resolve(this._symbolTables[lib.debugName].addrs);
    }
    return Promise.reject(new Error());
  }

  getSymbolsForAddressesInLib(requestedAddressesIndices, lib) {
    if (lib.debugName in this._symbolTables) {
      const syms = this._symbolTables[lib.debugName].syms;
      return Promise.resolve(
        requestedAddressesIndices.map(index => syms[index])
      );
    }
    return Promise.reject(new Error());
  }
}
