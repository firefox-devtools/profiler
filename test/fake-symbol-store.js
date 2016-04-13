export class FakeSymbolStore {
  constructor(symbolTables) {
    this._symbolTables = {};
    for (let pdbName in symbolTables) {
      const entries = Array.from(Object.entries(symbolTables[pdbName]));
      entries.sort(([addr1, sym1], [addr2, sym2]) => addr1 - addr2);
      this._symbolTables[pdbName] = {
        addrs: new Uint32Array(entries.map(([addr, sym]) => addr)),
        syms: entries.map(([addr, sym]) => sym),
      };
    }
  }

  getFuncAddressTableForLib(lib) {
    if (lib.pdbName in this._symbolTables) {
      return Promise.resolve(this._symbolTables[lib.pdbName].addrs);
    }
    return Promise.reject();
  }

  getSymbolsForAddressesInLib(requestedAddressesIndices, lib) {
    if (lib.pdbName in this._symbolTables) {
      const syms = this._symbolTables[lib.pdbName].syms;
      return Promise.resolve(requestedAddressesIndices.map(index => syms[index]));
    }
    return Promise.reject();
  }
};
