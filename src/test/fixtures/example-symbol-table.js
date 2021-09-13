/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { TextEncoder } from 'util';
import type { SymbolTableAsTuple } from '../../profile-logic/symbol-store-db';
import type { AddressResult } from '../../profile-logic/symbol-store';

export type LineRange = {|
  startAddress: number,
  line: number,
|};

export type ExampleSymbolTableSymbols = Array<{|
  address: number,
  name: string,
  file?: string,
  lineRanges?: Array<LineRange>,
|}>;

export type ExampleSymbolTable = {|
  symbols: ExampleSymbolTableSymbols,
  asTuple: SymbolTableAsTuple,
  getAddressResult: (number) => AddressResult | null,
|};

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

function _makeGetAddressResultFunction(
  syms: ExampleSymbolTableSymbols
): (number) => AddressResult | null {
  return function getAddressResult(address) {
    for (let i = syms.length - 1; i >= 0; i--) {
      const { address: symbolAddress, name, file, lineRanges } = syms[i];
      if (address >= symbolAddress) {
        // We found the right symbol. See if we can find a line number for this address.
        let line = undefined;
        if (lineRanges) {
          for (let j = lineRanges.length - 1; j >= 0; j--) {
            const lineRange = lineRanges[j];
            if (address >= lineRange.startAddress) {
              line = lineRange.line;
              break;
            }
          }
        }
        return { name, symbolAddress, file, line };
      }
    }
    return null;
  };
}

const completeSyms = [
  {
    address: 0,
    name: 'first symbol',
    file: 'first_and_last.cpp',
    lineRanges: [
      {
        startAddress: 0x0,
        line: 12,
      },
      {
        startAddress: 0x8,
        line: 14,
      },
      {
        startAddress: 0xc,
        line: 15,
      },
    ],
  },
  {
    address: 0xf00,
    name: 'second symbol',
    file: 'second_and_third.rs',
  },
  {
    address: 0x1a00,
    name: 'third symbol',
    file: 'second_and_third.rs',
  },
  {
    address: 0x2000,
    name: 'last symbol',
    file: 'first_and_last.cpp',
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

export const completeSymbolTable: ExampleSymbolTable = {
  symbols: completeSyms,
  asTuple: _makeSymbolTableAsTuple(completeSyms),
  getAddressResult: _makeGetAddressResultFunction(completeSyms),
};

export const partialSymbolTable: ExampleSymbolTable = {
  symbols: partialSyms,
  asTuple: _makeSymbolTableAsTuple(partialSyms),
  getAddressResult: _makeGetAddressResultFunction(partialSyms),
};

export const completeSymbolTableAsTuple = completeSymbolTable.asTuple;
export const partialSymbolTableAsTuple = partialSymbolTable.asTuple;
