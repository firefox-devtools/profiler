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
 * The following tests run through a dispatch and selector to provide coverage
 * over the Redux store to ensure that it behaves correctly. The intent is to cover
 * every single action, but do the bare minimum in the test to assert the relationship
 * between the actions and reducers.
 */
describe('actions/ProfileView', function() {
  describe('changeSelectedCallNode', function() {
    it('can change the call node', function() {
      const { profile } = getProfileFromTextSamples(`
        A
        B
        C
        `);
      const { dispatch, getState } = storeWithProfile(profile);

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
    it('can set and change the selected thread', function() {
      const { profile } = getProfileFromTextSamples('A', 'B');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(0);
      dispatch(ProfileView.changeSelectedThread(1));
      expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(1);
    });
  });

  describe('focusCallTree', function() {
    it('updates the focus call tree generation', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

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
    it('changes the right clicked thread index', function() {
      const { profile } = getProfileFromTextSamples('A', 'B');
      const { dispatch, getState } = storeWithProfile(profile);

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
    it('changes the thread order', function() {
      const { profile } = getProfileFromTextSamples('A', 'B', 'C');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getThreadOrder(getState())).toEqual([0, 1, 2]);
      withAnalyticsMock(() => {
        dispatch(ProfileView.changeThreadOrder([2, 1, 0]));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'change thread order',
          eventCategory: 'profile',
          hitType: 'event',
        });
      });
      expect(UrlStateSelectors.getThreadOrder(getState())).toEqual([2, 1, 0]);
    });
  });

  describe('hideThread', function() {
    it('hides threads', function() {
      const { profile } = getProfileFromTextSamples('A', 'B', 'C');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([]);
      withAnalyticsMock(() => {
        dispatch(ProfileView.hideThread(1));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'hide',
          eventCategory: 'threads',
          eventLabel: 'Empty',
          hitType: 'event',
        });
      });
      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([1]);
    });
  });

  describe('showThread', function() {
    it('shows threads', function() {
      const { profile } = getProfileFromTextSamples('A', 'B', 'C');
      const { dispatch, getState } = storeWithProfile(profile);

      dispatch(ProfileView.hideThread(0));
      dispatch(ProfileView.hideThread(1));

      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([0, 1]);

      withAnalyticsMock(() => {
        dispatch(ProfileView.showThread(0));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'show',
          eventCategory: 'threads',
          eventLabel: 'Empty',
          hitType: 'event',
        });
      });
      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([1]);
    });
  });

  describe('isolateThread', function() {
    it('isolates a thread', function() {
      const { profile } = getProfileFromTextSamples('A', 'B', 'C');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([]);

      withAnalyticsMock(() => {
        dispatch(ProfileView.isolateThread(1));

        expect(UrlStateSelectors.getHiddenThreads(getState())).toEqual([0, 2]);
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'isolate',
          eventCategory: 'threads',
          eventLabel: 'Empty',
          hitType: 'event',
        });
      });
    });
  });

  describe('changeCallTreeSearchString', function() {
    it('changes the call tree search string', function() {
      const { profile } = getProfileFromTextSamples('A', 'B', 'C');
      const { dispatch, getState } = storeWithProfile(profile);

      withAnalyticsMock(() => {
        expect(UrlStateSelectors.getCurrentSearchString(getState())).toEqual(
          ''
        );
        dispatch(ProfileView.changeCallTreeSearchString('foobar'));
        expect(UrlStateSelectors.getCurrentSearchString(getState())).toEqual(
          'foobar'
        );

        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'call tree search string',
          eventCategory: 'profile',
          hitType: 'event',
        });
      });
    });
  });

  /**
   * This test is more involved on checking for correctness compared to the other
   * tests, which are more for asserting their simple getter/setter types of behavior.
   */
  describe('expandAllCallNodeDescendants', function() {
    function setupStore() {
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
      const { getState, dispatch } = storeWithProfile(profile);
      return { A, B, C, D, E, threadIndex, getState, dispatch };
    }

    it('expands whole tree from root', function() {
      const { getState, dispatch, threadIndex, A, B, C, D, E } = setupStore();
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
      const { getState, dispatch, threadIndex, A, B, C, D } = setupStore();

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
    it('changes the expanded call nodes', function() {
      const { profile } = getProfileFromTextSamples(`
        A
        B
        C
        D
        `);
      const { dispatch, getState } = storeWithProfile(profile);

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
    it('changes the selected marker', function() {
      const profile = getProfileWithMarkers([['a', 0, null], ['b', 1, null]]);
      const { dispatch, getState } = storeWithProfile(profile);

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
    it('changes the search string', function() {
      const profile = getProfileWithMarkers([['a', 0, null], ['b', 1, null]]);
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getMarkersSearchString(getState())).toEqual('');
      dispatch(ProfileView.changeMarkersSearchString('a'));
      expect(UrlStateSelectors.getMarkersSearchString(getState())).toEqual('a');
    });
  });

  describe('changeImplementationFilter', function() {
    it('changes the implementation filter', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getImplementationFilter(getState())).toEqual(
        'combined'
      );
      withAnalyticsMock(() => {
        dispatch(ProfileView.changeImplementationFilter('js'));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'change implementation filter',
          eventCategory: 'profile',
          eventLabel: 'js',
          hitType: 'event',
        });
      });
      expect(UrlStateSelectors.getImplementationFilter(getState())).toEqual(
        'js'
      );
    });
  });

  describe('changeInvertCallstack', function() {
    it('changes the callstack inversion', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getInvertCallstack(getState())).toEqual(false);
      withAnalyticsMock(() => {
        dispatch(ProfileView.changeInvertCallstack(true));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'change invert callstack',
          eventCategory: 'profile',
          hitType: 'event',
        });
      });
      expect(UrlStateSelectors.getInvertCallstack(getState())).toEqual(true);
    });
  });

  describe('updateProfileSelection', function() {
    it('updates the profile selection', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

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
    it('adds a range filter', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

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
    it('adds a range filter and unsets a selection', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

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
    function setupStore() {
      const { profile } = getProfileFromTextSamples('A');
      const store = storeWithProfile(profile);
      store.dispatch(ProfileView.addRangeFilter(0, 10));
      store.dispatch(ProfileView.addRangeFilter(1, 9));
      store.dispatch(ProfileView.addRangeFilter(2, 8));
      store.dispatch(ProfileView.addRangeFilter(3, 7));
      return store;
    }

    it('pops a range filter', function() {
      const { getState, dispatch } = setupStore();
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

    it('pops a range filter and unsets the selection', function() {
      const { getState, dispatch } = setupStore();
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
    it('can add a transform to the stack', function() {
      const { profile } = getProfileFromTextSamples(`
        A
        B
        C
        `);
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getTransformStack(getState(), 0)).toEqual([]);
      withAnalyticsMock(() => {
        dispatch(
          ProfileView.addTransformToStack(0, {
            type: 'merge-function',
            funcIndex: 1,
          })
        );
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'add transform',
          eventCategory: 'profile',
          eventLabel: 'merge-function',
          hitType: 'event',
        });
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
    it('can add a transform to the stack', function() {
      const { profile } = getProfileFromTextSamples(`
        A
        B
        C
        `);
      const { dispatch, getState } = storeWithProfile(profile);

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

/**
 * Naively run through all the selectors. The correctness of what they are computing
 * should be left up to better informed unit tests. This provides some base coverage
 * of mechanically running through the selectors in tests.
 */
describe('snapshots of selectors/profile-view', function() {
  // Set up a profile that has some nice features that can show that the selectors work.
  const {
    profile,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A A A A A A A A A
    B B B B B B B B B
    C C C C C C H H H
    D D D F F F I I I
    E E E G G G
  `);
  const A = funcNames.indexOf('A');
  const B = funcNames.indexOf('B');
  const C = funcNames.indexOf('C');

  const [samplesThread] = profile.threads;
  // Add in a thread with markers
  const { threads: [markersThread] } = getProfileWithMarkers([
    ['A', 0, null],
    ['B', 1, null],
    ['C', 2, null],
    ['D', 3, null],
    ['E', 4, null],
    ['F', 5, null],
  ]);
  profile.threads.push(markersThread);
  const { getState, dispatch } = storeWithProfile(profile);
  samplesThread.name = 'Thread with samples';
  markersThread.name = 'Thread with markers';
  samplesThread.markers = markersThread.markers;
  // This is a jank sample:
  samplesThread.samples.responsiveness[4] = 100;
  const mergeFunction = {
    type: 'merge-function',
    funcIndex: C,
  };
  dispatch(ProfileView.addTransformToStack(0, mergeFunction));
  dispatch(ProfileView.changeExpandedCallNodes(0, [[A], [A, B]]));
  dispatch(ProfileView.changeSelectedCallNode(0, [A, B]));
  dispatch(ProfileView.changeSelectedMarker(0, 1));
  dispatch(ProfileView.addRangeFilter(3, 7));

  it('matches the last stored run of getProfile', function() {
    expect(ProfileViewSelectors.getProfile(getState())).toMatchSnapshot();
  });
  it('matches the last stored run of getProfileInterval', function() {
    expect(ProfileViewSelectors.getProfileInterval(getState())).toEqual(1);
  });
  it('matches the last stored run of getThreads', function() {
    expect(ProfileViewSelectors.getThreads(getState())).toMatchSnapshot();
  });
  it('matches the last stored run of getThreadNames', function() {
    expect(ProfileViewSelectors.getThreadNames(getState())).toEqual([
      'Thread with samples',
      'Thread with markers',
    ]);
  });
  it('matches the last stored run of getRightClickedThreadIndex', function() {
    expect(ProfileViewSelectors.getRightClickedThreadIndex(getState())).toEqual(
      0
    );
  });
  it('matches the last stored run of selectedThreadSelector.getThread', function() {
    expect(selectedThreadSelectors.getThread(getState())).toEqual(
      samplesThread
    );
  });
  it('matches the last stored run of selectedThreadSelector.getViewOptions', function() {
    expect(
      selectedThreadSelectors.getViewOptions(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getTransformStack', function() {
    expect(selectedThreadSelectors.getTransformStack(getState())).toEqual([
      mergeFunction,
    ]);
  });
  it('matches the last stored run of selectedThreadSelector.getTransformLabels', function() {
    expect(selectedThreadSelectors.getTransformLabels(getState())).toEqual([
      'Complete "Thread with samples"',
      'Merge: C',
    ]);
  });
  it('matches the last stored run of selectedThreadSelector.getRangeFilteredThread', function() {
    expect(
      selectedThreadSelectors.getRangeFilteredThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getRangeAndTransformFilteredThread', function() {
    expect(
      selectedThreadSelectors.getRangeAndTransformFilteredThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getJankInstances', function() {
    expect(
      selectedThreadSelectors.getJankInstances(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getProcessedMarkersThread', function() {
    expect(
      selectedThreadSelectors.getProcessedMarkersThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getTracingMarkers', function() {
    expect(
      selectedThreadSelectors.getTracingMarkers(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getMarkerTiming', function() {
    expect(
      selectedThreadSelectors.getMarkerTiming(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getRangeSelectionFilteredTracingMarkers', function() {
    expect(
      selectedThreadSelectors.getRangeSelectionFilteredTracingMarkers(
        getState()
      )
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getRangeSelectionFilteredTracingMarkersForHeader', function() {
    expect(
      selectedThreadSelectors.getRangeSelectionFilteredTracingMarkersForHeader(
        getState()
      )
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getFilteredThread', function() {
    expect(
      selectedThreadSelectors.getFilteredThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getRangeSelectionFilteredThread', function() {
    expect(
      selectedThreadSelectors.getRangeSelectionFilteredThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getCallNodeInfo', function() {
    expect(
      selectedThreadSelectors.getCallNodeInfo(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getCallNodeMaxDepth', function() {
    expect(selectedThreadSelectors.getCallNodeMaxDepth(getState())).toEqual(4);
  });
  it('matches the last stored run of selectedThreadSelector.getSelectedCallNodePath', function() {
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [A, B]
    );
  });
  it('matches the last stored run of selectedThreadSelector.getSelectedCallNodeIndex', function() {
    expect(
      selectedThreadSelectors.getSelectedCallNodeIndex(getState())
    ).toEqual(1);
  });
  it('matches the last stored run of selectedThreadSelector.getExpandedCallNodePaths', function() {
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([[A], [A, B], [A]]);
  });
  it('matches the last stored run of selectedThreadSelector.getExpandedCallNodeIndexes', function() {
    expect(
      selectedThreadSelectors.getExpandedCallNodeIndexes(getState())
    ).toEqual([0, 1, 0]);
  });
  it('matches the last stored run of selectedThreadSelector.getCallTree', function() {
    expect(selectedThreadSelectors.getCallTree(getState())).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getFlameGraphTiming', function() {
    expect(
      selectedThreadSelectors.getFlameGraphTiming(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getFriendlyThreadName', function() {
    expect(selectedThreadSelectors.getFriendlyThreadName(getState())).toEqual(
      'Thread with samples'
    );
  });
  it('matches the last stored run of selectedThreadSelector.getThreadProcessDetails', function() {
    expect(
      selectedThreadSelectors.getThreadProcessDetails(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getSearchFilteredMarkers', function() {
    expect(
      selectedThreadSelectors.getSearchFilteredMarkers(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.unfilteredSamplesRange', function() {
    expect(selectedThreadSelectors.unfilteredSamplesRange(getState())).toEqual({
      end: 9,
      start: 0,
    });
  });
});
