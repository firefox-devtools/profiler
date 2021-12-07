/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  getStackLineInfo,
  getLineTimings,
} from 'firefox-profiler/profile-logic/line-timings';
import { invertCallstack } from '../../profile-logic/profile-data';
import { ensureExists } from 'firefox-profiler/utils/flow';
import type { Thread } from 'firefox-profiler/types';

describe('getStackLineInfo', function () {
  it('computes results for all stacks', function () {
    const { profile } = getProfileFromTextSamples(`
      A[file:one.js][line:20]  A[file:one.js][line:21]  A[file:one.js][line:20]
      B[file:one.js][line:30]  B[file:one.js][line:30]  B[file:one.js][line:30]
      C[file:two.js][line:10]  C[file:two.js][line:11]  D[file:two.js][line:40]
      B[file:one.js][line:30]                           D[file:two.js][line:40]
    `);
    const [thread] = profile.threads;
    const { stackTable, frameTable, funcTable, stringTable } = thread;

    const fileOne = stringTable.indexForString('one.js');
    const stackLineInfoOne = getStackLineInfo(
      stackTable,
      frameTable,
      funcTable,
      fileOne,
      false
    );

    // Expect the returned arrays to have the same length as the stackTable.
    expect(stackTable.length).toBe(9);
    expect(stackLineInfoOne.selfLine.length).toBe(9);
    expect(stackLineInfoOne.stackLines.length).toBe(9);
  });
});

describe('getLineTimings for getStackLineInfo', function () {
  function getTimings(thread: Thread, file: string, isInverted: boolean) {
    const { stackTable, frameTable, funcTable, samples, stringTable } = thread;
    const fileStringIndex = stringTable.indexForString(file);
    const stackLineInfo = getStackLineInfo(
      stackTable,
      frameTable,
      funcTable,
      fileStringIndex,
      isInverted
    );
    return getLineTimings(stackLineInfo, samples);
  }

  it('passes a basic test', function () {
    // In this example, there's one self line hit in line 30.
    // Both line 20 and line 30 have one total time hit.
    const { profile } = getProfileFromTextSamples(`
      A[file:file.js][line:20]
      B[file:file.js][line:30]
    `);
    const [thread] = profile.threads;
    const lineTimings = getTimings(thread, 'file.js', false);
    expect(lineTimings.totalLineHits.get(20)).toBe(1);
    expect(lineTimings.totalLineHits.get(30)).toBe(1);
    expect(lineTimings.totalLineHits.size).toBe(2); // no other hits
    expect(lineTimings.selfLineHits.get(20)).toBe(undefined);
    expect(lineTimings.selfLineHits.get(30)).toBe(1);
    expect(lineTimings.selfLineHits.size).toBe(1); // no other hits
  });

  it('passes a test with two files and recursion', function () {
    const { profile } = getProfileFromTextSamples(`
      A[file:one.js][line:20]  A[file:one.js][line:21]  A[file:one.js][line:20]
      B[file:one.js][line:30]  B[file:one.js][line:30]  B[file:one.js][line:30]
      C[file:two.js][line:10]  C[file:two.js][line:11]  D[file:two.js][line:40]
      B[file:one.js][line:30]                           D[file:two.js][line:40]
    `);
    const [thread] = profile.threads;

    const lineTimingsOne = getTimings(thread, 'one.js', false);
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

    const lineTimingsTwo = getTimings(thread, 'two.js', false);
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

  it('computes the same values on an inverted thread', function () {
    const { profile } = getProfileFromTextSamples(`
      A[file:one.js][line:20]  A[file:one.js][line:21]  A[file:one.js][line:20]
      B[file:one.js][line:30]  B[file:one.js][line:30]  B[file:one.js][line:30]
      C[file:two.js][line:10]  C[file:two.js][line:11]  D[file:two.js][line:40]
      B[file:one.js][line:30]                           D[file:two.js][line:40]
    `);
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );

    const [thread] = profile.threads;
    const defaultCategory = categories.findIndex((c) => c.color === 'grey');
    const invertedThread = invertCallstack(thread, defaultCategory);

    const lineTimingsOne = getTimings(thread, 'one.js', false);
    const lineTimingsInvertedOne = getTimings(invertedThread, 'one.js', true);
    expect(lineTimingsInvertedOne).toEqual(lineTimingsOne);

    const lineTimingsTwo = getTimings(thread, 'two.js', false);
    const lineTimingsInvertedTwo = getTimings(invertedThread, 'two.js', true);
    expect(lineTimingsInvertedTwo).toEqual(lineTimingsTwo);
  });
});
