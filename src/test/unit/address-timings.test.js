/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  getStackAddressInfo,
  getStackAddressInfoForCallNode,
  getAddressTimings,
} from 'firefox-profiler/profile-logic/address-timings';
import {
  invertCallstack,
  getCallNodeInfo,
  getCallNodeIndexFromPath,
} from '../../profile-logic/profile-data';
import { ensureExists } from 'firefox-profiler/utils/flow';
import type {
  CallNodePath,
  Thread,
  IndexIntoCategoryList,
  IndexIntoNativeSymbolTable,
} from 'firefox-profiler/types';

describe('getStackAddressInfo', function () {
  it('computes results for all stacks', function () {
    const { profile, nativeSymbolsDictPerThread } = getProfileFromTextSamples(`
      A[lib:one][address:0x20][sym:Asym]  A[lib:one][address:0x21][sym:Asym]  A[lib:one][address:0x20][sym:Asym]
      B[lib:one][address:0x30][sym:Bsym]  B[lib:one][address:0x30][sym:Bsym]  B[lib:one][address:0x30][sym:Bsym]
      C[lib:two][address:0x10][sym:Csym]  C[lib:two][address:0x11][sym:Csym]  D[lib:two][address:0x40][sym:Dsym]
      B[lib:one][address:0x30][sym:Bsym]                                      D[lib:two][address:0x40][sym:Dsym]
    `);
    const [thread] = profile.threads;
    const [{ Asym }] = nativeSymbolsDictPerThread;
    const { stackTable, frameTable, funcTable } = thread;

    const stackLineInfoOne = getStackAddressInfo(
      stackTable,
      frameTable,
      funcTable,
      Asym,
      false
    );

    // Expect the returned arrays to have the same length as the stackTable.
    expect(stackTable.length).toBe(9);
    expect(stackLineInfoOne.selfAddress.length).toBe(9);
    expect(stackLineInfoOne.stackAddresses.length).toBe(9);
  });
});

