/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { TrackReference } from '../../types/actions';
import type { TabSlug } from '../../app-logic/tabs-handling';

import {
  getEmptyThread,
  getProfileFromTextSamples,
  getProfileWithMarkers,
  getNetworkTrackProfile,
  getScreenshotTrackProfile,
  getNetworkMarker,
} from '../fixtures/profiles/make-profile';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';
import { getEmptyProfile } from '../../profile-logic/profile-data';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { blankStore, storeWithProfile } from '../fixtures/stores';
import { assertSetContainsOnly } from '../fixtures/custom-assertions';

import * as App from '../../actions/app';
import * as ProfileView from '../../actions/profile-view';
import { viewProfile } from '../../actions/receive-profile';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import * as UrlStateSelectors from '../../reducers/url-state';
import { stateFromLocation } from '../../app-logic/url-handling';

const { selectedThreadSelectors, selectedNodeSelectors } = ProfileViewSelectors;

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

    assertSetContainsOnly(
      selectedThreadSelectors.getExpandedCallNodePaths(getState()),
      [
        // Paths
        [A],
        [A, B],
        [A, B, C],
        [A, B, C, D],
      ]
    );
  });

  it('starts with js CallNodePaths', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [B, D, E]
    );

    assertSetContainsOnly(
      selectedThreadSelectors.getExpandedCallNodePaths(getState()),
      [
        // Paths
        [B],
        [B, D],
      ]
    );
  });

  it('strips away the C++ functions when going from combined to JS', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [A, B, C, D, E]));
    dispatch(ProfileView.changeImplementationFilter('js'));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [B, D, E]
    );

    assertSetContainsOnly(
      selectedThreadSelectors.getExpandedCallNodePaths(getState()),
      [
        // Paths
        [B],
        [B, D],
      ]
    );
  });

  it('re-adds the C++ functions when going from JS to combined', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    dispatch(ProfileView.changeImplementationFilter('combined'));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [A, B, C, D, E]
    );

    assertSetContainsOnly(
      selectedThreadSelectors.getExpandedCallNodePaths(getState()),
      [
        // Paths
        [A],
        [A, B],
        [A, B, C],
        [A, B, C, D],
      ]
    );
  });

  it('can go from JS to C++ views', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(ProfileView.changeImplementationFilter('js'));
    dispatch(ProfileView.changeSelectedCallNode(threadIndex, [B, D, E]));
    dispatch(ProfileView.changeImplementationFilter('cpp'));
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [A, C]
    );
    assertSetContainsOnly(
      selectedThreadSelectors.getExpandedCallNodePaths(getState()),
      [
        // Paths
        [A],
      ]
    );
  });
});

