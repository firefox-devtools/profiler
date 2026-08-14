/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { requestSymbols } from '../../profile-logic/mozilla-symbolication-api';
import type { LibSymbolicationRequest } from '../../profile-logic/symbol-store';

describe('requestSymbols', function () {
  const lib = { debugName: 'jit-52344.dump', breakpadId: 'DEADBEEF0' };

  function requestAddresses(
    addresses: number[],
    stacks: unknown[][]
  ): Promise<any> {
    const requests: LibSymbolicationRequest[] = [
      { lib, addresses: new Set(addresses) },
    ];
    return requestSymbols('test symbol server', requests, async () => ({
      results: [
        {
          found_modules: { 'jit-52344.dump/DEADBEEF0': true },
          stacks,
        },
      ],
    }));
  }

  it('parses the properties which describe a JS function that was JIT-compiled', async () => {
    // This is the shape of the response we get from samply for a frame in JIT
    // code for which it found a jitdump file: The function name, script URL and
    // function start position have been parsed out of the raw symbol name, and
    // we're told that this is a script function.
    const responses = await requestAddresses(
      [0x1a],
      [
        [
          {
            module_offset: '0x1a',
            module: 'jit-52344.dump',
            frame: 0,
            function: 'renderButton',
            symbol: 'Ion: renderButton (Button.tsx:40:16)',
            function_offset: '0x1a',
            function_size: '0x120',
            file: 'Button.tsx',
            line: 45,
            col: 12,
            function_start_line: 40,
            function_start_col: 16,
            is_script: true,
            inlines: [
              {
                function: 'useState',
                file: 'react.js',
                line: 100,
                col: 7,
                function_start_line: 98,
                function_start_col: 21,
                is_script: true,
              },
            ],
          },
        ],
      ]
    );

    expect(responses).toEqual([
      {
        type: 'SUCCESS',
        lib,
        results: new Map([
          [
            0x1a,
            {
              name: 'renderButton',
              symbolName: 'Ion: renderButton (Button.tsx:40:16)',
              symbolAddress: 0,
              file: 'Button.tsx',
              line: 45,
              column: 12,
              functionStartLine: 40,
              functionStartColumn: 16,
              isScript: true,
              functionSize: 0x120,
              inlines: [
                {
                  name: 'useState',
                  file: 'react.js',
                  line: 100,
                  column: 7,
                  functionStartLine: 98,
                  functionStartColumn: 21,
                  isScript: true,
                },
              ],
            },
          ],
        ]),
      },
    ]);
  });

  it('leaves the new properties undefined if the symbol server does not supply them', async () => {
    // Symbol servers which only deal with native code, e.g. the Mozilla
    // symbolication server, don't return any of the new properties.
    const responses = await requestAddresses(
      [0x20],
      [
        [
          {
            module_offset: '0x20',
            module: 'jit-52344.dump',
            frame: 0,
            function: 'DoSomething',
            function_offset: '0x8',
            file: 'something.cpp',
            line: 12,
          },
        ],
      ]
    );

    expect(responses[0].results.get(0x20)).toEqual({
      name: 'DoSomething',
      symbolName: undefined,
      symbolAddress: 0x18,
      file: 'something.cpp',
      line: 12,
      column: undefined,
      functionStartLine: undefined,
      functionStartColumn: undefined,
      isScript: undefined,
      inlines: undefined,
      functionSize: undefined,
    });
  });
});