describe('getAddressTimings for getStackAddressInfo', function () {
  function getTimings(
    thread: Thread,
    sym: IndexIntoNativeSymbolTable,
    isInverted: boolean
  ) {
    const { stackTable, frameTable, funcTable, samples } = thread;
    const stackLineInfo = getStackAddressInfo(
      stackTable,
      frameTable,
      funcTable,
      sym,
      isInverted
    );
    return getAddressTimings(stackLineInfo, samples);
  }

  it('passes a basic test', function () {
    // In this example, there's one self address hit at address 0x30.
    // Both address 0x20 and address 0x30 have one total time hit.
    const { profile, nativeSymbolsDictPerThread } = getProfileFromTextSamples(`
      A[lib:file][address:0x20][sym:Asym]
      A[lib:file][address:0x30][sym:Asym]
    `);
    const [thread] = profile.threads;
    const [{ Asym }] = nativeSymbolsDictPerThread;
    const addressTimings = getTimings(thread, Asym, false);
    expect(addressTimings.totalAddressHits.get(0x20)).toBe(1);
    expect(addressTimings.totalAddressHits.get(0x30)).toBe(1);
    expect(addressTimings.totalAddressHits.size).toBe(2); // no other hits
    expect(addressTimings.selfAddressHits.get(0x20)).toBe(undefined);
    expect(addressTimings.selfAddressHits.get(0x30)).toBe(1);
    expect(addressTimings.selfAddressHits.size).toBe(1); // no other hits
  });

  it('passes a test with inlining', function () {
    // In this example, there's one self address hit at address 0x30.
    // Both address 0x20 and address 0x30 have one total time hit.
    const { profile, nativeSymbolsDictPerThread } = getProfileFromTextSamples(`
      A[lib:file][address:0x20][sym:Asym]
      B[lib:file][address:0x20][sym:Asym][inl:1]
      C[lib:file][address:0x20][sym:Asym][inl:2]
      A[lib:file][address:0x30][sym:Asym]
    `);
    const [thread] = profile.threads;
    const [{ Asym }] = nativeSymbolsDictPerThread;
    const addressTimings = getTimings(thread, Asym, false);
    expect(addressTimings.totalAddressHits.get(0x20)).toBe(1);
    expect(addressTimings.totalAddressHits.get(0x30)).toBe(1);
    expect(addressTimings.totalAddressHits.size).toBe(2); // no other hits
    expect(addressTimings.selfAddressHits.get(0x20)).toBe(undefined);
    expect(addressTimings.selfAddressHits.get(0x30)).toBe(1);
    expect(addressTimings.selfAddressHits.size).toBe(1); // no other hits
  });

  it('passes a test with two files and recursion', function () {
    const { profile, nativeSymbolsDictPerThread } = getProfileFromTextSamples(`
      A[lib:one][address:0x20][sym:Asym]  A[lib:one][address:0x21][sym:Asym]  A[lib:one][address:0x20][sym:Asym]
      B[lib:one][address:0x30][sym:Bsym]  B[lib:one][address:0x30][sym:Bsym]  B[lib:one][address:0x30][sym:Bsym]
      C[lib:two][address:0x10][sym:Csym]  C[lib:two][address:0x11][sym:Csym]  D[lib:two][address:0x40][sym:Dsym]
      B[lib:one][address:0x30][sym:Bsym]                                      D[lib:two][address:0x40][sym:Dsym]
    `);
    const [thread] = profile.threads;
    const [{ Asym, Bsym, Csym, Dsym }] = nativeSymbolsDictPerThread;

    const addressTimingsA = getTimings(thread, Asym, false);
    expect(addressTimingsA.totalAddressHits.get(0x20)).toBe(2);
    expect(addressTimingsA.totalAddressHits.get(0x21)).toBe(1);
    // 0x30 is in the righ lib (one) but in the wrong native symbol (B instead
    // of A), so we should not see any hits on it.
    expect(addressTimingsA.totalAddressHits.get(0x30)).toBe(undefined);
    expect(addressTimingsA.totalAddressHits.size).toBe(2); // no other hits
    // There is no self address hit for Asym.
    expect(addressTimingsA.selfAddressHits.get(0x20)).toBe(undefined);
    expect(addressTimingsA.selfAddressHits.get(0x21)).toBe(undefined);
    expect(addressTimingsA.selfAddressHits.get(0x30)).toBe(undefined);
    expect(addressTimingsA.selfAddressHits.size).toBe(0); // no other hits

    const addressTimingsB = getTimings(thread, Bsym, false);
    // Address 0x30 was hit in every sample, twice in the first sample
    // (due to recursion) but that still only counts as one sample
    expect(addressTimingsB.totalAddressHits.get(0x30)).toBe(3);
    expect(addressTimingsB.totalAddressHits.size).toBe(1); // no other hits
    // There is only one self address hit for Bsym: 0x30 in the first sample.
    expect(addressTimingsB.selfAddressHits.get(0x20)).toBe(undefined);
    expect(addressTimingsB.selfAddressHits.get(0x21)).toBe(undefined);
    expect(addressTimingsB.selfAddressHits.get(0x30)).toBe(1);
    expect(addressTimingsB.selfAddressHits.size).toBe(1); // no other hits

    const addressTimingsC = getTimings(thread, Csym, false);
    expect(addressTimingsC.totalAddressHits.get(0x10)).toBe(1);
    expect(addressTimingsC.totalAddressHits.get(0x11)).toBe(1);
    expect(addressTimingsC.totalAddressHits.size).toBe(2); // no other hits
    expect(addressTimingsC.selfAddressHits.get(0x10)).toBe(undefined);
    expect(addressTimingsC.selfAddressHits.get(0x11)).toBe(1);
    expect(addressTimingsC.selfAddressHits.size).toBe(1); // no other hits

    const addressTimingsD = getTimings(thread, Dsym, false);
    expect(addressTimingsD.totalAddressHits.get(0x40)).toBe(1);
    expect(addressTimingsD.totalAddressHits.size).toBe(1); // no other hits
    // Dsym's address 0x40 recursed but should only be counted as 1 sample
    expect(addressTimingsD.selfAddressHits.get(0x40)).toBe(1);
    expect(addressTimingsD.selfAddressHits.size).toBe(1); // no other hits
  });

  it('computes the same values on an inverted thread', function () {
    const { profile, nativeSymbolsDictPerThread } = getProfileFromTextSamples(`
    A[lib:one][address:0x20][sym:Asym]  A[lib:one][address:0x21][sym:Asym]  A[lib:one][address:0x20][sym:Asym]
    B[lib:one][address:0x30][sym:Bsym]  B[lib:one][address:0x30][sym:Bsym]  B[lib:one][address:0x30][sym:Bsym]
    C[lib:two][address:0x10][sym:Csym]  C[lib:two][address:0x11][sym:Csym]  D[lib:two][address:0x40][sym:Dsym]
    B[lib:one][address:0x30][sym:Bsym]                                      D[lib:two][address:0x40][sym:Dsym]
    `);
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );

    const [thread] = profile.threads;
    const [{ Asym, Bsym, Csym, Dsym }] = nativeSymbolsDictPerThread;
    const defaultCategory = categories.findIndex((c) => c.color === 'grey');
    const invertedThread = invertCallstack(thread, defaultCategory);

    const addressTimingsA = getTimings(thread, Asym, false);
    const addressTimingsInvertedA = getTimings(invertedThread, Asym, true);
    expect(addressTimingsInvertedA).toEqual(addressTimingsA);

    const addressTimingsB = getTimings(thread, Bsym, false);
    const addressTimingsInvertedB = getTimings(invertedThread, Bsym, true);
    expect(addressTimingsInvertedB).toEqual(addressTimingsB);

    const addressTimingsC = getTimings(thread, Csym, false);
    const addressTimingsInvertedC = getTimings(invertedThread, Csym, true);
    expect(addressTimingsInvertedC).toEqual(addressTimingsC);

    const addressTimingsD = getTimings(thread, Dsym, false);
    const addressTimingsInvertedD = getTimings(invertedThread, Dsym, true);
    expect(addressTimingsInvertedD).toEqual(addressTimingsD);
  });
});

