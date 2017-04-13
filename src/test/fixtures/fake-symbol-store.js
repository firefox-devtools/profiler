export class FakeSymbolStore {
  constructor(symbolTables) {
    this._symbolTables = {};
    for (let debugName in symbolTables) {
      const entries = Array.from(Object.entries(symbolTables[debugName]));
      entries.sort(([addr1, sym1], [addr2, sym2]) => addr1 - addr2);
      this._symbolTables[debugName] = {
        addrs: new Uint32Array(entries.map(([addr, sym]) => addr)),
        syms: entries.map(([addr, sym]) => sym),
      };
    }
  }

  getFuncAddressTableForLib(lib) {
    if (lib.debugName in this._symbolTables) {
      return Promise.resolve(this._symbolTables[lib.debugName].addrs);
    }
    return Promise.reject();
  }

  getSymbolsForAddressesInLib(requestedAddressesIndices, lib) {
    if (lib.debugName in this._symbolTables) {
      const syms = this._symbolTables[lib.debugName].syms;
      return Promise.resolve(requestedAddressesIndices.map(index => syms[index]));
    }
    return Promise.reject();
  }
};
