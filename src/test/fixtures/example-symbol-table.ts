/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type { SymbolTableAsTuple } from '../../profile-logic/symbol-store-db';
import type {
  AddressResult,
  AddressInlineFrame,
} from '../../profile-logic/symbol-store';

export type LineRange = {
  startAddress: number;
  line: number;
  inlinedCall?: InlinedCall;
};

export type InlinedCall = {
  name: string;
  file: string;
  lineRanges: LineRange[];
};

export type ExampleSymbolTableSymbols = Array<{
  address: number;
  name: string;
  file?: string;
  lineRanges?: LineRange[];
}>;

export type ExampleSymbolTable = {
  symbols: ExampleSymbolTableSymbols;
  asTuple: SymbolTableAsTuple;
  getAddressResult: (address: number) => AddressResult | null;
};

function _makeSymbolTableAsTuple(syms: ExampleSymbolTableSymbols): SymbolTableAsTuple {
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

// Look up `address` in the InlinedCall object and return an array of
// AddressInlineFrame objects, which our simulated symbolication
// API will put into the `inlines` property of the AddressResult.
// This function is part of the simulated symbolication API for testing.
function _getInlinesRecursive(
  address: number,
  inlinedCall?: InlinedCall
): AddressInlineFrame[] {
  if (!inlinedCall) {
    return [];
  }

  // There is an inlined call covering this address. Get the function name
  // of the function that is called, and the filename for this function.
  const { name, file, lineRanges } = inlinedCall;

  // The inlined call may have produced multiple instructions from different
  // lines of source code. Find the line for the looked up address, and
  // potentially more inlines.
  const { line, inlines } = _getLineAndInlines(address, lineRanges);

  // We build the full inline stack recursively, from inside to outside.
  // `inlines` has the deeper inline calls. Add our "outside" call to it.
  return (inlines ?? []).concat([{ name, file, line }]);
}

// Look up `address` in the LineRange array, and return the line number
// and inline stack at that address.
// This function is part of the simulated symbolication API for testing.
function _getLineAndInlines(
  address: number,
  lineRanges?: LineRange[]
): { line?: number; inlines?: AddressInlineFrame[] } {
  if (!lineRanges) {
    return {};
  }

  // Every line range has a start address. Find the entry which covers `address`, by
  // walking the line ranges back-to-front. The first line range from the back which
  // includes our address is the right one.
  for (let j = lineRanges.length - 1; j >= 0; j--) {
    const lineRange = lineRanges[j];
    if (address >= lineRange.startAddress) {
      // We found the line range which covers this address.
      const { line, inlinedCall } = lineRange;

      // We now at which line the address was (at the current level of the inline stack).

      // If there is an inlinedCall covering this address, get the inline stack
      // at this address. This recurses.
      const inlines = _getInlinesRecursive(address, inlinedCall);

      // Return the line and the inlines.
      return { line, inlines };
    }
  }
  return {};
}

function _makeGetAddressResultFunction(
  syms: ExampleSymbolTableSymbols
): (address: number) => AddressResult | null {
  return function getAddressResult(address: number) {
    for (let i = syms.length - 1; i >= 0; i--) {
      const { address: symbolAddress, name, file, lineRanges } = syms[i];
      if (address >= symbolAddress) {
        // We found the right symbol. See if we can find a line number and inlines for this address.
        const { line, inlines } = _getLineAndInlines(address, lineRanges);
        return { name, symbolAddress, file, line, inlines };
      }
    }
    return null;
  };
}

// The example symbol table below contains information about lines and inline calls.
// To make the numbers and the nesting structure easier understand, here's some
// made up pseudo source code that could have produced the example symbol table.

// first_and_last.cpp:
//
// [...]
// 10:
// 11: int "first symbol"() {
// 12:   int x = 5 + 3;
// 13:   // The compiler inlined the call in the next line into this function.
// 14:   int y = "second symbol"(true);
// 15:   return x + y;
// 16: }
//
// second_and_third.rs:
//
// [...]
// 35:
// 36: fn "second symbol"(call_again: bool) -> i32 {
// 37:   let a = 123 * 45;
// 38:   let b = 5 * 432;
// 39:   // Recurse once. The compiler inlined this call, too.
// 40:   if (call_again) {
// 41:     b = "second symbol"(false);
// 42:     return b + a;
// 43:   }
// 44:
// 45:   let c = 15;
// 46:   let d = c * b;
// 47:
// 48:   d + a
// 49: }

// Assembly:

// first symbol:
// 0x0000 INSTR ; line 12
// 0x0004 INSTR ; line 12
// 0x0008 INSTR ; line 14 -> second symbol, line 37
// 0x000a INSTR ; line 14 -> second symbol, line 37
// 0x000c INSTR ; line 14 -> second symbol, line 39
// 0x0010 INSTR ; line 14 -> second symbol, line 41 -> second symbol, line 37
// 0x0014 INSTR ; line 14 -> second symbol, line 41 -> second symbol, line 46
// 0x0018 INSTR ; line 14 -> second symbol, line 41 -> second symbol, line 48
// 0x0020 INSTR ; line 15
// [...]
// second symbol:
// 0x0f00 INSTR
// [...]
// third symbol:
// 0x1a00 INSTR
// [..]
// last symbol:
// 0x2000 INSTR
// [...]

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
        inlinedCall: {
          name: 'second symbol',
          file: 'second_and_third.rs',
          lineRanges: [
            {
              startAddress: 0x8,
              line: 37,
            },
            {
              startAddress: 0xc,
              line: 38,
            },
            {
              startAddress: 0x10,
              line: 41,
              // Recursive call to the same function
              inlinedCall: {
                name: 'second symbol',
                file: 'second_and_third.rs',
                lineRanges: [
                  {
                    startAddress: 0x10,
                    line: 37,
                  },
                  {
                    startAddress: 0x14,
                    line: 46,
                  },
                  {
                    startAddress: 0x18,
                    line: 48,
                  },
                ],
              },
            },
          ],
        },
      },
      {
        startAddress: 0x20,
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
