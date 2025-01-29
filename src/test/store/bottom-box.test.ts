/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import * as UrlStateSelectors from '../../selectors/url-state';
import * as ProfileSelectors from '../../selectors/profile';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
} from '../../selectors/per-thread';
import { emptyAddressTimings } from '../../profile-logic/address-timings';
import { getBottomBoxInfoForCallNode } from '../../profile-logic/bottom-box';
import {
  changeSelectedCallNode,
  updateBottomBoxContentsAndMaybeOpen,
  openAssemblyView,
  closeAssemblyView,
  closeBottomBox,
} from '../../actions/profile-view';
import { changeSelectedTab } from '../../actions/app';
import { ensureExists } from '../../utils/types';
import type { Profile, Thread } from 'firefox-profiler/types';

function getProfileWithNiceAddresses(): {
  profile: Profile;
  derivedThreads: Thread[];
  funcNamesPerThread: Array<string[]>;
  funcNamesDictPerThread: Array<{ [funcName: string]: number }>;
  nativeSymbolsDictPerThread: Array<{ [nativeSymbolName: string]: number }>;
} {
  return getProfileFromTextSamples(`
    A[lib:one][address:20][sym:Asym:20:][file:ab.cpp][line:20]          A[lib:one][address:30][sym:Asym:20:][file:ab.cpp][line:22]          A[lib:one][address:20][sym:Asym:20:][file:ab.cpp][line:20]  A[lib:one][address:20][sym:Asym:20:][file:ab.cpp][line:20]
    B[lib:one][address:40][sym:Bsym:30:][file:ab.cpp][line:40]          B[lib:one][address:30][sym:Asym:20:][file:ab.cpp][line:40][inl:1]   B[lib:one][address:45][sym:Bsym:30:][file:ab.cpp][line:43]  E[lib:one][address:31][sym:Esym:30:][file:cde.cpp][line:90]
    C[lib:one][address:40][sym:Bsym:30:][file:cde.cpp][line:60][inl:1]  C[lib:one][address:30][sym:Asym:20:][file:cde.cpp][line:62][inl:2]  C[lib:one][address:45][sym:Bsym:30:][file:cde.cpp][line:62] F[lib:two][address:15][sym:Fsym:12:]
                                                                                                                                            D[lib:one][address:51][sym:Dsym:40:][file:cde.cpp][line:80]
  `);
}

