/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { computeMinimalUniquePathTails } from '../../utils/minimal-paths';

describe('Unique minimal paths', function () {
  it('passes basic tests', function () {
    expect(computeMinimalUniquePathTails([])).toEqual([]);
    expect(computeMinimalUniquePathTails(['mod.rs'])).toEqual(['mod.rs']);
    expect(computeMinimalUniquePathTails(['hello/mod.rs'])).toEqual(['mod.rs']);

    expect(
      computeMinimalUniquePathTails(['hello/mod.rs', 'world/index.rs'])
    ).toEqual(['mod.rs', 'index.rs']);

    expect(
      computeMinimalUniquePathTails(['hello/mod.rs', 'world/mod.rs'])
    ).toEqual(['hello/mod.rs', 'world/mod.rs']);

    expect(
      computeMinimalUniquePathTails([
        'fully/subsumed/hello/mod.rs',
        'hello/mod.rs',
      ])
    ).toEqual(['subsumed/hello/mod.rs', 'hello/mod.rs']);

    expect(
      computeMinimalUniquePathTails([
        'yippie/wave/hello/mod.rs',
        'render/hello/gl.rs',
        'render/hello/mod.rs',
        'render/hello/fun.rs',
        'wobble/wave/hello/mod.rs',
        'wobble/render/hello/fun.rs',
        'yippie/render/hello.rs',
        'yippie/render/hello.rs',
        'yippie/render/hello2.rs',
      ])
    ).toEqual([
      'yippie/wave/hello/mod.rs',
      'gl.rs',
      'render/hello/mod.rs',
      'render/hello/fun.rs',
      'wobble/wave/hello/mod.rs',
      'wobble/render/hello/fun.rs',
      'yippie/render/hello.rs',
      'yippie/render/hello.rs',
      'hello2.rs',
    ]);
  });

  it('can deal with mixed path separators', function () {
    expect(
      computeMinimalUniquePathTails([
        'yippie/wave/hello\\mod.rs',
        'render\\hello\\gl.rs',
        'render/hello/mod.rs',
        'render\\hello/fun.rs',
      ])
    ).toEqual(['hello\\mod.rs', 'gl.rs', 'hello/mod.rs', 'fun.rs']);
  });
});
