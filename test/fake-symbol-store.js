export class FakeSymbolStore {
  constructor(symbolTables) {
    this._symbolTables = symbolTables;
  }

  getFuncAddressTableForLib(lib) {
    if (lib.pdbName in this._symbolTables) {
      const addresses = Object.keys(this._symbolTables[lib.pdbName]);
      addresses.sort();
      return Promise.resolve(new Uint32Array(addresses));
    }
    return Promise.reject();
  }

  getSymbolsForAddressesInLib(requestedAddresses, lib) {
    if (lib.pdbName in this._symbolTables) {
      const symbolTable = this._symbolTables[lib.pdbName];
      return Promise.resolve(requestedAddresses.map(addr => symbolTable[addr]));
    }
    return Promise.reject();
  }
};
