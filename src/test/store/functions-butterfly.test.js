/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';

import { selectedThreadSelectors } from '../../selectors/per-thread';

describe('getRunningTimesByFuncOrdered', function() {
  it('works on a simple tree', () => {
    const {
      profile,
      funcNamesDictPerThread: [{ A, B, C, D, E }],
    } = getProfileFromTextSamples(`
      A  A  A  A  E
      B  B  B  C  C
      C  C     D  D
    `);

    const { getState } = storeWithProfile(profile);
    const functionsList = selectedThreadSelectors.getRunningTimesByFuncOrdered(
      getState()
    );

    expect(functionsList).toEqual([
      { funcIndex: A, count: 4 },
      { funcIndex: C, count: 4 },
      { funcIndex: B, count: 3 },
      { funcIndex: D, count: 2 },
      { funcIndex: E, count: 1 },
    ]);
  });

  it('works on a tree with direct recursive functions', function() {
    const {
      profile,
      funcNamesDictPerThread: [{ A, B, C }],
    } = getProfileFromTextSamples(`
      A  A  A  A
      B  B  B  C
      C  B     B
    `);

    const { getState } = storeWithProfile(profile);
    const functionsList = selectedThreadSelectors.getRunningTimesByFuncOrdered(
      getState()
    );

    expect(functionsList).toEqual([
      { funcIndex: A, count: 4 },
      { funcIndex: B, count: 4 },
      { funcIndex: C, count: 2 },
    ]);
  });

  it('works on a tree with indirect recursive functions', function() {
    const {
      profile,
      funcNamesDictPerThread: [{ A, B, C }],
    } = getProfileFromTextSamples(`
      A  A  A  A
      B  B  B  C
      C  C     B
      C  B     B
    `);

    const { getState } = storeWithProfile(profile);
    const functionsList = selectedThreadSelectors.getRunningTimesByFuncOrdered(
      getState()
    );

    expect(functionsList).toEqual([
      { funcIndex: A, count: 4 },
      { funcIndex: B, count: 4 },
      { funcIndex: C, count: 3 },
    ]);
  });
});
