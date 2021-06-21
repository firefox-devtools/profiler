/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { TextEncoder } from 'util';
import type { SymbolTableAsTuple } from '../../profile-logic/symbol-store-db';

const completeSyms = [
  {
    address: 0,
    name: 'first symbol',
  },
  {
    address: 0xf00,
    name: 'second symbol',
  },
  {
    address: 0x1a00,
    name: 'third symbol',
  },
  {
    address: 0x2000,
    name: 'last symbol',
  },
];

const partialSyms = [
  {
    address: 0,
    name: 'overencompassing first symbol',
  },
  {
    address: 0x2000,
    name: 'last symbol',
  },
];

function _makeSymbolTableAsTuple(syms): SymbolTableAsTuple {
  const index = [0];
  let accum = 0;
  for (const { name } of syms) {
    accum += name.length;
    index.push(accum);
  }

  return [
    new Uint32Array(syms.map(({ address }) => address)),
    new Uint32Array(index),
    new TextEncoder().encode(syms.map(({ name }) => name).join('')),
  ];
}

export const completeSymbolTable = _makeSymbolTableAsTuple(completeSyms);
export const partialSymbolTable = _makeSymbolTableAsTuple(partialSyms);

export default completeSymbolTable;
