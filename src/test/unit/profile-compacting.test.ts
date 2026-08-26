/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { computeCompactedProfile } from '../../profile-logic/profile-compacting';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

describe('computeCompactedProfile', function () {
  // Every column whose format type allows a typed array should come out of
  // compaction as a typed array of the expected kind, no matter whether the
  // input column was a plain array or a typed array. See the "can now
  // optionally be stored as typed arrays" lists in CHANGELOG-formats.md.
  it('stores all typed-array-eligible columns as typed arrays', function () {
    const { profile } = getProfileFromTextSamples(`
      A[lib:libxul.so]  A[lib:libxul.so]  A[lib:libxul.so]
      B[cat:Layout]     B[cat:Layout]     C[cat:JavaScript]
                        D                 E
    `);

    const { profile: compacted } = computeCompactedProfile(profile);
    const { stackTable, frameTable } = compacted.shared;

    expect(stackTable.frame).toBeInstanceOf(Int32Array);
    expect(stackTable.prefixOffset).toBeInstanceOf(Int32Array);

    expect(frameTable.flags).toBeInstanceOf(Uint8Array);
    expect(frameTable.address).toBeInstanceOf(Uint32Array);
    expect(frameTable.category).toBeInstanceOf(Uint8Array);
    expect(frameTable.subcategory).toBeInstanceOf(Uint8Array);
    expect(frameTable.func).toBeInstanceOf(Int32Array);
    expect(frameTable.lib).toBeInstanceOf(Int32Array);
    expect(frameTable.nativeSymbol).toBeInstanceOf(Int32Array);
    expect(frameTable.innerWindowID).toBeInstanceOf(Float64Array);
    expect(frameTable.line).toBeInstanceOf(Int32Array);
    expect(frameTable.column).toBeInstanceOf(Int32Array);
    expect(frameTable.originalLocation).toBeInstanceOf(Int32Array);
  });

  it('does not change the category values when narrowing the columns', function () {
    // The column positions of the first line determine the columns of all
    // lines, so these need to stay aligned.
    const { profile } = getProfileFromTextSamples(`
      A[cat:Layout]      A[cat:Layout]
      B[cat:JavaScript]  C[cat:Graphics]
    `);

    const before = profile.shared.frameTable;
    const beforeCategory = Array.from(before.category);
    const beforeSubcategory = Array.from(before.subcategory);

    // Guard against a fixture where every category happens to be 0, which
    // would make the comparison below pass for the wrong reason.
    expect(new Set(beforeCategory).size).toBeGreaterThan(1);

    const { profile: compacted } = computeCompactedProfile(profile);
    const after = compacted.shared.frameTable;

    // Every frame is still referenced, so no rows are dropped and the columns
    // should match element for element.
    expect(after.length).toBe(before.length);
    expect(Array.from(after.category)).toEqual(beforeCategory);
    expect(Array.from(after.subcategory)).toEqual(beforeSubcategory);
  });
});