describe('getAddressTimings for getStackAddressInfoForCallNode', function () {
  function getTimings(
    thread: Thread,
    callNodePath: CallNodePath,
    defaultCat: IndexIntoCategoryList,
    nativeSymbol: IndexIntoNativeSymbolTable,
    isInverted: boolean
  ) {
    const { stackTable, frameTable, funcTable, samples } = thread;
    const callNodeInfo = getCallNodeInfo(
      stackTable,
      frameTable,
      funcTable,
      defaultCat
    );
    const callNodeIndex = ensureExists(
      getCallNodeIndexFromPath(callNodePath, callNodeInfo.callNodeTable),
      'invalid call node path'
    );
    const stackLineInfo = getStackAddressInfoForCallNode(
      stackTable,
      frameTable,
      callNodeIndex,
      callNodeInfo,
      nativeSymbol,
      isInverted
    );
    return getAddressTimings(stackLineInfo, samples);
  }

  it('passes a basic test', function () {
    const { profile, funcNamesDictPerThread, nativeSymbolsDictPerThread } =
      getProfileFromTextSamples(`
      A[lib:file][address:0x20][sym:Asym]
      B[lib:file][address:0x30][sym:Bsym]
    `);
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );
    const defaultCat = categories.findIndex((c) => c.color === 'grey');

    const [{ A, B }] = funcNamesDictPerThread;
    const [{ Asym, Bsym }] = nativeSymbolsDictPerThread;
    const [thread] = profile.threads;

    // Compute the address timings for the root call node.
    // No self address hit, one total address hit at address 0x20.
    const addressTimingsRoot = getTimings(thread, [A], defaultCat, Asym, false);
    expect(addressTimingsRoot.totalAddressHits.get(0x20)).toBe(1);
    expect(addressTimingsRoot.totalAddressHits.size).toBe(1); // no other hits
    expect(addressTimingsRoot.selfAddressHits.size).toBe(0); // no self hits

    // Compute the address timings for the child call node.
    // One self address hit at address 0x30, which is also the only total address hit.
    const addressTimingsChild = getTimings(
      thread,
      [A, B],
      defaultCat,
      Bsym,
      false
    );
    expect(addressTimingsChild.totalAddressHits.get(0x30)).toBe(1);
    expect(addressTimingsChild.totalAddressHits.size).toBe(1); // no other hits
    expect(addressTimingsChild.selfAddressHits.get(0x30)).toBe(1);
    expect(addressTimingsChild.selfAddressHits.size).toBe(1); // no other hits
  });

  it('passes a basic test with recursion', function () {
    const { profile, funcNamesDictPerThread, nativeSymbolsDictPerThread } =
      getProfileFromTextSamples(`
      A[lib:file][address:0x20][sym:Asym]
      B[lib:file][address:0x30][sym:Bsym]
      A[lib:file][address:0x21][sym:Asym]
    `);
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );
    const defaultCat = categories.findIndex((c) => c.color === 'grey');

    const [{ A, B }] = funcNamesDictPerThread;
    const [{ Asym }] = nativeSymbolsDictPerThread;
    const [thread] = profile.threads;

    // Compute the address timings for the root call node.
    // No self address hit, one total address hit at address 0x20.
    const addressTimingsRoot = getTimings(thread, [A], defaultCat, Asym, false);
    expect(addressTimingsRoot.totalAddressHits.get(0x20)).toBe(1);
    expect(addressTimingsRoot.totalAddressHits.size).toBe(1); // no other hits
    expect(addressTimingsRoot.selfAddressHits.size).toBe(0); // no self hits

    // Compute the address timings for the leaf call node.
    // One self address hit at address 0x21, which is also the only total address hit.
    // In particular, we shouldn't record a hit for line 20, even though
    // the hit at line 20 is also in A. But it's in the wrong call node.
    const addressTimingsChild = getTimings(
      thread,
      [A, B, A],
      defaultCat,
      Asym,
      false
    );
    expect(addressTimingsChild.totalAddressHits.get(0x21)).toBe(1);
    expect(addressTimingsChild.totalAddressHits.size).toBe(1); // no other hits
    expect(addressTimingsChild.selfAddressHits.get(0x21)).toBe(1);
    expect(addressTimingsChild.selfAddressHits.size).toBe(1); // no other hits
  });

  it('passes a test where the same function is called via different call paths', function () {
    const { profile, funcNamesDictPerThread, nativeSymbolsDictPerThread } =
      getProfileFromTextSamples(`
      A[lib:one][address:0x20][sym:Asym]  A[lib:one][address:0x21][sym:Asym]  A[lib:one][address:0x20][sym:Asym]
      B[lib:one][address:0x30][sym:Bsym]  D[lib:one][address:0x50][sym:Dsym]  B[lib:one][address:0x31][sym:Bsym]
      C[lib:two][address:0x10][sym:Csym]  C[lib:two][address:0x11][sym:Csym]  C[lib:two][address:0x12][sym:Csym]
                                                                              D[lib:one][address:0x51][sym:Dsym]
    `);
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );
    const defaultCat = categories.findIndex((c) => c.color === 'grey');

    const [{ A, B, C }] = funcNamesDictPerThread;
    const [{ Csym }] = nativeSymbolsDictPerThread;
    const [thread] = profile.threads;

    const addressTimingsABC = getTimings(
      thread,
      [A, B, C],
      defaultCat,
      Csym,
      false
    );
    expect(addressTimingsABC.totalAddressHits.get(0x10)).toBe(1);
    expect(addressTimingsABC.totalAddressHits.get(0x12)).toBe(1);
    expect(addressTimingsABC.totalAddressHits.size).toBe(2); // no other hits
    expect(addressTimingsABC.selfAddressHits.get(0x10)).toBe(1);
    expect(addressTimingsABC.selfAddressHits.size).toBe(1); // no other hits
  });

  it('passes a test with an inverted thread', function () {
    const { profile, funcNamesDictPerThread, nativeSymbolsDictPerThread } =
      getProfileFromTextSamples(`
      A[lib:one][address:0x20][sym:Asym]  A[lib:one][address:0x21][sym:Asym]  A[lib:one][address:0x20][sym:Asym]
      B[lib:one][address:0x30][sym:Bsym]  D[lib:one][address:0x50][sym:Dsym]  B[lib:one][address:0x31][sym:Bsym]
      D[lib:one][address:0x51][sym:Dsym]  D[lib:one][address:0x52][sym:Dsym]  C[lib:two][address:0x12][sym:Csym]
                                                                              D[lib:one][address:0x51][sym:Dsym]
    `);
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );
    const defaultCat = categories.findIndex((c) => c.color === 'grey');

    const [{ C, D }] = funcNamesDictPerThread;
    const [{ Csym, Dsym }] = nativeSymbolsDictPerThread;
    const [thread] = profile.threads;
    const invertedThread = invertCallstack(thread, defaultCat);

    // For the root D of the inverted tree, we have 3 self address hits.
    const addressTimingsD = getTimings(
      invertedThread,
      [D],
      defaultCat,
      Dsym,
      true
    );
    expect(addressTimingsD.totalAddressHits.get(0x51)).toBe(2);
    expect(addressTimingsD.totalAddressHits.get(0x52)).toBe(1);
    expect(addressTimingsD.totalAddressHits.size).toBe(2); // no other hits
    expect(addressTimingsD.selfAddressHits.get(0x51)).toBe(2);
    expect(addressTimingsD.selfAddressHits.get(0x52)).toBe(1);
    expect(addressTimingsD.selfAddressHits.size).toBe(2); // no other hits

    // For the C call node which is a child (direct caller) of D, we have
    // no self address hit and one hit at address 0x12.
    const addressTimingsDC = getTimings(
      invertedThread,
      [D, C],
      defaultCat,
      Csym,
      true
    );
    expect(addressTimingsDC.totalAddressHits.get(0x12)).toBe(1);
    expect(addressTimingsDC.totalAddressHits.size).toBe(1); // no other hits
    expect(addressTimingsDC.selfAddressHits.size).toBe(0); // no self address hits
  });

  it('passes a test where a function is present in two different native symbols', function () {
    // The funky part here is that the targeted call node has frames from two different native
    // symbols: Two from native symbol Bsym, and one from native symbol Asym. That's
    // because B is present both as its own native symbol (separate outer function)
    // and as an inlined call from A. In other words, C has been inlined both into
    // a standalone B and also into another copy of B which was inlined into A.
    //
    // This means that, if the user double clicks call node [A, B, C], there are two
    // different symbols for which we may want to display the assembly code. And
    // depending on whether the assembly for Asym or for Bsym is displayed, we want to
    // call this function for a different native symbol.
    //
    // In this test, we compute the timings for native symbol Bsym.
    const { profile, funcNamesDictPerThread, nativeSymbolsDictPerThread } =
      getProfileFromTextSamples(`
      A[lib:one][address:0x20][sym:Asym]         A[lib:one][address:0x30][sym:Asym]         A[lib:one][address:0x20][sym:Asym]  A[lib:one][address:0x20][sym:Asym]
      B[lib:one][address:0x40][sym:Bsym]         B[lib:one][address:0x30][sym:Asym][inl:1]  B[lib:one][address:0x45][sym:Bsym]  E[lib:one][address:0x31][sym:Esym]
      C[lib:one][address:0x40][sym:Bsym][inl:1]  C[lib:one][address:0x30][sym:Asym][inl:2]  C[lib:one][address:0x45][sym:Bsym]
                                                                                            D[lib:one][address:0x51][sym:Dsym]
    `);
    const categories = ensureExists(
      profile.meta.categories,
      'Expected to find categories'
    );
    const defaultCat = categories.findIndex((c) => c.color === 'grey');

    const [{ A, B, C }] = funcNamesDictPerThread;
    const [{ Bsym }] = nativeSymbolsDictPerThread;
    const [thread] = profile.threads;

    const addressTimingsABCForBsym = getTimings(
      thread,
      [A, B, C],
      defaultCat,
      Bsym,
      false
    );
    expect(addressTimingsABCForBsym.totalAddressHits.get(0x40)).toBe(1);
    expect(addressTimingsABCForBsym.totalAddressHits.get(0x45)).toBe(1);
    expect(addressTimingsABCForBsym.totalAddressHits.size).toBe(2); // no other hits
    expect(addressTimingsABCForBsym.selfAddressHits.get(0x40)).toBe(1);
    expect(addressTimingsABCForBsym.selfAddressHits.size).toBe(1); // no other hits
  });
});
