import { TextEncoder } from 'text-encoding';
import type { SymbolTableAsTuple } from '../../content/symbol-store-db';

const syms = {
  addresses: [0, 0xf00, 0x1a00, 0x2000],
  symbols: ['first symbol', 'second symbol', 'third symbol', 'last symbol'],
};

const index = [0];
let accum = 0;
for (const sym of syms.symbols) {
  accum += sym.length;
  index.push(accum);
}

const symbolTable: SymbolTableAsTuple = [
  new Uint32Array(syms.addresses),
  new Uint32Array(index),
  new TextEncoder().encode(syms.symbols.join('')),
];

export default symbolTable;
