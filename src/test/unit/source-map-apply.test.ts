/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { applySourceMapSymbolicationResponse } from '../../profile-logic/source-maps/symbolication';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/types';
import type { RawProfileSharedData } from 'firefox-profiler/types';
import type {
  FuncResolution,
  OriginalSource,
} from '../../profile-logic/source-maps/worker-types';

describe('applySourceMapSymbolicationResponse', function () {
  // Apply a response that resolves each func in `funcs` to the given entry
  // of `originalSources`.
  function apply(
    shared: RawProfileSharedData,
    originalSources: OriginalSource[],
    funcs: Array<[funcIndex: number, originalSourceIndex: number]>
  ): RawProfileSharedData {
    const funcResults = new Map<number, FuncResolution>(
      funcs.map(([funcIndex, originalSourceIndex]) => [
        funcIndex,
        { originalSourceIndex, originalLine: 1, originalColumn: 1, name: null },
      ])
    );
    const result = ensureExists(
      applySourceMapSymbolicationResponse(shared, {
        funcResults,
        frameResults: new Map(),
        originalSources,
      })
    );
    return {
      ...shared,
      funcTable: result.newFuncTable,
      frameTable: result.newFrameTable,
      sourceLocationTable: result.newSourceLocationTable,
      sources: result.newSources,
      stringArray: result.newStringArray,
    };
  }

  function getOriginalSource(shared: RawProfileSharedData, funcIndex: number) {
    const row = shared.funcTable.originalLocation[funcIndex];
    return shared.sourceLocationTable.source[row];
  }

  it('adds one source per original source of the response', function () {
    // A and B are in bundle.js, C is in other.js.
    const { profile } = getProfileFromTextSamples(
      'A[file:bundle.js]  B[file:bundle.js]  C[file:other.js]'
    );
    const bundle = profile.shared.funcTable.source[0];
    const other = profile.shared.funcTable.source[2];
    const url = '../src/hello.js';

    const shared = apply(
      profile.shared,
      [
        { generatedSource: bundle, url, content: 'content' },
        { generatedSource: other, url, content: 'content' },
      ],
      [
        [0, 0],
        [1, 0],
        [2, 1],
      ]
    );

    expect(shared.sources.length).toBe(profile.shared.sources.length + 2);
    const sourceA = getOriginalSource(shared, 0);
    expect(getOriginalSource(shared, 1)).toBe(sourceA);
    expect(getOriginalSource(shared, 2)).not.toBe(sourceA);
    expect(shared.sources.generatedSource[sourceA]).toBe(bundle);
    expect(shared.stringArray[shared.sources.filename[sourceA]]).toBe(url);
  });

  it('adds no source for results that an earlier run applied', function () {
    // A is in bundle.js, B is in other.js.
    const { profile } = getProfileFromTextSamples(
      'A[file:bundle.js]  B[file:other.js]'
    );
    const bundle = profile.shared.funcTable.source[0];
    const other = profile.shared.funcTable.source[1];
    const bundleSource: OriginalSource = {
      generatedSource: bundle,
      url: '../src/hello.js',
      content: null,
    };
    const otherSource: OriginalSource = {
      generatedSource: other,
      url: '../src/world.js',
      content: null,
    };

    // The first run resolves A. The second run resolves both, but A's
    // result is skipped because A already has an original location.
    const first = apply(profile.shared, [bundleSource], [[0, 0]]);
    const second = apply(
      first,
      [bundleSource, otherSource],
      [
        [0, 0],
        [1, 1],
      ]
    );

    expect(second.sources.length).toBe(first.sources.length + 1);
    expect(getOriginalSource(second, 0)).toBe(getOriginalSource(first, 0));
    expect(second.sources.generatedSource[getOriginalSource(second, 1)]).toBe(
      other
    );
  });
});
