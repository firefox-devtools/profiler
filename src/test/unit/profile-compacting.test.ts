/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { computeCompactedProfile } from '../../profile-logic/profile-compacting';
import {
  getRawStackTableBuilderWithExistingContents,
  finishRawStackTableBuilder,
} from '../../profile-logic/data-structures';
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

    // The two stacks that pointed at frameB and frameC (now equivalent)
    // should have been collapsed into one.
    expect(compacted.shared.stackTable.length).toBe(2);

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

describe('computeCompactedProfile stack table deduplication', function () {
  it('collapses stacks with identical (prefix, frame)', function () {
    // Build a profile with two distinct stacks A->B and A->C.
    const { profile } = getProfileFromTextSamples(`
      A  A
      B  C
    `);

    const { shared } = profile;
    const { stackTable } = shared;
    // The helper builds stack 0 = [A], stack 1 = [A, B], stack 2 = [A, C].
    expect(stackTable.length).toBe(3);

    // Point the A->C stack at frame B so it becomes a (prefix, frame)
    // duplicate of the A->B stack.
    stackTable.frame[2] = stackTable.frame[1];

    const { profile: compacted } = computeCompactedProfile(profile);

    // The duplicate stack should be collapsed.
    expect(compacted.shared.stackTable.length).toBe(2);

    // Both samples now resolve under A->B in the call tree.
    expect(formatTree(callTreeFromProfile(compacted, 0))).toEqual([
      '- A (total: 2, self: —)',
      '  - B (total: 2, self: 2)',
    ]);
  });

  it('keeps stacks distinct when they have different prefixes', function () {
    // Build a profile with two siblings under different parents that
    // share the same leaf frame: A->C and B->C. They should not be deduped.
    const { profile } = getProfileFromTextSamples(`
      A  B
      C  C
    `);

    const { shared } = profile;
    expect(shared.stackTable.length).toBe(4);

    const { profile: compacted } = computeCompactedProfile(profile);

    // No dedup expected: every (prefix, frame) pair is unique.
    expect(compacted.shared.stackTable.length).toBe(4);
  });

  it('handles many unique siblings under one parent with duplicates mixed in', function () {
    // Exercises the degenerate fan-out case: a single parent with many
    // canonical children. Each canonical sibling is also duplicated, and
    // the duplicates are interleaved with other-parent stacks in arbitrary
    // order to defeat the lastUsed cache. The dedup pass still has to
    // produce the correct canonical mapping.
    const { profile } = getProfileFromTextSamples(`A`);
    const { shared, threads } = profile;
    const { frameTable, funcTable, stringArray } = shared;
    const stackTableBuilder = getRawStackTableBuilderWithExistingContents(
      shared.stackTable
    );

    const stackA = 0;

    // Create K unique sibling frames (and funcs) under stackA.
    const K = 50;
    const siblingFrames: number[] = [];
    for (let k = 0; k < K; k++) {
      const nameStringIndex = stringArray.length;
      stringArray.push(`fn${k}`);
      const funcIndex = funcTable.length;
      funcTable.name.push(nameStringIndex);
      funcTable.isJS.push(false);
      funcTable.relevantForJS.push(false);
      funcTable.resource.push(-1);
      funcTable.source.push(null);
      funcTable.lineNumber.push(null);
      funcTable.columnNumber.push(null);
      funcTable.length++;

      const frameIndex = frameTable.length;
      frameTable.address.push(-1);
      frameTable.inlineDepth.push(0);
      frameTable.category.push(null);
      frameTable.subcategory.push(null);
      frameTable.func.push(funcIndex);
      frameTable.nativeSymbol.push(null);
      frameTable.innerWindowID.push(0);
      frameTable.line.push(null);
      frameTable.column.push(null);
      frameTable.length++;
      siblingFrames.push(frameIndex);
    }

    // Insert canonical siblings in a non-monotonic order, then add a
    // duplicate of each in a different non-monotonic order so the lastUsed
    // cache is unlikely to be primed for either insert or duplicate match.
    const canonicalOrder = Array.from({ length: K }, (_, k) => (k * 7) % K);
    const duplicateOrder = Array.from({ length: K }, (_, k) => (k * 13) % K);

    const canonicalStackForFrame = new Map<number, number>();
    for (const k of canonicalOrder) {
      const stackIndex = stackTableBuilder.length;
      stackTableBuilder.frame.push(siblingFrames[k]);
      stackTableBuilder.prefix.push(stackA);
      stackTableBuilder.length++;
      canonicalStackForFrame.set(siblingFrames[k], stackIndex);
    }
    const duplicateIndices: number[] = [];
    for (const k of duplicateOrder) {
      const stackIndex = stackTableBuilder.length;
      stackTableBuilder.frame.push(siblingFrames[k]);
      stackTableBuilder.prefix.push(stackA);
      stackTableBuilder.length++;
      duplicateIndices.push(stackIndex);
    }
    shared.stackTable = finishRawStackTableBuilder(stackTableBuilder);

    // Reference every stack via samples so they all survive marking.
    const samples = threads[0].samples;
    const allStackIndices = [
      stackA,
      ...canonicalStackForFrame.values(),
      ...duplicateIndices,
    ];
    samples.stack = allStackIndices;
    samples.length = allStackIndices.length;
    samples.eventDelay = allStackIndices.map(() => 0);
    samples.time = allStackIndices.map((_, idx) => idx);

    const { profile: compacted } = computeCompactedProfile(profile);

    // After dedup: stackA + K unique sibling stacks = K + 1 stack nodes.
    expect(compacted.shared.stackTable.length).toBe(K + 1);

    // Every sample's stack should resolve to a valid node, and samples that
    // pointed at duplicates should now collide with the canonical sample
    // for that frame.
    const compactedSamples = compacted.threads[0].samples.stack;
    const newStackTable = compacted.shared.stackTable;
    for (const s of compactedSamples) {
      expect(s).not.toBeNull();
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(newStackTable.length);
    }

    // For each sibling frame, both the canonical sample (index 1+k in
    // allStackIndices) and the duplicate sample (index 1+K+k) should
    // resolve to the same compacted stack.
    for (let k = 0; k < K; k++) {
      const canonicalSampleIdx = 1 + canonicalOrder.indexOf(k);
      const duplicateSampleIdx = 1 + K + duplicateOrder.indexOf(k);
      expect(compactedSamples[canonicalSampleIdx]).toBe(
        compactedSamples[duplicateSampleIdx]
      );
    }
  });

  it('dedups transitively up a chain', function () {
    // After compacting we expect:
    //   stackA (=root)
    //   stackAB (prefix=stackA, frame=B)
    //   stackABC (prefix=stackAB, frame=C)
    // even if we duplicate the entire chain.
    const { profile } = getProfileFromTextSamples(`
      A
      B
      C
    `);

    const { shared, threads } = profile;
    expect(shared.stackTable.length).toBe(3);

    const stackA = 0;
    const stackAB = 1;
    const stackABC = 2;
    const frameB = shared.stackTable.frame[stackAB];
    const frameC = shared.stackTable.frame[stackABC];

    // Add duplicates of the AB and ABC chain that don't reuse the original
    // AB node — they share stackA but allocate fresh nodes for B and C.
    const stackTableBuilder = getRawStackTableBuilderWithExistingContents(
      shared.stackTable
    );
    const dupAB = stackTableBuilder.length;
    stackTableBuilder.frame.push(frameB);
    stackTableBuilder.prefix.push(stackA);
    stackTableBuilder.length++;

    const dupABC = stackTableBuilder.length;
    stackTableBuilder.frame.push(frameC);
    stackTableBuilder.prefix.push(dupAB);
    stackTableBuilder.length++;

    shared.stackTable = finishRawStackTableBuilder(stackTableBuilder);

    // Point the sample at the duplicate leaf so the duplicates are
    // reachable.
    threads[0].samples.stack[0] = dupABC;

    const { profile: compacted } = computeCompactedProfile(profile);

    // Both the dupAB and dupABC nodes should collapse onto the original
    // chain because dupAB has the same (prefix=stackA, frame=B) as the
    // original AB, and once that's redirected, dupABC's canonical prefix
    // matches the original AB so it collapses onto ABC.
    expect(compacted.shared.stackTable.length).toBe(3);
  });
});