describe('bottom box', function () {
  function setup() {
    const {
      profile,
      derivedThreads,
      funcNamesPerThread,
      funcNamesDictPerThread,
      nativeSymbolsDictPerThread,
    } = getProfileWithNiceAddresses();
    const { dispatch, getState } = storeWithProfile(profile);

    return {
      // Store:
      dispatch,
      getState,

      // Other stuff:
      thread: derivedThreads[0],
      funcNames: funcNamesPerThread[0],
      funcNamesDict: funcNamesDictPerThread[0],
      nativeSymbolsDict: nativeSymbolsDictPerThread[0],
    };
  }

  it('starts out with the bottom box closed', function () {
    const { getState } = setup();
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeFalse();
    expect(UrlStateSelectors.getSelectedTab(getState())).toBe('calltree');
    expect(UrlStateSelectors.getSourceViewSourceIndex(getState())).toBeNull();
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();
    expect(
      UrlStateSelectors.getAssemblyViewNativeSymbol(getState())
    ).toBeNull();
    expect(
      selectedThreadSelectors.getAssemblyViewAddressTimings(getState())
    ).toEqual(emptyAddressTimings);
  });

  it('opens the source view when double-clicking a call node with source code', function () {
    const { dispatch, getState, funcNamesDict, thread } = setup();
    const { A, B, C, D, E, F } = funcNamesDict;
    const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());

    // Simulate double-clicking the call node at [A, B, C, D].
    const abcd = ensureExists(
      callNodeInfo.getCallNodeIndexFromPath([A, B, C, D])
    );
    const nativeSymbolInfoD = {
      libIndex: 0,
      address: 0x40,
      name: 'Dsym',
      functionSize: 18,
      functionSizeIsKnown: false,
    };
    const bottomBoxInfoD = getBottomBoxInfoForCallNode(
      abcd,
      callNodeInfo,
      thread,
      thread.samples
    );
    expect(bottomBoxInfoD.nativeSymbols).toEqual([nativeSymbolInfoD]);
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoD));

    // Now the source view should be displayed and the assembly view should be
    // initialized but closed.
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(ProfileSelectors.getSourceViewFile(getState())).toBe('cde.cpp');
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();
    expect(UrlStateSelectors.getAssemblyViewNativeSymbol(getState())).toEqual(
      nativeSymbolInfoD
    );
    // [selected tab: calltree] [calltree: bottombox open] [flame-graph: bottombox closed] [assembly view closed]

    // Open the assembly view.
    dispatch(openAssemblyView());
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeTrue();
    // [selected tab: calltree] [calltree: bottombox open] [flame-graph: bottombox closed] [assembly view open]

    // Close the assembly view.
    dispatch(closeAssemblyView());
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    // [selected tab: calltree] [calltree: bottombox open] [flame-graph: bottombox closed] [assembly view closed]

    // Switch to the flame-graph tab. The bottom box should be closed but the
    // saved information about the source file and native symbol should still be
    // available.
    dispatch(changeSelectedTab('flame-graph'));
    expect(UrlStateSelectors.getSelectedTab(getState())).toBe('flame-graph');
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeFalse();
    expect(ProfileSelectors.getSourceViewFile(getState())).toBe('cde.cpp');
    expect(UrlStateSelectors.getAssemblyViewNativeSymbol(getState())).toEqual(
      nativeSymbolInfoD
    );
    // [selected tab: flame-graph] [calltree: bottombox open] [flame-graph: bottombox closed] [assembly view closed]

    // Open the bottom box in the flame-graph tab, too.
    dispatch(
      updateBottomBoxContentsAndMaybeOpen('flame-graph', bottomBoxInfoD)
    );
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    // [selected tab: flame-graph] [calltree: bottombox open] [flame-graph: bottombox open] [assembly view closed]

    // Switch back to the calltree and close the bottom box.
    dispatch(changeSelectedTab('calltree'));
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    dispatch(closeBottomBox());
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeFalse();
    // [selected tab: calltree] [calltree: bottombox closed] [flame-graph: bottombox open] [assembly view closed]

    // Switch back to the flame-graph tab. The bottom box should still be open.
    dispatch(changeSelectedTab('flame-graph'));
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    // [selected tab: flame-graph] [calltree: bottombox closed] [flame-graph: bottombox open] [assembly view closed]

    // Open the assembly view and switch back to the calltree tab. Then open the
    // bottom box again. The assembly view should be open when the bottom box is
    // opened.
    dispatch(openAssemblyView());
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeTrue();
    // [selected tab: flame-graph] [calltree: bottombox closed] [flame-graph: bottombox open] [assembly view open]
    dispatch(changeSelectedTab('calltree'));
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoD));
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeTrue();
    // [selected tab: calltree] [calltree: bottombox open] [flame-graph: bottombox open] [assembly view open]

    // Close the assembly view.
    dispatch(closeAssemblyView());
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    // [selected tab: calltree] [calltree: bottombox open] [flame-graph: bottombox open] [assembly view closed]

    // Double-click a call node which doesn't have source file information.
    const aef = ensureExists(callNodeInfo.getCallNodeIndexFromPath([A, E, F]));
    const nativeSymbolInfoF = {
      libIndex: 1,
      address: 0x12,
      name: 'Fsym',
      functionSize: 4,
      functionSizeIsKnown: false,
    };
    const bottomBoxInfoF = getBottomBoxInfoForCallNode(
      aef,
      callNodeInfo,
      thread,
      thread.samples
    );
    expect(bottomBoxInfoF.nativeSymbols).toEqual([nativeSymbolInfoF]);
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoF));

    // Now the assembly view should be opened because there's no source to display.
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(ProfileSelectors.getSourceViewFile(getState())).toBeNull();
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeTrue();
    expect(UrlStateSelectors.getAssemblyViewNativeSymbol(getState())).toEqual(
      nativeSymbolInfoF
    );
    // [selected tab: calltree] [calltree: bottombox open] [flame-graph: bottombox open] [assembly view open]

    // Double-click a node with source information again. The assembly view should remain open.
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoD));
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(ProfileSelectors.getSourceViewFile(getState())).toBe('cde.cpp');
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeTrue();
    expect(UrlStateSelectors.getAssemblyViewNativeSymbol(getState())).toEqual(
      nativeSymbolInfoD
    );
    // [selected tab: calltree] [calltree: bottombox open] [flame-graph: bottombox open] [assembly view open]
  });

  it('stores multiple native symbols if the chosen call node has multiple native symbols', function () {
    const { dispatch, getState, funcNamesDict, thread } = setup();
    const { A, B, C } = funcNamesDict;
    const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());

    // Simulate double-clicking the call node at [A, B, C].
    // This call node has been inlined into B and into A.
    const abc = ensureExists(callNodeInfo.getCallNodeIndexFromPath([A, B, C]));
    const nativeSymbolInfoA = {
      libIndex: 0,
      address: 0x20,
      name: 'Asym',
      functionSize: 17,
      functionSizeIsKnown: false,
    };
    const nativeSymbolInfoB = {
      libIndex: 0,
      address: 0x30,
      name: 'Bsym',
      functionSize: 22,
      functionSizeIsKnown: false,
    };
    const bottomBoxInfoC = getBottomBoxInfoForCallNode(
      abc,
      callNodeInfo,
      thread,
      thread.samples
    );
    expect(new Set(bottomBoxInfoC.nativeSymbols)).toEqual(
      new Set([nativeSymbolInfoA, nativeSymbolInfoB])
    );
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoC));

    // Now the source view should be displayed and the assembly view should be
    // initialized but closed. The assembly view should show one of the two
    // native symbols.
    // The source view should scroll to line 62 because the call node [A, B, C]
    // has 2 samples in line 62 and only 1 sample in line 60.
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(ProfileSelectors.getSourceViewFile(getState())).toBe('cde.cpp');
    expect(UrlStateSelectors.getSourceViewScrollToLineNumber(getState())).toBe(62);
    expect(UrlStateSelectors.getSourceViewHighlightedLine(getState())).toBe(undefined);
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();
    expect(
      ensureExists(UrlStateSelectors.getAssemblyViewNativeSymbol(getState()))
        .name
    ).toBeOneOf(['Asym', 'Bsym']);
  });

  it('displays the correct timings', function () {
    const { dispatch, getState, funcNamesDict, thread } = setup();
    const { A, B, C, D } = funcNamesDict;
    const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());

    const threadsKey = UrlStateSelectors.getSelectedThreadsKey(getState());

    // Simulate double-clicking the call node at [A, B, C, D].
    // We first select the call node, then we compute its "bottom box info" (this
    // is what the call tree usually does on its own), and then we open the bottom
    // box with that info.
    dispatch(changeSelectedCallNode(threadsKey, [A, B, C, D]));
    const bottomBoxInfoABC = getBottomBoxInfoForCallNode(
      ensureExists(callNodeInfo.getCallNodeIndexFromPath([A, B, C, D])),
      callNodeInfo,
      thread,
      thread.samples
    );
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoABC));

    // Check the assembly view address timings, both the (thread-)global timings
    // and the timings for the selected call node.
    // Note the difference between "selectedThreadSelectors" and "selectedNodeSelectors" below.
    // Both timings should be identical here because Dsym is selected and because
    // there is no recursion on Dsym.
    expect(
      selectedThreadSelectors.getAssemblyViewAddressTimings(getState())
        .totalAddressHits
    ).toEqual(new Map([[0x51, 1]]));
    expect(
      selectedNodeSelectors.getAssemblyViewAddressTimings(getState())
        .totalAddressHits
    ).toEqual(new Map([[0x51, 1]]));

    // Select the call node at [A, B, C].
    dispatch(changeSelectedCallNode(threadsKey, [A, B, C]));

    // The global timings should still remain the same.
    expect(
      selectedThreadSelectors.getAssemblyViewAddressTimings(getState())
        .totalAddressHits
    ).toEqual(new Map([[0x51, 1]]));

    // The timings for the selected call node should have dropped to zero,
    // because the call node at [A, B, C] does not have any frames in Dsym.
    expect(
      selectedNodeSelectors.getAssemblyViewAddressTimings(getState())
        .totalAddressHits
    ).toEqual(new Map());
  });

  // Further ideas for tests:
  //
  // - A test with multiple threads: Open the assembly view for a symbol, switch
  //   to a different thread, check timings
});
