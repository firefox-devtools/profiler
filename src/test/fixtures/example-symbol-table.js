/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { TextEncoder } from 'util';
import type { SymbolTableAsTuple } from '../../profile-logic/symbol-store-db';

const completeSyms = {
  addresses: [0, 0xf00, 0x1a00, 0x2000],
  symbols: ['first symbol', 'second symbol', 'third symbol', 'last symbol'],
};

const partialSyms = {
  addresses: [0, 0x2000],
  symbols: ['overencompassing first symbol', 'last symbol'],
};

function _makeSymbolTableAsTuple(syms): SymbolTableAsTuple {
  const index = [0];
  let accum = 0;
  for (const sym of syms.symbols) {
    accum += sym.length;
    index.push(accum);
  }

  return [
    new Uint32Array(syms.addresses),
    new Uint32Array(index),
    new TextEncoder().encode(syms.symbols.join('')),
  ];
}

export const completeSymbolTable = _makeSymbolTableAsTuple(completeSyms);
export const partialSymbolTable = _makeSymbolTableAsTuple(partialSyms);

export default completeSymbolTable;
