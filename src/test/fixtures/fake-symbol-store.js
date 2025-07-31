/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//@flow

import { bisectionRight } from 'firefox-profiler/utils/bisect';

import type { RequestedLib } from 'firefox-profiler/types';
import type {
  LibSymbolicationRequest,
  AddressResult,
  AbstractSymbolStore,
} from '../../profile-logic/symbol-store';

export class FakeSymbolStore implements AbstractSymbolStore {
  _symbolTables: Map<string, { addrs: Uint32Array, syms: string[] }>;

  constructor(symbolTables: Map<string, Map<number, string>>) {
    this._symbolTables = new Map();
    for (const [debugName, symbolTable] of symbolTables.entries()) {
      const entries = Array.from(symbolTable.entries());
      entries.sort(([addr1], [addr2]) => addr1 - addr2);
      this._symbolTables.set(debugName, {
        addrs: new Uint32Array(entries.map(([addr]) => addr)),
        syms: entries.map(([, sym]) => sym),
      });
    }
  }

  async getSymbols(
    requests: LibSymbolicationRequest[],
    successCb: (RequestedLib, Map<number, AddressResult>) => void,
    errorCb: (LibSymbolicationRequest, Error) => void
  ): Promise<void> {
    // Make sure that the callbacks are never called synchronously, by enforcing
    // a dummy roundtrip to the microtask queue.
    await Promise.resolve();

    for (const request of requests) {
      const { lib, addresses } = request;
      const symbolTable = this._symbolTables.get(lib.debugName);
      if (symbolTable) {
        const results = new Map();
        for (const address of addresses) {
          const index = bisectionRight(symbolTable.addrs, address) - 1;
          results.set(address, {
            name: symbolTable.syms[index],
            symbolAddress: symbolTable.addrs[index],
          });
        }
        successCb(lib, results);
      } else {
        errorCb(request, new Error('symbol table not found'));
      }
    }
  }
}
