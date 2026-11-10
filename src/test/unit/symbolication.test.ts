/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { applySymbolicationSteps } from '../../profile-logic/symbolication';
import { FuncFlag } from 'firefox-profiler/types';

describe('applySymbolicationSteps', () => {
  it('uses original script flags when inline expansion recycles function slots', () => {
    const { profile } = getProfileFromTextSamples(`
      first[lib:jit.dump][address:a]  second[lib:jit.dump][address:20]
    `);
    const { shared } = applySymbolicationSteps(
      profile.threads,
      profile.shared,
      [
        {
          libSymbolicationInfo: {
            resourceIndex: 0,
            libIndex: 0,
            allFuncsForThisLib: new Set([0, 1]),
            allNativeSymbolsForThisLib: new Set(),
            allFramesForThisLib: [0, 1],
            frameAddresses: [0xa, 0x20],
          },
          resultsForLib: new Map([
            [
              0xa,
              {
                name: 'first',
                symbolAddress: 0,
                isScript: true,
                inlines: [
                  { name: 'inner' },
                  { name: 'inline', isScript: true },
                ],
              },
            ],
            [0x20, { name: 'second', symbolAddress: 0x20 }],
          ]),
        },
      ]
    );

    // The explicit script frames overwrite both original native func slots.
    // Frames without isScript must still inherit their original native flags,
    // including the innermost inline of the first frame.
    for (const name of ['inner', 'second']) {
      const func = shared.funcTable.name.indexOf(
        shared.stringArray.indexOf(name)
      );
      expect(func).not.toBe(-1);
      expect(
        shared.funcTable.flags[func] & (FuncFlag.IsJS | FuncFlag.RelevantForJS)
      ).toBe(0);
    }
  });

  it('keeps the function display name when re-symbolication omits an address', () => {
    const { profile } = getProfileFromTextSamples(`
      first[lib:jit.dump][address:a]
    `);
    const libSymbolicationInfo = {
      resourceIndex: 0,
      libIndex: 0,
      allFuncsForThisLib: new Set([0]),
      allNativeSymbolsForThisLib: new Set<number>(),
      allFramesForThisLib: [0],
      frameAddresses: [0xa],
    };
    const symbolName = 'Ion: first (app.js:1:1)';
    const first = applySymbolicationSteps(profile.threads, profile.shared, [
      {
        libSymbolicationInfo,
        resultsForLib: new Map([
          [
            0xa,
            {
              name: 'first',
              symbolName,
              symbolAddress: 0,
              isScript: true,
              file: 'app.js',
              functionStartLine: 1,
              functionStartColumn: 1,
              line: 3,
              column: 4,
            },
          ],
        ]),
      },
    ]);
    const { shared } = applySymbolicationSteps(first.threads, first.shared, [
      {
        libSymbolicationInfo: {
          ...libSymbolicationInfo,
          allNativeSymbolsForThisLib: new Set([0]),
        },
        resultsForLib: new Map(),
      },
    ]);

    const func = shared.frameTable.func[0];
    const symbol = shared.frameTable.nativeSymbol[0];
    expect(shared.stringArray[shared.funcTable.name[func]]).toBe('first');
    expect(shared.stringArray[shared.nativeSymbols.name[symbol]]).toBe(
      symbolName
    );
    expect(shared.funcTable.flags[func]).toBe(first.shared.funcTable.flags[0]);
    expect(shared.funcTable.lineNumber[func]).toBe(1);
    expect(shared.funcTable.columnNumber[func]).toBe(1);
    expect(shared.frameTable.line[0]).toBe(3);
    expect(shared.frameTable.column[0]).toBe(4);
    expect(
      shared.stringArray[shared.sources.filename[shared.funcTable.source[func]]]
    ).toBe('app.js');
  });
});
