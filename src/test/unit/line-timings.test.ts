/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  getStackLineInfo,
  getStackLineInfoForCallNode,
  getLineTimings,
} from 'firefox-profiler/profile-logic/line-timings';
import {
  getCallNodeInfo,
  getInvertedCallNodeInfo,
} from '../../profile-logic/profile-data';
import { ensureExists } from 'firefox-profiler/utils/flow';
import type {
  CallNodePath,
  Thread,
  IndexIntoCategoryList,
} from 'firefox-profiler/types';

describe('getStackLineInfo', function () {
  it('computes results for all stacks', function () {
    const { derivedThreads } = getProfileFromTextSamples(`
      A[file:one.js][line:20]  A[file:one.js][line:21]  A[file:one.js][line:20]
      B[file:one.js][line:30]  B[file:one.js][line:30]  B[file:one.js][line:30]
      C[file:two.js][line:10]  C[file:two.js][line:11]  D[file:two.js][line:40]
      B[file:one.js][line:30]                           D[file:two.js][line:40]
    `);
    const [thread] = derivedThreads;
    const { stackTable, frameTable, funcTable, stringTable } = thread;

    const fileOne = stringTable.indexForString('one.js');
    const stackLineInfoOne = getStackLineInfo(
      stackTable,
      frameTable,
      funcTable,
      fileOne
    );

    // Expect the returned arrays to have the same length as the stackTable.
    expect(stackTable.length).toBe(9);
    expect(stackLineInfoOne.selfLine.length).toBe(9);
    expect(stackLineInfoOne.stackLines.length).toBe(9);
  });
});

describe('getLineTimings for getStackLineInfo', function () {
  function getTimings(thread: Thread, file: string) {
    const { stackTable, frameTable, funcTable, samples, stringTable } = thread;
    const fileStringIndex = stringTable.indexForString(file);
    const stackLineInfo = getStackLineInfo(
      stackTable,
      frameTable,
      funcTable,
      fileStringIndex
    );
    return getLineTimings(stackLineInfo, samples);
  }

  it('passes a basic test', function () {
    // In this example, there's one self line hit in line 30.
    // Both line 20 and line 30 have one total time hit.
    const { derivedThreads } = getProfileFromTextSamples(`
      A[file:file.js][line:20]
      B[file:file.js][line:30]
    `);
    const [thread] = derivedThreads;
    const lineTimings = getTimings(thread, 'file.js');
    expect(lineTimings.totalLineHits.get(20)).toBe(1);
    expect(lineTimings.totalLineHits.get(30)).toBe(1);
    expect(lineTimings.totalLineHits.size).toBe(2); // no other hits
    expect(lineTimings.selfLineHits.get(20)).toBe(undefined);
    expect(lineTimings.selfLineHits.get(30)).toBe(1);
    expect(lineTimings.selfLineHits.size).toBe(1); // no other hits
  });

  it('passes a test with two files and recursion', function () {
    const { derivedThreads } = getProfileFromTextSamples(`
      A[file:one.js][line:20]  A[file:one.js][line:21]  A[file:one.js][line:20]
      B[file:one.js][line:30]  B[file:one.js][line:30]  B[file:one.js][line:30]
      C[file:two.js][line:10]  C[file:two.js][line:11]  D[file:two.js][line:40]
      B[file:one.js][line:30]                           D[file:two.js][line:40]
    `);
    const [thread] = derivedThreads;

    const lineTimingsOne = getTimings(thread, 'one.js');
    expect(lineTimingsOne.totalLineHits.get(20)).toBe(2);
    expect(lineTimingsOne.totalLineHits.get(21)).toBe(1);
    // one.js line 30 was hit in every sample, twice in the first sample
    // (due to recursion) but that still only counts as one sample
    expect(lineTimingsOne.totalLineHits.get(30)).toBe(3);
    expect(lineTimingsOne.totalLineHits.size).toBe(3); // no other hits
    // The only self line hit in one.js is in the first sample.
    // The other two samples have tehir self line hit in two.js.
    expect(lineTimingsOne.selfLineHits.get(20)).toBe(undefined);
    expect(lineTimingsOne.selfLineHits.get(21)).toBe(undefined);
    expect(lineTimingsOne.selfLineHits.get(30)).toBe(1);
    expect(lineTimingsOne.selfLineHits.size).toBe(1); // no other hits

    const lineTimingsTwo = getTimings(thread, 'two.js');
    expect(lineTimingsTwo.totalLineHits.get(10)).toBe(1);
    expect(lineTimingsTwo.totalLineHits.get(11)).toBe(1);
    expect(lineTimingsTwo.totalLineHits.get(40)).toBe(1);
    expect(lineTimingsTwo.totalLineHits.size).toBe(3); // no other hits
    expect(lineTimingsTwo.selfLineHits.get(10)).toBe(undefined);
    expect(lineTimingsTwo.selfLineHits.get(11)).toBe(1);
    // two.js line 40 recursed but should only be counted as 1 sample
    expect(lineTimingsTwo.selfLineHits.get(40)).toBe(1);
    expect(lineTimingsTwo.selfLineHits.size).toBe(2); // no other hits
  });
});

