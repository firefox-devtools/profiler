/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { splitCommandLine } from '../../repl';

describe('splitCommandLine', function () {
  it('splits on runs of whitespace', function () {
    expect(splitCommandLine('  thread   samples\t--limit 5 ')).toEqual([
      'thread',
      'samples',
      '--limit',
      '5',
    ]);
  });

  it('returns no arguments for an empty line', function () {
    expect(splitCommandLine('   ')).toEqual([]);
  });

  it('keeps quoted whitespace and joins adjacent quoted parts', function () {
    expect(
      splitCommandLine(`thread samples-top-down --search "JS::Compile x"`)
    ).toEqual(['thread', 'samples-top-down', '--search', 'JS::Compile x']);
    expect(splitCommandLine(`a'b c'"d e"f`)).toEqual(['ab cd ef']);
  });

  it('keeps empty quoted arguments', function () {
    expect(splitCommandLine(`--search '' ""`)).toEqual(['--search', '', '']);
  });

  it('handles backslash escapes', function () {
    expect(splitCommandLine(String.raw`a\ b "c\"d" "e\f" 'g\h'`)).toEqual([
      'a b',
      'c"d',
      String.raw`e\f`,
      String.raw`g\h`,
    ]);
  });

  it('throws on unterminated quotes and trailing backslashes', function () {
    expect(() => splitCommandLine(`"abc`)).toThrow('Unterminated double quote');
    expect(() => splitCommandLine(`'abc`)).toThrow('Unterminated single quote');
    expect(() => splitCommandLine(`abc\\`)).toThrow('Trailing backslash');
  });
});
