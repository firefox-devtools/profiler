/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/make-profile';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';
import { storeWithProfile } from '../fixtures/stores';
import * as ProfileView from '../../actions/profile-view';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import * as UrlStateSelectors from '../../reducers/url-state';

const { selectedThreadSelectors } = ProfileViewSelectors;

describe('call node paths on implementation filter change', function() {
  const {
    profile,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A.cpp
    B.js
    C.cpp
    D.js
    E.js
    F.cpp
  `);
  const threadIndex = 0;
  const A = funcNames.indexOf('A.cpp');
  const B = funcNames.indexOf('B.js');
  const C = funcNames.indexOf('C.cpp');
  const D = funcNames.indexOf('D.js');
  const E = funcNames.indexOf('E.js');

  it('starts with combined CallNodePaths', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [A, B, C, D, E]));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [A, B, C, D, E]
    );
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Paths
      [A],
      [A, B],
      [A, B, C],
      [A, B, C, D],
    ]);
  });

  it('starts with js CallNodePaths', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [B, D, E]
    );
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Paths
      [B],
      [B, D],
    ]);
  });

  it('strips away the C++ functions when going from combined to JS', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [A, B, C, D, E]));
    dispatch(ProfileView.changeImplementationFilter('js'));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [B, D, E]
    );
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Paths
      [B],
      [B, D],
    ]);
  });

  it('re-adds the C++ functions when going from JS to combined', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    dispatch(ProfileView.changeImplementationFilter('combined'));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [A, B, C, D, E]
    );
    expect(
      selectedThreadSelectors
        .getExpandedCallNodePaths(getState())
        // The paths will be in a weird order, so sort by length.
        .slice()
        .sort((a, b) => a.length - b.length)
    ).toEqual([
      // Paths
      [A],
      [A, B],
      [A, B, C],
      [A, B, C, D],
    ]);
  });

  it('can go from JS to C++ views', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    dispatch(ProfileView.changeImplementationFilter('cpp'));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [A, C]
    );
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Paths
      [A],
    ]);
  });
});

/**
 * The following tests naively runs through a dispatch and selector to provide coverage
 * over the Redux store to ensure that it behaves correctly.
 */
describe('actions/ProfileView', function() {
  describe('changeSelectedCallNode', function() {
    const { profile } = getProfileFromTextSamples(`
      A
      B
      C
    `);
    const { dispatch, getState } = storeWithProfile(profile);

    it('starts as not having a call node path', function() {
      expect(
        selectedThreadSelectors.getSelectedCallNodePath(getState())
      ).toEqual([]);
      dispatch(ProfileView.changeSelectedCallNode(0, [0, 1]));
      expect(
        selectedThreadSelectors.getSelectedCallNodePath(getState())
      ).toEqual([0, 1]);
    });
  });

  describe('changeSelectedThread', function() {
    const { profile } = getProfileFromTextSamples('A', 'B');
    const { dispatch, getState } = storeWithProfile(profile);

    it('can set and change the selected thread', function() {
      expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(0);
      dispatch(ProfileView.changeSelectedThread(1));
      expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(1);
    });
  });

  describe('focusCallTree', function() {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch, getState } = storeWithProfile(profile);

    it('updates the focus call tree generation', function() {
      expect(
        ProfileViewSelectors.getFocusCallTreeGeneration(getState())
      ).toEqual(0);
      dispatch(ProfileView.focusCallTree());
      expect(
        ProfileViewSelectors.getFocusCallTreeGeneration(getState())
      ).toEqual(1);
    });
  });

  describe('changeRightClickedThread', function() {
    const { profile } = getProfileFromTextSamples('A', 'B');
    const { dispatch, getState } = storeWithProfile(profile);

    it('changes the right clicked thread index', function() {
      expect(
        ProfileViewSelectors.getRightClickedThreadIndex(getState())
      ).toEqual(0);
      dispatch(ProfileView.changeRightClickedThread(1));
      expect(
        ProfileViewSelectors.getRightClickedThreadIndex(getState())
      ).toEqual(1);
    });
  });

  describe('changeThreadOrder', function() {
    const { profile } = getProfileFromTextSamples('A', 'B', 'C');
    const { dispatch, getState } = storeWithProfile(profile);

    it('changes the thread order', function() {
      expect(UrlStateSelectors.getThreadOrder(getState())).toEqual([0, 1, 2]);
      withAnalyticsMock(() => {
        dispatch(ProfileView.changeThreadOrder([2, 1, 0]));
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              eventAction: 'change thread order',
              eventCategory: 'profile',
              hitType: 'event',
            },
          ],
        ]);
      });
      expect(UrlStateSelectors.getThreadOrder(getState())).toEqual([2, 1, 0]);
    });
  });

  describe('hideThread', function() {
    const { profile } = getProfileFromTextSamples('A', 'B', 'C');
    const { dispatch, getState } = storeWithProfile(profile);

    it('hides threads', function() {
      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([]);
      withAnalyticsMock(() => {
        dispatch(ProfileView.hideThread(1));
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              eventAction: 'hide',
              eventCategory: 'threads',
              eventLabel: 'Empty',
              hitType: 'event',
            },
          ],
        ]);
      });
      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([1]);
    });
  });

  describe('showThread', function() {
    const { profile } = getProfileFromTextSamples('A', 'B', 'C');
    const { dispatch, getState } = storeWithProfile(profile);

    it('shows threads', function() {
      dispatch(ProfileView.hideThread(0));
      dispatch(ProfileView.hideThread(1));

      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([0, 1]);

      withAnalyticsMock(() => {
        dispatch(ProfileView.showThread(0));
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              eventAction: 'show',
              eventCategory: 'threads',
              eventLabel: 'Empty',
              hitType: 'event',
            },
          ],
        ]);
      });
      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([1]);
    });
  });

  describe('isolateThread', function() {
    const { profile } = getProfileFromTextSamples('A', 'B', 'C');
    const { dispatch, getState } = storeWithProfile(profile);

    it('isolates a thread', function() {
      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([]);

      withAnalyticsMock(() => {
        dispatch(ProfileView.isolateThread(1));

        expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([0, 2]);
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              eventAction: 'isolate',
              eventCategory: 'threads',
              eventLabel: 'Empty',
              hitType: 'event',
            },
          ],
        ]);
      });
    });
  });

  describe('changeCallTreeSearchString', function() {
    const { profile } = getProfileFromTextSamples('A', 'B', 'C');
    const { dispatch, getState } = storeWithProfile(profile);

    it('changes the call tree search string', function() {
      withAnalyticsMock(() => {
        expect(UrlStateSelectors.getCurrentSearchString(getState())).toEqual(
          ''
        );
        dispatch(ProfileView.changeCallTreeSearchString('foobar'));
        expect(UrlStateSelectors.getCurrentSearchString(getState())).toEqual(
          'foobar'
        );

        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              eventAction: 'call tree search string',
              eventCategory: 'profile',
              hitType: 'event',
            },
          ],
        ]);
      });
    });
  });

  /**
   * This test is more involved on checking for correctness compared to the other
   * tests, which are more for asserting their simple getter/setter types of behavior.
   */
  describe('expandAllCallNodeDescendants', function() {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A A A
      B B E
      C D
    `);
    const threadIndex = 0;
    const A = funcNames.indexOf('A');
    const B = funcNames.indexOf('B');
    const C = funcNames.indexOf('C');
    const D = funcNames.indexOf('D');
    const E = funcNames.indexOf('E');

    it('expands whole tree from root', function() {
      const { dispatch, getState } = storeWithProfile(profile);
      const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());

      // Before expand all action is dispatched, nothing is expanded
      expect(
        selectedThreadSelectors.getExpandedCallNodePaths(getState())
      ).toEqual([]);

      dispatch(
        ProfileView.expandAllCallNodeDescendants(
          threadIndex,
          0, // A
          callNodeInfo
        )
      );

      expect(
        selectedThreadSelectors.getExpandedCallNodePaths(getState()).sort()
      ).toEqual([
        // Paths
        [A],
        [A, B],
        [A, B, C],
        [A, B, D],
        [A, E],
      ]);
    });

    it('expands subtrees', function() {
      const { dispatch, getState } = storeWithProfile(profile);

      // First expand A by selecting B
      dispatch(ProfileView.changeSelectedCallNode(threadIndex, [A, B]));

      const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());

      // Before expand all action is dispatched, only A is expanded
      expect(
        selectedThreadSelectors.getExpandedCallNodePaths(getState())
      ).toEqual([
        // Paths
        [A],
      ]);

      dispatch(
        ProfileView.expandAllCallNodeDescendants(
          threadIndex,
          1, // B
          callNodeInfo
        )
      );

      expect(
        selectedThreadSelectors.getExpandedCallNodePaths(getState()).sort()
      ).toEqual([
        // Paths
        [A],
        [A, B],
        [A, B, C],
        [A, B, D],
      ]);
    });
  });

  describe('changeExpandedCallNodes', function() {
    const { profile } = getProfileFromTextSamples(`
      A
      B
      C
      D
    `);
    const { dispatch, getState } = storeWithProfile(profile);

    it('changes the expanded call nodes', function() {
      expect(
        selectedThreadSelectors.getExpandedCallNodePaths(getState())
      ).toEqual([]);
      dispatch(ProfileView.changeExpandedCallNodes(0, [[0], [0, 1]]));
      expect(
        selectedThreadSelectors.getExpandedCallNodePaths(getState())
      ).toEqual([[0], [0, 1]]);
    });
  });

  describe('changeSelectedMarker', function() {
    const profile = getProfileWithMarkers([['a', 0, null], ['b', 1, null]]);
    const { dispatch, getState } = storeWithProfile(profile);

    it('changes the selected marker', function() {
      expect(
        selectedThreadSelectors.getViewOptions(getState()).selectedMarker
      ).toEqual(-1);
      dispatch(ProfileView.changeSelectedMarker(0, 0));
      expect(
        selectedThreadSelectors.getViewOptions(getState()).selectedMarker
      ).toEqual(0);
    });
  });

  describe('changeMarkersSearchString', function() {
    const profile = getProfileWithMarkers([['a', 0, null], ['b', 1, null]]);
    const { dispatch, getState } = storeWithProfile(profile);

    it('changes the search string', function() {
      expect(UrlStateSelectors.getMarkersSearchString(getState())).toEqual('');
      dispatch(ProfileView.changeMarkersSearchString('a'));
      expect(UrlStateSelectors.getMarkersSearchString(getState())).toEqual('a');
    });
  });

  describe('changeImplementationFilter', function() {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch, getState } = storeWithProfile(profile);

    it('changes the implementation filter', function() {
      expect(UrlStateSelectors.getImplementationFilter(getState())).toEqual(
        'combined'
      );
      withAnalyticsMock(() => {
        dispatch(ProfileView.changeImplementationFilter('js'));
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              eventAction: 'change implementation filter',
              eventCategory: 'profile',
              eventLabel: 'js',
              hitType: 'event',
            },
          ],
        ]);
      });
      expect(UrlStateSelectors.getImplementationFilter(getState())).toEqual(
        'js'
      );
    });
  });

  describe('changeInvertCallstack', function() {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch, getState } = storeWithProfile(profile);

    it('changes the callstack inversion', function() {
      expect(UrlStateSelectors.getInvertCallstack(getState())).toEqual(false);
      withAnalyticsMock(() => {
        dispatch(ProfileView.changeInvertCallstack(true));
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              eventAction: 'change invert callstack',
              eventCategory: 'profile',
              hitType: 'event',
            },
          ],
        ]);
      });
      expect(UrlStateSelectors.getInvertCallstack(getState())).toEqual(true);
    });
  });

  describe('updateProfileSelection', function() {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch, getState } = storeWithProfile(profile);

    it('updates the profile selection', function() {
      expect(
        ProfileViewSelectors.getProfileViewOptions(getState()).selection
      ).toEqual({ hasSelection: false, isModifying: false });
      dispatch(
        ProfileView.updateProfileSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 0,
          selectionEnd: 1,
        })
      );
      expect(
        ProfileViewSelectors.getProfileViewOptions(getState()).selection
      ).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 0,
        selectionEnd: 1,
      });
    });
  });

  describe('addRangeFilter', function() {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch, getState } = storeWithProfile(profile);

    it('adds a range filter', function() {
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([]);
      dispatch(ProfileView.addRangeFilter(0, 10));
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([
        { start: 0, end: 10 },
      ]);

      dispatch(ProfileView.addRangeFilter(1, 9));
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
      ]);
    });
  });

  describe('addRangeFilterAndUnsetSelection', function() {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch, getState } = storeWithProfile(profile);

    it('adds a range filter and unsets a selection', function() {
      dispatch(ProfileView.addRangeFilter(0, 10));
      dispatch(
        ProfileView.updateProfileSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 1,
          selectionEnd: 9,
        })
      );
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([
        { start: 0, end: 10 },
      ]);
      expect(
        ProfileViewSelectors.getProfileViewOptions(getState()).selection
      ).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionEnd: 9,
        selectionStart: 1,
      });

      dispatch(ProfileView.addRangeFilterAndUnsetSelection(2, 8));
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 2, end: 8 },
      ]);
      expect(
        ProfileViewSelectors.getProfileViewOptions(getState()).selection
      ).toEqual({
        hasSelection: false,
        isModifying: false,
      });
    });
  });

  describe('popRangeFilters', function() {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch, getState } = storeWithProfile(profile);

    it('pops a range filter', function() {
      dispatch(ProfileView.addRangeFilter(0, 10));
      dispatch(ProfileView.addRangeFilter(1, 9));
      dispatch(ProfileView.addRangeFilter(2, 8));
      dispatch(ProfileView.addRangeFilter(3, 7));
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
        { start: 2, end: 8 },
        { start: 3, end: 7 },
      ]);
      dispatch(ProfileView.popRangeFilters(2));
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
      ]);
    });
  });

  describe('popRangeFiltersAndUnsetSelection', function() {
    const { profile } = getProfileFromTextSamples('A');
    const { dispatch, getState } = storeWithProfile(profile);

    it('pops a range filter and unsets the selection', function() {
      dispatch(ProfileView.addRangeFilter(0, 10));
      dispatch(ProfileView.addRangeFilter(1, 9));
      dispatch(ProfileView.addRangeFilter(2, 8));
      dispatch(ProfileView.addRangeFilter(3, 7));
      dispatch(
        ProfileView.updateProfileSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 1,
          selectionEnd: 9,
        })
      );
      expect(
        ProfileViewSelectors.getProfileViewOptions(getState()).selection
      ).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionEnd: 9,
        selectionStart: 1,
      });
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
        { start: 2, end: 8 },
        { start: 3, end: 7 },
      ]);

      dispatch(ProfileView.popRangeFiltersAndUnsetSelection(2));
      expect(UrlStateSelectors.getRangeFilters(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
      ]);
      expect(
        ProfileViewSelectors.getProfileViewOptions(getState()).selection
      ).toEqual({
        hasSelection: false,
        isModifying: false,
      });
    });
  });

  describe('addTransformToStack', function() {
    const { profile } = getProfileFromTextSamples(`
      A
      B
      C
    `);
    const { dispatch, getState } = storeWithProfile(profile);

    it('can add a transform to the stack', function() {
      expect(UrlStateSelectors.getTransformStack(getState(), 0)).toEqual([]);
      withAnalyticsMock(() => {
        dispatch(
          ProfileView.addTransformToStack(0, {
            type: 'merge-function',
            funcIndex: 1,
          })
        );
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              eventAction: 'add transform',
              eventCategory: 'profile',
              eventLabel: 'merge-function',
              hitType: 'event',
            },
          ],
        ]);
      });
      expect(UrlStateSelectors.getTransformStack(getState(), 0)).toEqual([
        {
          type: 'merge-function',
          funcIndex: 1,
        },
      ]);
    });
  });

  describe('popTransformToStack', function() {
    const { profile } = getProfileFromTextSamples(`
      A
      B
      C
    `);
    const { dispatch, getState } = storeWithProfile(profile);

    it('can add a transform to the stack', function() {
      dispatch(
        ProfileView.addTransformToStack(0, {
          type: 'merge-function',
          funcIndex: 1,
        })
      );
      dispatch(
        ProfileView.addTransformToStack(0, {
          type: 'merge-function',
          funcIndex: 2,
        })
      );
      expect(UrlStateSelectors.getTransformStack(getState(), 0)).toEqual([
        {
          type: 'merge-function',
          funcIndex: 1,
        },
        {
          type: 'merge-function',
          funcIndex: 2,
        },
      ]);
      dispatch(ProfileView.popTransformsFromStack(1));
      expect(UrlStateSelectors.getTransformStack(getState(), 0)).toEqual([
        {
          type: 'merge-function',
          funcIndex: 1,
        },
      ]);
    });
  });
});