describe('getLineTimings for getStackLineInfoForCallNode', function () {
  function getTimings(
    thread: Thread,
    callNodePath: CallNodePath,
    defaultCategory: IndexIntoCategoryList,
    isInverted: boolean
  ) {
    const { stackTable, frameTable, funcTable, samples } = thread;
    const nonInvertedCallNodeInfo = getCallNodeInfo(
      stackTable,
      frameTable,
      defaultCategory
    );
    const callNodeInfo = isInverted
      ? getInvertedCallNodeInfo(
          nonInvertedCallNodeInfo,
          defaultCategory,
          funcTable.length
        )
      : nonInvertedCallNodeInfo;
    const callNodeIndex = ensureExists(
      callNodeInfo.getCallNodeIndexFromPath(callNodePath),
      'invalid call node path'
    );
    const stackLineInfo = getStackLineInfoForCallNode(
      stackTable,
      frameTable,
      callNodeIndex,
      callNodeInfo
    );
    return getLineTimings(stackLineInfo, samples);
  }

  it('passes a basic test', function () {
    const { derivedThreads, funcNamesDictPerThread, defaultCategory } =
      getProfileFromTextSamples(`
      A[file:file.js][line:20]
      B[file:file.js][line:30]
    `);

    const [{ A, B }] = funcNamesDictPerThread;
    const [thread] = derivedThreads;

    // Compute the line timings for the root call node.
    // No self line hit, one total line hit in line 20.
    const lineTimingsRoot = getTimings(thread, [A], defaultCategory, false);
    expect(lineTimingsRoot.totalLineHits.get(20)).toBe(1);
    expect(lineTimingsRoot.totalLineHits.size).toBe(1); // no other hits
    expect(lineTimingsRoot.selfLineHits.size).toBe(0); // no self hits

    // Compute the line timings for the child call node.
    // One self line hit in line 30, which is also the only total line hit.
    const lineTimingsChild = getTimings(thread, [A, B], defaultCategory, false);
    expect(lineTimingsChild.totalLineHits.get(30)).toBe(1);
    expect(lineTimingsChild.totalLineHits.size).toBe(1); // no other hits
    expect(lineTimingsChild.selfLineHits.get(30)).toBe(1);
    expect(lineTimingsChild.selfLineHits.size).toBe(1); // no other hits
  });

  it('passes a basic test with recursion', function () {
    const { derivedThreads, funcNamesDictPerThread, defaultCategory } =
      getProfileFromTextSamples(`
      A[file:file.js][line:20]
      B[file:file.js][line:30]
      A[file:file.js][line:21]
    `);

    const [{ A, B }] = funcNamesDictPerThread;
    const [thread] = derivedThreads;

    // Compute the line timings for the root call node.
    // No self line hit, one total line hit in line 20.
    const lineTimingsRoot = getTimings(thread, [A], defaultCategory, false);
    expect(lineTimingsRoot.totalLineHits.get(20)).toBe(1);
    expect(lineTimingsRoot.totalLineHits.size).toBe(1); // no other hits
    expect(lineTimingsRoot.selfLineHits.size).toBe(0); // no self hits

    // Compute the line timings for the leaf call node.
    // One self line hit in line 21, which is also the only total line hit.
    // In particular, we shouldn't record a hit for line 20, even though
    // the hit at line 20 is also in A. But it's in the wrong call node.
    const lineTimingsChild = getTimings(
      thread,
      [A, B, A],
      defaultCategory,
      false
    );
    expect(lineTimingsChild.totalLineHits.get(21)).toBe(1);
    expect(lineTimingsChild.totalLineHits.size).toBe(1); // no other hits
    expect(lineTimingsChild.selfLineHits.get(21)).toBe(1);
    expect(lineTimingsChild.selfLineHits.size).toBe(1); // no other hits
  });

  it('passes a test where the same function is called via different call paths', function () {
    const { derivedThreads, funcNamesDictPerThread, defaultCategory } =
      getProfileFromTextSamples(`
      A[file:one.js][line:20]  A[file:one.js][line:21]  A[file:one.js][line:20]
      B[file:one.js][line:30]  D[file:one.js][line:50]  B[file:one.js][line:31]
      C[file:two.js][line:10]  C[file:two.js][line:11]  C[file:two.js][line:12]
                                                        D[file:one.js][line:51]
    `);

    const [{ A, B, C }] = funcNamesDictPerThread;
    const [thread] = derivedThreads;

    const lineTimingsABC = getTimings(
      thread,
      [A, B, C],
      defaultCategory,
      false
    );
    expect(lineTimingsABC.totalLineHits.get(10)).toBe(1);
    expect(lineTimingsABC.totalLineHits.get(12)).toBe(1);
    expect(lineTimingsABC.totalLineHits.size).toBe(2); // no other hits
    expect(lineTimingsABC.selfLineHits.get(10)).toBe(1);
    expect(lineTimingsABC.selfLineHits.size).toBe(1); // no other hits
  });

  it('passes a test with an inverted thread', function () {
    const { derivedThreads, funcNamesDictPerThread, defaultCategory } =
      getProfileFromTextSamples(`
      A[file:one.js][line:20]  A[file:one.js][line:21]  A[file:one.js][line:20]
      B[file:one.js][line:30]  D[file:one.js][line:50]  B[file:one.js][line:31]
      D[file:one.js][line:51]  D[file:one.js][line:52]  C[file:two.js][line:12]
                                                        D[file:one.js][line:51]
    `);

    const [{ A, B, C, D }] = funcNamesDictPerThread;
    const [thread] = derivedThreads;

    // For the root D of the inverted tree, we have 3 self line hits.
    const lineTimingsD = getTimings(thread, [D], defaultCategory, true);
    expect(lineTimingsD.totalLineHits.get(51)).toBe(2);
    expect(lineTimingsD.totalLineHits.get(52)).toBe(1);
    expect(lineTimingsD.totalLineHits.size).toBe(2); // no other hits
    expect(lineTimingsD.selfLineHits.get(51)).toBe(2);
    expect(lineTimingsD.selfLineHits.get(52)).toBe(1);
    expect(lineTimingsD.selfLineHits.size).toBe(2); // no other hits

    // For the C call node which is a child (direct caller) of D, we have
    // no self line hit and one hit in line 12.
    const lineTimingsDC = getTimings(thread, [D, C], defaultCategory, true);
    expect(lineTimingsDC.totalLineHits.get(12)).toBe(1);
    expect(lineTimingsDC.totalLineHits.size).toBe(1); // no other hits
    expect(lineTimingsDC.selfLineHits.size).toBe(0); // no self line hits

    // For the D <- B <- A call node, we have no self line hit, and one total
    // hit in line 20. (No self line hit because that sample's self time is
    // spent in D, not in A.)
    const lineTimingsDBA = getTimings(thread, [D, B, A], defaultCategory, true);
    expect(lineTimingsDBA.totalLineHits.get(20)).toBe(1);
    expect(lineTimingsDBA.totalLineHits.size).toBe(1); // no other hits
    expect(lineTimingsDC.selfLineHits.size).toBe(0); // no self line hits
  });
});
