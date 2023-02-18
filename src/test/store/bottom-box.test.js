/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import * as UrlStateSelectors from '../../selectors/url-state';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  getBottomBoxInfoForCallNode,
  getCallNodeIndexFromPath,
} from '../../profile-logic/profile-data';
import {
  updateBottomBoxContentsAndMaybeOpen,
  openAssemblyView,
  closeAssemblyView,
  closeBottomBox,
} from '../../actions/profile-view';
import { changeSelectedTab } from '../../actions/app';
import { ensureExists } from '../../utils/flow';
import type { Profile } from 'firefox-profiler/types';

function getProfileWithNiceAddresses(): {
  profile: Profile,
  funcNamesPerThread: Array<string[]>,
  funcNamesDictPerThread: Array<{ [funcName: string]: number }>,
  nativeSymbolsDictPerThread: Array<{ [nativeSymbolName: string]: number }>,
} {
  return getProfileFromTextSamples(`
    A[lib:one][address:20][sym:Asym:20:][file:ab.cpp][line:20]          A[lib:one][address:30][sym:Asym:20:][file:ab.cpp][line:22]          A[lib:one][address:20][sym:Asym:20:][file:ab.cpp][line:20]  A[lib:one][address:20][sym:Asym:20:][file:ab.cpp][line:20]
    B[lib:one][address:40][sym:Bsym:30:][file:ab.cpp][line:40]          B[lib:one][address:30][sym:Asym:20:][file:ab.cpp][line:40][inl:1]   B[lib:one][address:45][sym:Bsym:30:][file:ab.cpp][line:43]  E[lib:one][address:31][sym:Esym:30:][file:cde.cpp][line:90]
    C[lib:one][address:40][sym:Bsym:30:][file:cde.cpp][line:60][inl:1]  C[lib:one][address:30][sym:Asym:20:][file:cde.cpp][line:62][inl:2]  C[lib:one][address:45][sym:Bsym:30:][file:cde.cpp][line:63] F[lib:two][address:15][sym:Fsym:12:]
                                                                                                                                            D[lib:one][address:51][sym:Dsym:40:][file:cde.cpp][line:80]
  `);
}

describe('bottom box', function () {
  function setup() {
    const {
      profile,
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
      thread: profile.threads[0],
      funcNames: funcNamesPerThread[0],
      funcNamesDict: funcNamesDictPerThread[0],
      nativeSymbolsDict: nativeSymbolsDictPerThread[0],
    };
  }

  it('starts out with the bottom box closed', function () {
    const { getState } = setup();
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeFalse();
    expect(UrlStateSelectors.getSelectedTab(getState())).toBe('calltree');
    expect(UrlStateSelectors.getSourceViewFile(getState())).toBeNull();
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();
    expect(
      UrlStateSelectors.getAssemblyViewNativeSymbol(getState())
    ).toBeNull();
  });

  it('opens the source view when double-clicking a call node with source code', function () {
    const { dispatch, getState, funcNamesDict, thread } = setup();
    const { A, B, C, D, E, F } = funcNamesDict;
    const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());

    // Simulate double-clicking the call node at [A, B, C, D].
    const abcd = ensureExists(
      getCallNodeIndexFromPath([A, B, C, D], callNodeInfo.callNodeTable)
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
      thread
    );
    expect(bottomBoxInfoD.nativeSymbols).toEqual([nativeSymbolInfoD]);
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoD));

    // Now the source view should be displayed and the assembly view should be
    // initialized but closed.
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(UrlStateSelectors.getSourceViewFile(getState())).toBe('cde.cpp');
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
    expect(UrlStateSelectors.getSourceViewFile(getState())).toBe('cde.cpp');
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
    const aef = ensureExists(
      getCallNodeIndexFromPath([A, E, F], callNodeInfo.callNodeTable)
    );
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
      thread
    );
    expect(bottomBoxInfoF.nativeSymbols).toEqual([nativeSymbolInfoF]);
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoF));

    // Now the assembly view should be opened because there's no source to display.
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(UrlStateSelectors.getSourceViewFile(getState())).toBeNull();
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeTrue();
    expect(UrlStateSelectors.getAssemblyViewNativeSymbol(getState())).toEqual(
      nativeSymbolInfoF
    );
    // [selected tab: calltree] [calltree: bottombox open] [flame-graph: bottombox open] [assembly view open]

    // Double-click a node with source information again. The assembly view should remain open.
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoD));
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(UrlStateSelectors.getSourceViewFile(getState())).toBe('cde.cpp');
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
    const abc = ensureExists(
      getCallNodeIndexFromPath([A, B, C], callNodeInfo.callNodeTable)
    );
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
      thread
    );
    expect(new Set(bottomBoxInfoC.nativeSymbols)).toEqual(
      new Set([nativeSymbolInfoA, nativeSymbolInfoB])
    );
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfoC));

    // Now the source view should be displayed and the assembly view should be
    // initialized but closed. The assembly view should show one of the two
    // native symbols.
    expect(UrlStateSelectors.getIsBottomBoxOpen(getState())).toBeTrue();
    expect(UrlStateSelectors.getSourceViewFile(getState())).toBe('cde.cpp');
    expect(UrlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();
    expect(
      ensureExists(UrlStateSelectors.getAssemblyViewNativeSymbol(getState()))
        .name
    ).toBeOneOf(['Asym', 'Bsym']);
  });
});
