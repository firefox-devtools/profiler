/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Verifies that the source-map worker spawn is mocked at the build/test-infra
// level (via src/test/setup.ts). Without this mock, dispatching
// doSourceMapSymbolication with non-empty maps would attempt to load the
// nonexistent /source-map.worker.js bundle, throw ENOENT inside the worker
// thread, and leave the dispatched Promise hanging until Jest's per-test
// timeout fires.

import { doSourceMapSymbolication } from '../../actions/source-map-symbolication';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import type { RawSourceMap } from 'source-map';

describe('source map worker stub', function () {
  it('does not hang when doSourceMapSymbolication is dispatched with a non-empty map', async function () {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch } = storeWithProfile(profile);
    const fakeMap: RawSourceMap = {
      version: 3,
      file: 'a.js',
      sources: ['a.ts'],
      names: [],
      mappings: '',
    };

    // Without the worker mock, this dispatch never resolves. The stub worker
    // responds with { type: 'no-op' } so the dispatch finishes cleanly,
    // resolving to 'no-match'.
    await expect(
      dispatch(
        doSourceMapSymbolication(
          new Map([[0, fakeMap]]),
          new Map([[0, 'function a(){}\n']])
        )
      )
    ).resolves.toBe('no-match');
  });
});
