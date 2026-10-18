/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { applySymbolicationSteps } from '../../profile-logic/symbolication';
import { FuncFlag, ResourceType } from 'firefox-profiler/types';
import type {
  Address,
  RawProfileSharedData,
  RawThread,
} from 'firefox-profiler/types';
import type { AddressResult } from '../../profile-logic/symbol-store';

describe('applySymbolicationSteps', () => {
  it('uses original script flags when inline expansion recycles function slots', () => {
    const { profile } = getProfileFromTextSamples(`
      first[lib:jit.dump][address:a]  second[lib:jit.dump][address:20]
    `);
    const { shared } = applySymbolicationSteps(
      profile.threads,
      profile.shared,
      undefined,
      [
        {
          libSymbolicationInfo: {
            libName: 'jit.dump',
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

  it('does not mutate the sources table of the input', () => {
    const { profile } = getProfileFromTextSamples(`
      first[lib:libxul.so][address:a]
    `);
    const oldSources = profile.shared.sources;
    const oldSourcesCopy = JSON.parse(JSON.stringify(oldSources));
    const { shared } = applySymbolicationSteps(
      profile.threads,
      profile.shared,
      undefined,
      [
        {
          libSymbolicationInfo: {
            libName: 'libxul.so',
            libIndex: 0,
            allFuncsForThisLib: new Set([0]),
            allNativeSymbolsForThisLib: new Set(),
            allFramesForThisLib: [0],
            frameAddresses: [0xa],
          },
          resultsForLib: new Map([
            [0xa, { name: 'first', symbolAddress: 0, file: 'first.cpp' }],
          ]),
        },
      ]
    );

    expect(oldSources).toEqual(oldSourcesCopy);
    expect(shared.sources).not.toBe(oldSources);
    expect(shared.sources.length).toBe(oldSources.length + 1);
    expect(shared.stringArray[shared.sources.filename[oldSources.length]]).toBe(
      'first.cpp'
    );
  });

  it('keeps the function display name when re-symbolication omits an address', () => {
    const { profile } = getProfileFromTextSamples(`
      first[lib:jit.dump][address:a]
    `);
    const libSymbolicationInfo = {
      libName: 'jit.dump',
      libIndex: 0,
      allFuncsForThisLib: new Set([0]),
      allNativeSymbolsForThisLib: new Set<number>(),
      allFramesForThisLib: [0],
      frameAddresses: [0xa],
    };
    const symbolName = 'Ion: first (app.js:1:1)';
    const first = applySymbolicationSteps(
      profile.threads,
      profile.shared,
      undefined,
      [
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
      ]
    );
    const { shared } = applySymbolicationSteps(
      first.threads,
      first.shared,
      undefined,
      [
        {
          libSymbolicationInfo: {
            ...libSymbolicationInfo,
            allNativeSymbolsForThisLib: new Set([0]),
          },
          resultsForLib: new Map(),
        },
      ]
    );

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

  it('gives new native funcs the library resource for the lib name', () => {
    const { profile } = getProfileFromTextSamples(`
      first[lib:jit.dump][address:a]
    `);
    const oldResources = profile.shared.resourceTable;
    // Make the existing func use a resource that isn't the library resource,
    // so that we can check that the library resource is found by name rather
    // than taken from the existing funcs.
    const otherResource = oldResources.length;
    profile.shared.resourceTable = {
      length: oldResources.length + 1,
      name: [...oldResources.name, profile.shared.stringArray.length],
      host: [...oldResources.host, null],
      type: [...oldResources.type, ResourceType.Url],
    };
    profile.shared.stringArray.push('https://example.com/app.js');
    profile.shared.funcTable.resource[0] = otherResource;

    const { shared } = applySymbolicationSteps(
      profile.threads,
      profile.shared,
      undefined,
      [
        {
          libSymbolicationInfo: {
            libName: 'jit.dump',
            libIndex: 0,
            allFuncsForThisLib: new Set([0]),
            allNativeSymbolsForThisLib: new Set(),
            allFramesForThisLib: [0],
            frameAddresses: [0xa],
          },
          resultsForLib: new Map([[0xa, { name: 'first', symbolAddress: 0 }]]),
        },
      ]
    );

    const { resourceTable, stringArray } = shared;
    const resource = shared.funcTable.resource[shared.frameTable.func[0]];
    expect(resourceTable.length).toBe(profile.shared.resourceTable.length);
    expect(resourceTable.type[resource]).toBe(ResourceType.Library);
    expect(stringArray[resourceTable.name[resource]]).toBe('jit.dump');
  });

  describe('resources of script funcs', () => {
    const extensions = {
      baseURL: ['moz-extension://abcd-1234/'],
      id: ['ext@example.com'],
      name: ['Example Extension'],
      length: 1,
    };

    function symbolicate(
      threads: RawThread[],
      shared: RawProfileSharedData,
      results: Array<[Address, AddressResult]>
    ) {
      return applySymbolicationSteps(threads, shared, extensions, [
        {
          libSymbolicationInfo: {
            libName: 'jit.dump',
            libIndex: 0,
            allFuncsForThisLib: new Set(
              [0, 1, 2].map((frame) => shared.frameTable.func[frame])
            ),
            allNativeSymbolsForThisLib: new Set(
              Array.from({ length: shared.nativeSymbols.length }, (_, i) => i)
            ),
            allFramesForThisLib: [0, 1, 2],
            frameAddresses: [0xa, 0x20, 0x30],
          },
          resultsForLib: new Map(results),
        },
      ]);
    }

    function getResource(shared: RawProfileSharedData, frame: number) {
      const { resourceTable, stringArray, funcTable, frameTable } = shared;
      const resource = funcTable.resource[frameTable.func[frame]];
      return {
        type: resourceTable.type[resource],
        name: stringArray[resourceTable.name[resource]],
      };
    }

    function setup() {
      const { profile } = getProfileFromTextSamples(`
        a[lib:jit.dump][address:a]
        b[lib:jit.dump][address:20]
        c[lib:jit.dump][address:30]
      `);
      return profile;
    }

    it('gives script funcs the resource for their URL', () => {
      const profile = setup();
      const { shared } = symbolicate(profile.threads, profile.shared, [
        [
          0xa,
          {
            name: 'onLoad',
            symbolAddress: 0xa,
            isScript: true,
            file: 'https://example.com/app.js',
            inlines: [{ name: 'nativeInline', isScript: false }],
          },
        ],
        [
          0x20,
          {
            name: 'onMessage',
            symbolAddress: 0x20,
            isScript: true,
            file: 'chrome://browser/content/b.js',
          },
        ],
        [
          0x30,
          {
            name: 'onClick',
            symbolAddress: 0x30,
            isScript: true,
            file: 'moz-extension://abcd-1234/background.js',
          },
        ],
      ]);

      expect(getResource(shared, 0)).toEqual({
        type: ResourceType.Webhost,
        name: 'https://example.com',
      });
      expect(getResource(shared, 1)).toEqual({
        type: ResourceType.Url,
        name: 'chrome://browser/content/b.js',
      });
      expect(getResource(shared, 2)).toEqual({
        type: ResourceType.Addon,
        name: 'Extension "Example Extension" (ID: ext@example.com)',
      });

      // The inlined native function keeps the library resource.
      const inlineFunc = shared.funcTable.name.indexOf(
        shared.stringArray.indexOf('nativeInline')
      );
      const inlineResource = shared.funcTable.resource[inlineFunc];
      expect(shared.resourceTable.type[inlineResource]).toBe(
        ResourceType.Library
      );
      expect(
        shared.stringArray[shared.resourceTable.name[inlineResource]]
      ).toBe('jit.dump');
    });

    it('reuses existing resources', () => {
      const profile = setup();
      const results: Array<[Address, AddressResult]> = [
        [
          0xa,
          {
            name: 'onLoad',
            symbolAddress: 0xa,
            isScript: true,
            file: 'https://example.com/app.js',
          },
        ],
        [
          0x20,
          {
            name: 'onClick',
            symbolAddress: 0x20,
            isScript: true,
            file: 'moz-extension://abcd-1234/background.js',
          },
        ],
      ];
      const first = symbolicate(profile.threads, profile.shared, results);
      const second = symbolicate(first.threads, first.shared, results);
      expect(second.shared.resourceTable).toEqual(first.shared.resourceTable);
    });

    it('gives native funcs the library resource when re-symbolicating script funcs', () => {
      const profile = setup();
      const first = symbolicate(profile.threads, profile.shared, [
        [
          0xa,
          {
            name: 'onLoad',
            symbolAddress: 0xa,
            isScript: true,
            file: 'https://example.com/app.js',
          },
        ],
      ]);
      const { shared } = symbolicate(first.threads, first.shared, [
        [0xa, { name: 'NativeFunction', symbolAddress: 0xa }],
      ]);
      expect(getResource(shared, 0)).toEqual({
        type: ResourceType.Library,
        name: 'jit.dump',
      });
    });
  });
});
