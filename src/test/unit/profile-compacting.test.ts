/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { computeCompactedProfile } from '../../profile-logic/profile-compacting';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { callTreeFromProfile, formatTree } from '../fixtures/utils';

describe('computeCompactedProfile frame deduplication', function () {
  it('collapses identical rows in the frame table into a single row', function () {
    // Start from a profile that has different B and C frames.
    const {
      profile,
      funcNamesDictPerThread: [funcNamesDict],
    } = getProfileFromTextSamples(`
      A  A
      B  C
    `);

    const { shared } = profile;
    const { frameTable } = shared;

    const { B, C } = funcNamesDict;
    expect(frameTable.length).toBe(3);
    const frameC = frameTable.func.indexOf(C);

    // Make frameC a duplicate of frameB.
    frameTable.func[frameC] = B;

    const { profile: compacted } = computeCompactedProfile(profile);

    // The unused func C should have been removed.
    expect(compacted.shared.funcTable.length).toBe(2);

    // The duplicate frame should have been collapsed.
    expect(compacted.shared.frameTable.length).toBe(2);

    // The duplicate stacks should have been collapsed.
    expect(compacted.shared.frameTable.length).toBe(2);

    const callTree = callTreeFromProfile(profile, /* threadIndex */ 0);
    const formattedTree = formatTree(callTree);
    expect(formattedTree).toEqual([
      '- A (total: 2, self: —)',
      '  - B (total: 2, self: 2)',
    ]);
  });

  it('keeps frames distinct when they differ in any column', function () {
    // Start from a profile that has different B and C frames.
    const {
      profile,
      funcNamesDictPerThread: [funcNamesDict],
    } = getProfileFromTextSamples(`
      A            A
      B[line:100]  C[line:123]
    `);

    const { shared } = profile;
    const { frameTable } = shared;

    const { B, C } = funcNamesDict;
    expect(frameTable.length).toBe(3);
    const frameB = frameTable.func.indexOf(B);
    const frameC = frameTable.func.indexOf(C);

    // Make frameC almost a duplicate of frameB. It still has a different line though.
    frameTable.func[frameC] = frameTable.func[frameB];

    const { profile: compacted1 } = computeCompactedProfile(profile);

    // Differing line means we keep both frames.
    expect(compacted1.shared.frameTable.length).toBe(3);

    // Now make the lines match, too.
    frameTable.line[frameC] = frameTable.line[frameB];

    const { profile: compacted2 } = computeCompactedProfile(profile);

    // Lines now match, so deduplication should kick in.
    expect(compacted2.shared.frameTable.length).toBe(2);
  });
});