describe('getJankInstances', function() {
  function setup({ sampleCount, responsiveness }) {
    const { profile } = getProfileFromTextSamples(
      Array(sampleCount)
        .fill('A')
        .join('  ')
    );
    profile.threads[0].samples.responsiveness = responsiveness;
    const { getState } = storeWithProfile(profile);
    return selectedThreadSelectors.getJankInstances(getState());
  }

  it('will not create any jank markers for undefined responsiveness', function() {
    const jankInstances = setup({
      sampleCount: 10,
      responsiveness: [],
    });
    expect(jankInstances).toEqual([]);
  });

  it('will not create any jank markers for null responsiveness', function() {
    const responsiveness = Array(10).fill(null);
    const jankInstances = setup({
      sampleCount: responsiveness.length,
      responsiveness,
    });
    expect(jankInstances).toEqual([]);
  });

  it('will create a jank instance', function() {
    const breakingPoint = 70;
    const responsiveness = [0, 20, 40, 60, breakingPoint, 0, 20, 40];
    const jankInstances = setup({
      sampleCount: responsiveness.length,
      responsiveness,
    });
    expect(jankInstances.length).toEqual(1);
    expect(jankInstances[0].dur).toEqual(breakingPoint);
  });

  it('will skip null responsiveness values', function() {
    const breakingPoint = 70;
    const responsiveness = [0, 20, 40, null, breakingPoint, null, 0, 20, 40];
    const jankInstances = setup({
      sampleCount: responsiveness.length,
      responsiveness,
    });
    expect(jankInstances.length).toEqual(1);
    expect(jankInstances[0].dur).toEqual(breakingPoint);
  });

  it('will skip null responsiveness values after a breaking point', function() {
    const breakingPoint = 70;
    const responsiveness = [0, 20, 40, 60, breakingPoint, null, 10, 20];
    const jankInstances = setup({
      sampleCount: responsiveness.length,
      responsiveness,
    });
    expect(jankInstances.length).toEqual(1);
    expect(jankInstances[0].dur).toEqual(breakingPoint);
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

  describe('selectTrack', function() {
    /**
     * Using the following tracks:
     *  [
     *    'show [thread GeckoMain process]',
     *    'show [thread GeckoMain tab]',
     *    '  - show [thread DOM Worker]',
     *    '  - show [thread Style]',
     *  ]
     */
    const parentTrackReference = { type: 'global', trackIndex: 0 };
    const tabTrackReference = { type: 'global', trackIndex: 1 };
    const workerTrackReference = { type: 'local', trackIndex: 0, pid: 222 };

    function storeWithTab(tabSlug: TabSlug) {
      const profile = getProfileWithNiceTracks();
      const { dispatch, getState } = blankStore();
      const newUrlState = stateFromLocation({
        pathname: `/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/${tabSlug}/`,
        search: '',
        hash: '',
      });
      dispatch({
        type: 'UPDATE_URL_STATE',
        newUrlState,
      });
      dispatch(viewProfile(profile));

      return { profile, dispatch, getState };
    }

    function setup(tabSlug: TabSlug = 'calltree') {
      const { profile, dispatch, getState } = storeWithTab(tabSlug);
      const parentTrack = ProfileViewSelectors.getGlobalTrackFromReference(
        getState(),
        parentTrackReference
      );
      const tabTrack = ProfileViewSelectors.getGlobalTrackFromReference(
        getState(),
        tabTrackReference
      );
      const workerTrack = ProfileViewSelectors.getLocalTrackFromReference(
        getState(),
        workerTrackReference
      );
      if (tabTrack.type !== 'process' || parentTrack.type !== 'process') {
        throw new Error('Expected to get process tracks.');
      }
      if (workerTrack.type !== 'thread') {
        throw new Error('Expected to get a thread tracks.');
      }
      return {
        profile,
        getState,
        dispatch,
        parentTrack,
        tabTrack,
        workerTrack,
      };
    }

    describe('with a thread tracks', function() {
      it('starts out with the tab thread selected', function() {
        const { getState, tabTrack } = setup();
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
          tabTrack.mainThreadIndex
        );
      });

      it('can switch to another global track', function() {
        const { getState, dispatch, parentTrack } = setup();
        dispatch(ProfileView.selectTrack(parentTrackReference));
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
          parentTrack.mainThreadIndex
        );
      });

      it('can switch to a local track', function() {
        const { getState, dispatch, workerTrack } = setup();
        dispatch(ProfileView.selectTrack(workerTrackReference));
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
          workerTrack.threadIndex
        );
      });
    });
    describe('with a network track', function() {
      const threadTrack: TrackReference = {
        type: 'local',
        trackIndex: 0,
        pid: 0,
      };
      const networkTrack: TrackReference = {
        type: 'local',
        trackIndex: 1,
        pid: 0,
      };
      it('it starts out with the thread track and call tree selected', function() {
        const profile = getNetworkTrackProfile();
        const { getState } = storeWithProfile(profile);
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(0);
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'calltree'
        );
      });
      it('it can switch to the network track, which selects the network chart tab', function() {
        const profile = getNetworkTrackProfile();
        const { dispatch, getState } = storeWithProfile(profile);
        dispatch(ProfileView.selectTrack(networkTrack));
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(0);
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'network-chart'
        );
      });
      it('it can switch back to the thread, which remembers the last viewed panel', function() {
        const profile = getNetworkTrackProfile();
        const { dispatch, getState } = storeWithProfile(profile);
        dispatch(App.changeSelectedTab('flame-graph'));
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(0);
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'flame-graph'
        );
        dispatch(ProfileView.selectTrack(networkTrack));
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(0);
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'network-chart'
        );
        dispatch(ProfileView.selectTrack(threadTrack));
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(0);
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'flame-graph'
        );
      });
    });

    describe('when the loaded panel is not the call tree', function() {
      it('stays in the same panel when selecting another track', function() {
        const { getState, dispatch, parentTrack } = setup('marker-chart');
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'marker-chart'
        );
        dispatch(ProfileView.selectTrack(parentTrackReference));
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
          parentTrack.mainThreadIndex
        );
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'marker-chart'
        );
      });

      it('moves to the call tree when then initial tab is the network chart', function() {
        const { getState, dispatch, parentTrack } = setup('network-chart');
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'network-chart'
        );
        dispatch(ProfileView.selectTrack(parentTrackReference));
        expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
          parentTrack.mainThreadIndex
        );
        expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
          'calltree'
        );
      });
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

  describe('changeRightClickedTrack', function() {
    it('changes the right clicked thread index', function() {
      const { profile } = getProfileFromTextSamples('A', 'B');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(ProfileViewSelectors.getRightClickedTrack(getState())).toEqual({
        trackIndex: 0,
        type: 'global',
      });
      dispatch(
        ProfileView.changeRightClickedTrack({ trackIndex: 1, type: 'global' })
      );
      expect(ProfileViewSelectors.getRightClickedTrack(getState())).toEqual({
        trackIndex: 1,
        type: 'global',
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
        A  A  A
        B  B  E
        C  D
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
        Array.from(selectedThreadSelectors.getExpandedCallNodePaths(getState()))
      ).toEqual([]);

      dispatch(
        ProfileView.expandAllCallNodeDescendants(
          threadIndex,
          0, // A
          callNodeInfo
        )
      );

      assertSetContainsOnly(
        selectedThreadSelectors.getExpandedCallNodePaths(getState()),
        [
          // Paths
          [A],
          [A, B],
          [A, B, C],
          [A, B, D],
          [A, E],
        ]
      );
    });

    it('expands subtrees', function() {
      const { getState, dispatch, threadIndex, A, B, C, D } = setupStore();

      // First expand A by selecting B
      dispatch(ProfileView.changeSelectedCallNode(threadIndex, [A, B]));

      const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());

      // Before expand all action is dispatched, only A is expanded
      assertSetContainsOnly(
        selectedThreadSelectors.getExpandedCallNodePaths(getState()),
        [
          // Paths
          [A],
        ]
      );

      dispatch(
        ProfileView.expandAllCallNodeDescendants(
          threadIndex,
          1, // B
          callNodeInfo
        )
      );

      assertSetContainsOnly(
        selectedThreadSelectors.getExpandedCallNodePaths(getState()),
        [
          // Paths
          [A],
          [A, B],
          [A, B, C],
          [A, B, D],
        ]
      );
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
        Array.from(selectedThreadSelectors.getExpandedCallNodePaths(getState()))
      ).toEqual([]);
      dispatch(ProfileView.changeExpandedCallNodes(0, [[0], [0, 1]]));
      assertSetContainsOnly(
        selectedThreadSelectors.getExpandedCallNodePaths(getState()),
        [[0], [0, 1]]
      );
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

  describe('updatePreviewSelection', function() {
    it('updates the profile selection', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual({
        hasSelection: false,
        isModifying: false,
      });
      dispatch(
        ProfileView.updatePreviewSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 0,
          selectionEnd: 1,
        })
      );
      expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionStart: 0,
        selectionEnd: 1,
      });
    });
  });

  describe('commitRange', function() {
    it('commits a range', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([]);
      dispatch(ProfileView.commitRange(0, 10));
      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 10 },
      ]);

      dispatch(ProfileView.commitRange(1, 9));
      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
      ]);
    });
  });

  describe('commitRangeAndUnsetSelection', function() {
    it('commits a range and unsets a selection', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { dispatch, getState } = storeWithProfile(profile);

      dispatch(ProfileView.commitRange(0, 10));
      dispatch(
        ProfileView.updatePreviewSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 1,
          selectionEnd: 9,
        })
      );
      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 10 },
      ]);
      expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionEnd: 9,
        selectionStart: 1,
      });

      dispatch(ProfileView.commitRange(2, 8));
      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 2, end: 8 },
      ]);
      expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual({
        hasSelection: false,
        isModifying: false,
      });
    });
  });

  describe('popCommittedRanges', function() {
    function setupStore() {
      const { profile } = getProfileFromTextSamples('A');
      const store = storeWithProfile(profile);
      store.dispatch(ProfileView.commitRange(0, 10));
      store.dispatch(ProfileView.commitRange(1, 9));
      store.dispatch(ProfileView.commitRange(2, 8));
      store.dispatch(ProfileView.commitRange(3, 7));
      return store;
    }

    it('pops a committed range', function() {
      const { getState, dispatch } = setupStore();
      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
        { start: 2, end: 8 },
        { start: 3, end: 7 },
      ]);
      dispatch(ProfileView.popCommittedRanges(2));
      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
      ]);
    });

    it('pops a committed range and unsets the selection', function() {
      const { getState, dispatch } = setupStore();
      dispatch(
        ProfileView.updatePreviewSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 1,
          selectionEnd: 9,
        })
      );
      expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual({
        hasSelection: true,
        isModifying: false,
        selectionEnd: 9,
        selectionStart: 1,
      });
      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
        { start: 2, end: 8 },
        { start: 3, end: 7 },
      ]);

      dispatch(ProfileView.popCommittedRanges(2));
      expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
      ]);
      expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual({
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
    it('can add and remove a transform to the stack', function() {
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

  describe('getRangeFilteredScreenshotsById', function() {
    it('can extract some network markers and match the snapshot', function() {
      const profile = getScreenshotTrackProfile();
      const { getState } = storeWithProfile(profile);
      const screenshotMarkersById = selectedThreadSelectors.getRangeFilteredScreenshotsById(
        getState()
      );
      const keys = [...screenshotMarkersById.keys()];
      expect(keys.length).toEqual(1);

      const [screenshots] = [...screenshotMarkersById.values()];
      if (!screenshots) {
        throw new Error('No screenshots found.');
      }
      expect(screenshots.length).toEqual(profile.threads[0].markers.length);
      for (const screenshot of screenshots) {
        expect(screenshot.name).toEqual('CompositorScreenshot');
      }
    });

    it('can extract some network markers and match the snapshot', function() {
      const profile = getScreenshotTrackProfile();
      const [{ markers }] = profile.threads;
      const { dispatch, getState } = storeWithProfile(profile);

      // Double check that there are 10 markers in the test data, and commit a
      // subsection of that range.
      expect(markers.length).toBe(10);
      const startIndex = 3;
      const endIndex = 8;
      const startTime = markers.time[startIndex];
      const endTime = markers.time[endIndex];
      dispatch(ProfileView.commitRange(startTime, endTime));

      // Get out the tracing markers.
      const screenshotMarkersById = selectedThreadSelectors.getRangeFilteredScreenshotsById(
        getState()
      );
      const [key] = [...screenshotMarkersById.keys()];
      const screenshots = screenshotMarkersById.get(key);
      if (!screenshots) {
        throw new Error('No screenshots found.');
      }
      expect(screenshots.length).toEqual(endIndex - startIndex + 1);
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
  function setupStore() {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A  A  A  A  A  A  A  A  A
      B  B  B  B  B  B  B  B  B
      C  C  C  C  C  C  H  H  H
      D  D  D  F  F  F  I  I  I
      E  E  E  G  G  G
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
      getNetworkMarker(6, 6),
      getNetworkMarker(7, 7),
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
    dispatch(ProfileView.commitRange(3, 7)); // Reminder: upper bound "7" is exclusive.
    dispatch(
      ProfileView.updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 4,
        selectionEnd: 6,
      })
    );
    return { getState, dispatch, samplesThread, mergeFunction, A, B, C };
  }
  it('matches the last stored run of getProfile', function() {
    const { getState } = setupStore();
    expect(ProfileViewSelectors.getProfile(getState())).toMatchSnapshot();
  });
  it('matches the last stored run of getProfileInterval', function() {
    const { getState } = setupStore();
    expect(ProfileViewSelectors.getProfileInterval(getState())).toEqual(1);
  });
  it('matches the last stored run of getThreads', function() {
    const { getState } = setupStore();
    expect(ProfileViewSelectors.getThreads(getState())).toMatchSnapshot();
  });
  it('matches the last stored run of getThreadNames', function() {
    const { getState } = setupStore();
    expect(ProfileViewSelectors.getThreadNames(getState())).toEqual([
      'Thread with samples',
      'Thread with markers',
    ]);
  });
  it('matches the last stored run of getRightClickedTrack', function() {
    const { getState } = setupStore();
    expect(ProfileViewSelectors.getRightClickedTrack(getState())).toEqual({
      trackIndex: 0,
      type: 'global',
    });
  });
  it('matches the last stored run of selectedThreadSelector.getThread', function() {
    const { getState, samplesThread } = setupStore();
    expect(selectedThreadSelectors.getThread(getState())).toEqual(
      samplesThread
    );
  });
  it('matches the last stored run of selectedThreadSelector.getViewOptions', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getViewOptions(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getTransformStack', function() {
    const { getState, mergeFunction } = setupStore();
    expect(selectedThreadSelectors.getTransformStack(getState())).toEqual([
      mergeFunction,
    ]);
  });
  it('matches the last stored run of selectedThreadSelector.getTransformLabels', function() {
    const { getState } = setupStore();
    expect(selectedThreadSelectors.getTransformLabels(getState())).toEqual([
      'Complete "Thread with samples"',
      'Merge: C',
    ]);
  });
  it('matches the last stored run of selectedThreadSelector.getRangeFilteredThread', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getRangeFilteredThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getRangeAndTransformFilteredThread', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getRangeAndTransformFilteredThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getJankInstances', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getJankInstances(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getProcessedMarkersTable', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getProcessedMarkersTable(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getTracingMarkers', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getTracingMarkers(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getMarkerChartTiming', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getMarkerChartTiming(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getNetworkChartTiming', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getNetworkChartTiming(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getCommittedRangeFilteredTracingMarkers', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getCommittedRangeFilteredTracingMarkers(
        getState()
      )
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getCommittedRangeFilteredTracingMarkersForHeader', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getCommittedRangeFilteredTracingMarkersForHeader(
        getState()
      )
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getFilteredThread', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getFilteredThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getPreviewFilteredThread', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getPreviewFilteredThread(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getCallNodeInfo', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getCallNodeInfo(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getCallNodeMaxDepth', function() {
    const { getState } = setupStore();
    expect(selectedThreadSelectors.getCallNodeMaxDepth(getState())).toEqual(4);
  });
  it('matches the last stored run of selectedThreadSelector.getSelectedCallNodePath', function() {
    const { getState, A, B } = setupStore();
    expect(selectedThreadSelectors.getSelectedCallNodePath(getState())).toEqual(
      [A, B]
    );
  });
  it('matches the last stored run of selectedThreadSelector.getSelectedCallNodeIndex', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getSelectedCallNodeIndex(getState())
    ).toEqual(1);
  });
  it('matches the last stored run of selectedThreadSelector.getExpandedCallNodePaths', function() {
    const { getState, A, B } = setupStore();
    assertSetContainsOnly(
      selectedThreadSelectors.getExpandedCallNodePaths(getState()),
      [[A], [A, B]]
    );
  });
  it('matches the last stored run of selectedThreadSelector.getExpandedCallNodeIndexes', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getExpandedCallNodeIndexes(getState())
    ).toEqual([0, 1]);
  });
  it('matches the last stored run of selectedThreadSelector.getCallTree', function() {
    const { getState } = setupStore();
    expect(selectedThreadSelectors.getCallTree(getState())).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getFlameGraphTiming', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getFlameGraphTiming(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getFriendlyThreadName', function() {
    const { getState } = setupStore();
    expect(selectedThreadSelectors.getFriendlyThreadName(getState())).toEqual(
      'Thread with samples'
    );
  });
  it('matches the last stored run of selectedThreadSelector.getThreadProcessDetails', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getThreadProcessDetails(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.getSearchFilteredTracingMarkers', function() {
    const { getState } = setupStore();
    expect(
      selectedThreadSelectors.getSearchFilteredTracingMarkers(getState())
    ).toMatchSnapshot();
  });
  it('matches the last stored run of selectedThreadSelector.unfilteredSamplesRange', function() {
    const { getState } = setupStore();
    expect(selectedThreadSelectors.unfilteredSamplesRange(getState())).toEqual({
      end: 9,
      start: 0,
    });
  });

  it('matches the last stored run of selectedNodeSelectors.getName', () => {
    const { getState } = setupStore();
    expect(selectedNodeSelectors.getName(getState())).toEqual('B');
  });

  it('matches the last stored run of selectedNodeSelectors.getIsJS', () => {
    const { getState } = setupStore();
    expect(selectedNodeSelectors.getIsJS(getState())).toEqual(false);
  });

  it('matches the last stored run of selectedNodeSelectors.getLib', () => {
    const { getState } = setupStore();
    expect(selectedNodeSelectors.getLib(getState())).toEqual('');
  });

  it('matches the last stored run of selectedNodeSelectors.getTimingsForSidebar', () => {
    const { getState } = setupStore();
    expect(
      selectedNodeSelectors.getTimingsForSidebar(getState())
    ).toMatchSnapshot();
  });
});

// Verify that getFriendlyThreadName gives the expected names for threads with or without processName.
describe('getFriendlyThreadName', function() {
  // Setup a profile with threads based on the given overrides.
  function setup(threadOverrides: Array<*>) {
    const profile = getEmptyProfile();
    for (const threadOverride of threadOverrides) {
      profile.threads.push(getEmptyThread(threadOverride));
    }

    const { dispatch, getState } = storeWithProfile(profile);

    const getFriendlyThreadNames = () =>
      profile.threads.map((_, threadIndex) =>
        ProfileViewSelectors.selectorsForThread(
          threadIndex
        ).getFriendlyThreadName(getState())
      );

    return { profile, dispatch, getState, getFriendlyThreadNames };
  }

  it('uses names based on GeckoMain processTypes when there are no processNames', function() {
    const { getFriendlyThreadNames } = setup([
      { name: 'GeckoMain', processType: 'default' },
      { name: 'GeckoMain', processType: 'tab' },
      { name: 'GeckoMain', processType: 'gpu' },
      { name: 'GeckoMain', processType: 'plugin' },
    ]);
    expect(getFriendlyThreadNames()).toEqual([
      'Parent Process',
      'Content Process',
      'GPU Process',
      'Plugin Process',
    ]);
  });

  it('uses names based on GeckoMain processTypes (and counts multiple tabs) when there are no processNames', function() {
    const { getFriendlyThreadNames } = setup([
      { name: 'GeckoMain', processType: 'default' },
      { name: 'GeckoMain', processType: 'tab' },
      { name: 'GeckoMain', processType: 'gpu' },
      { name: 'GeckoMain', processType: 'tab' },
    ]);
    expect(getFriendlyThreadNames()).toEqual([
      'Parent Process',
      'Content Process (1/2)',
      'GPU Process',
      'Content Process (2/2)',
    ]);
  });

  it('uses processName for GeckoMain threads that have one', function() {
    const { getFriendlyThreadNames } = setup([
      { name: 'GeckoMain', processName: 'A' },
      { name: 'GeckoMain', processName: 'B' },
      { name: 'GeckoMain', processName: 'C' },
      { name: 'GeckoMain', processType: 'gpu' },
      { name: 'GeckoMain', processName: 'B' },
      { name: 'GeckoMain', processName: 'B' },
      { name: 'GeckoMain', processName: 'C' },
    ]);
    expect(getFriendlyThreadNames()).toEqual([
      'A',
      'B (1/3)',
      'C (1/2)',
      'GPU Process',
      'B (2/3)',
      'B (3/3)',
      'C (2/2)',
    ]);
  });
});
