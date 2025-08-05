/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { storeWithProfile } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../selectors/profile';
import * as UrlStateSelectors from '../../selectors/url-state';

import {
  changeCallTreeSearchString,
  changeInvertCallstack,
  updatePreviewSelection,
  changeImplementationFilter,
  changeSelectedCallNode,
  changeShowJsTracerSummary,
  changeShowUserTimings,
} from '../../actions/profile-view';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
  getUserTiming,
} from '../fixtures/profiles/processed-profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  INSTANT,
  INTERVAL,
  INTERVAL_START,
  INTERVAL_END,
} from '../../app-logic/constants';

describe('selectors/getStackTimingByDepth', function () {
  /**
   * This table shows off how a stack chart gets filtered to JS only, where the number is
   * the stack index, and P is platform code, and J javascript.
   *
   *            Unfiltered             ->             JS Only
   *   0-10-20-30-40-50-60-70-80-90-91      0-10-20-30-40-50-60-70-80-90-91 <- Timing (ms)
   * 0--1-----2--3--4--5--6--7--8--9      0-----------------1--2--3--4--5   <- same width indexes
   *  ================================     ================================
   *  0P 0P 0P 0P 0P 0P 0P 0P 0P 0P  |     0P 0P 0P 0P 0P 0P 0P 0P 0P 0P  |
   *  1P 1P 1P 1P    1P 1P 1P 1P 1P  |                       1J 1J 1J 1J  |
   *     2P 2P 3P       4J 4J 4J 4J  |                          2J 2J     |
   *                       5J 5J     |                             3P     |
   *                          6P     |                             4J     |
   *                          7P     |
   *                          8J     |
   *
   * Note that stacks 10 and 20 in the unfiltered tree are the same, therefore
   * they'll form just one "same width" stack.
   * Similarly in the JS Only tree, stacks 0 to 50 are the same one and will form
   * one "same width" stack.
   * It's easier to think of the "same widths" indexes as the space between each
   * new stack.
   */

  it('computes unfiltered stack timing by depth', function () {
    const store = storeWithProfile();
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepth(
      store.getState()
    );
    expect(stackTimingByDepth).toEqual([
      {
        start: [0],
        end: [91],
        sameWidthsStart: [0],
        sameWidthsEnd: [9],
        callNode: [0],
        length: 1,
      },
      {
        start: [0, 50],
        end: [40, 91],
        sameWidthsStart: [0, 4],
        sameWidthsEnd: [3, 9],
        callNode: [1, 1],
        length: 2,
      },
      {
        start: [10, 30, 60],
        end: [30, 40, 91],
        sameWidthsStart: [1, 2, 5],
        sameWidthsEnd: [2, 3, 9],
        callNode: [2, 3, 4],
        length: 3,
      },
      {
        start: [70],
        end: [90],
        sameWidthsStart: [6],
        sameWidthsEnd: [8],
        callNode: [5],
        length: 1,
      },
      {
        start: [80],
        end: [90],
        sameWidthsStart: [7],
        sameWidthsEnd: [8],
        callNode: [6],
        length: 1,
      },
      {
        start: [80],
        end: [90],
        sameWidthsStart: [7],
        sameWidthsEnd: [8],
        callNode: [7],
        length: 1,
      },
      {
        start: [80],
        end: [90],
        sameWidthsStart: [7],
        sameWidthsEnd: [8],
        callNode: [8],
        length: 1,
      },
    ]);

    const timingMap = selectedThreadSelectors.getSameWidthsIndexToTimestampMap(
      store.getState()
    );
    expect(timingMap).toEqual([0, 10, 30, 40, 50, 60, 70, 80, 90, 91]);
  });

  it('uses search strings', function () {
    const store = storeWithProfile();
    store.dispatch(changeCallTreeSearchString('javascript'));
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepth(
      store.getState()
    );
    expect(stackTimingByDepth).toEqual([
      {
        start: [60],
        end: [91],
        sameWidthsStart: [0],
        sameWidthsEnd: [4],
        callNode: [0],
        length: 1,
      },
      {
        start: [60],
        end: [91],
        sameWidthsStart: [0],
        sameWidthsEnd: [4],
        callNode: [1],
        length: 1,
      },
      {
        start: [60],
        end: [91],
        sameWidthsStart: [0],
        sameWidthsEnd: [4],
        callNode: [4],
        length: 1,
      },
      {
        start: [70],
        end: [90],
        sameWidthsStart: [1],
        sameWidthsEnd: [3],
        callNode: [5],
        length: 1,
      },
      {
        start: [80],
        end: [90],
        sameWidthsStart: [2],
        sameWidthsEnd: [3],
        callNode: [6],
        length: 1,
      },
      {
        start: [80],
        end: [90],
        sameWidthsStart: [2],
        sameWidthsEnd: [3],
        callNode: [7],
        length: 1,
      },
      {
        start: [80],
        end: [90],
        sameWidthsStart: [2],
        sameWidthsEnd: [3],
        callNode: [8],
        length: 1,
      },
    ]);
  });
});

describe('selectors/getFlameGraphTiming', function () {
  /**
   * Map the flameGraphTiming data structure into a human readable format where
   * each line takes the form:
   *
   * "FunctionName1 (StartTime:EndTime) | FunctionName2 (StartTime:EndTime)"
   */
  function getHumanReadableFlameGraphRanges(store, funcNames) {
    const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(
      store.getState()
    );
    const callNodeTable = callNodeInfo.getCallNodeTable();
    const flameGraphTiming = selectedThreadSelectors.getFlameGraphTiming(
      store.getState()
    );

    return flameGraphTiming.map(({ callNode, end, length, start }) => {
      const lines = [];
      for (let i = 0; i < length; i++) {
        const callNodeIndex = callNode[i];
        const funcIndex = callNodeTable.func[callNodeIndex];
        const funcName = funcNames[funcIndex];
        lines.push(
          `${funcName} (${parseFloat(start[i].toFixed(2))}:${parseFloat(
            end[i].toFixed(2)
          )})`
        );
      }
      return lines.join(' | ');
    });
  }

  /**
   * Map the flameGraphTiming data structure into a human readable format where
   * each line takes the form:
   *
   * "FunctionName1 (SelfTimeRelative) | ..."
   */
  function getHumanReadableFlameGraphTimings(store, funcNames) {
    const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(
      store.getState()
    );
    const callNodeTable = callNodeInfo.getCallNodeTable();
    const flameGraphTiming = selectedThreadSelectors.getFlameGraphTiming(
      store.getState()
    );

    return flameGraphTiming.map(({ selfRelative, callNode, length }) => {
      const lines = [];
      for (let i = 0; i < length; i++) {
        const callNodeIndex = callNode[i];
        const funcIndex = callNodeTable.func[callNodeIndex];
        const funcName = funcNames[funcIndex];
        lines.push(`${funcName} (${selfRelative[i]})`);
      }
      return lines.join(' | ');
    });
  }

  it('computes a basic example', function () {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
    `);

    const store = storeWithProfile(profile);
    expect(getHumanReadableFlameGraphRanges(store, funcNames)).toEqual([
      'A (0:1)',
      'B (0:1)',
      'C (0:0.67) | H (0.67:1)',
      'D (0:0.33) | F (0.33:0.67) | I (0.67:1)',
      'E (0:0.33) | G (0.33:0.67)',
    ]);
  });

  it('can handle null samples', function () {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A  A  X  A
      B  B     B
      C  C     H
      D  F     I
      E  G
    `);

    // Remove the X sample by setting it's stack to null.
    profile.threads[0].samples.stack[2] = null;

    const store = storeWithProfile(profile);
    expect(getHumanReadableFlameGraphRanges(store, funcNames)).toEqual([
      'A (0:1)',
      'B (0:1)',
      'C (0:0.67) | H (0.67:1)',
      'D (0:0.33) | F (0.33:0.67) | I (0.67:1)',
      'E (0:0.33) | G (0.33:0.67)',
    ]);
  });

  it('sorts stacks in alphabetical order', function () {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      D  D  A  D
      E  F  B  F
            C  G
    `);

    const store = storeWithProfile(profile);
    expect(getHumanReadableFlameGraphRanges(store, funcNames)).toEqual([
      'A (0:0.25) | D (0.25:1)',
      'B (0:0.25) | E (0.25:0.5) | F (0.5:1)',
      'C (0:0.25) | G (0.5:0.75)',
    ]);
  });

  it('contains totalTime, selfTime and selfRelative', function () {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A  A  A  A
      B
      C
    `);

    const store = storeWithProfile(profile);
    expect(getHumanReadableFlameGraphTimings(store, funcNames)).toEqual([
      'A (0.75)',
      'B (0)',
      'C (0.25)',
    ]);
  });
});

describe('selectors/getCallNodeMaxDepthPlusOneForFlameGraph', function () {
  it('calculates the max call node depth', function () {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C
      D
    `);

    const store = storeWithProfile(profile);
    const allSamplesMaxDepth =
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(
        store.getState()
      );
    expect(allSamplesMaxDepth).toEqual(4);
  });

  it('returns zero if there are no samples', function () {
    const { profile } = getProfileFromTextSamples(` `);
    const store = storeWithProfile(profile);
    const allSamplesMaxDepth =
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(
        store.getState()
      );
    expect(allSamplesMaxDepth).toEqual(0);
  });
});

describe('selectors/getHasPreviewFilteredCtssSamples', function () {
  it('returns true if there are samples', function () {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C
      D
    `);

    const store = storeWithProfile(profile);
    const hasSamples = selectedThreadSelectors.getHasPreviewFilteredCtssSamples(
      store.getState()
    );
    expect(hasSamples).toEqual(true);
  });

  it('returns false if the preview selection filters out all samples', function () {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C
      D
    `);

    const store = storeWithProfile(profile);

    store.dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 1.1,
        selectionEnd: 1.7,
      })
    );

    const hasSamples = selectedThreadSelectors.getHasPreviewFilteredCtssSamples(
      store.getState()
    );
    expect(hasSamples).toEqual(false);
  });
});

describe('actions/changeImplementationFilter', function () {
  const store = storeWithProfile();

  it('is initially set to filter to all', function () {
    const filter = UrlStateSelectors.getImplementationFilter(store.getState());
    expect(filter).toEqual('combined');
  });

  it('can be changed to cpp', function () {
    store.dispatch(changeImplementationFilter('cpp'));
    const filter = UrlStateSelectors.getImplementationFilter(store.getState());
    expect(filter).toEqual('cpp');
  });
});

describe('actions/updatePreviewSelection', function () {
  it('can update the selection with new values', function () {
    const store = storeWithProfile();

    const initialSelection = ProfileViewSelectors.getPreviewSelection(
      store.getState()
    );
    expect(initialSelection).toEqual({
      hasSelection: false,
      isModifying: false,
    });

    store.dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 100,
        selectionEnd: 200,
      })
    );

    const secondSelection = ProfileViewSelectors.getPreviewSelection(
      store.getState()
    );
    expect(secondSelection).toEqual({
      hasSelection: true,
      isModifying: false,
      selectionStart: 100,
      selectionEnd: 200,
    });
  });
});

describe('actions/changeInvertCallstack', function () {
  // This profile has a heavily weighted path of A, B, I, J that should be selected.
  const {
    profile,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
      A  A  A  A  A  A
      B  E  B  B  B  B
      C  F  I  I  I  I
      D  G  J  J  J  J
         H           K
    `);
  const toFuncIndex = (funcName) => funcNames.indexOf(funcName);
  const threadIndex = 0;

  // The assumptions in this tests is that we are going between these two call node
  // paths, one uninverted, the other inverted:
  const callNodePath = ['A', 'B'].map(toFuncIndex);
  const invertedCallNodePath = ['J', 'I', 'B'].map(toFuncIndex);

  // Make tests more readable by grabbing the relevant paths, and transforming
  // them to their function names, rather than indexes.
  const getPaths = (state) => ({
    selectedCallNodePath: selectedThreadSelectors
      .getSelectedCallNodePath(state)
      .map((index) => funcNames[index]),
    expandedCallNodePaths: Array.from(
      selectedThreadSelectors.getExpandedCallNodePaths(state)
    ).map((path) => path.map((index) => funcNames[index])),
  });

  describe('on a normal call tree', function () {
    // Each test uses a normal call tree, with a selected call node.
    const storeWithNormalCallTree = () => {
      const store = storeWithProfile(profile);
      store.dispatch(changeSelectedCallNode(threadIndex, callNodePath));
      return store;
    };

    it('starts with a selectedCallNodePath', function () {
      const { getState } = storeWithNormalCallTree();
      const { selectedCallNodePath, expandedCallNodePaths } =
        getPaths(getState());
      expect(selectedCallNodePath).toEqual(['A', 'B']);
      expect(expandedCallNodePaths).toEqual([['A']]);
    });

    it('inverts the selectedCallNodePath', function () {
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(changeSelectedCallNode(threadIndex, callNodePath));
      dispatch(changeInvertCallstack(true));
      const { selectedCallNodePath, expandedCallNodePaths } =
        getPaths(getState());

      // Do not select the first alphabetical path:
      expect(selectedCallNodePath).not.toEqual(['D', 'C', 'B']);

      // Pick the heaviest path, and stops short of K:
      expect(selectedCallNodePath).toEqual(['J', 'I', 'B']);
      expect(expandedCallNodePaths).toEqual([['J'], ['J', 'I']]);
    });
  });

  describe('on an inverted call tree', function () {
    // Each test uses a store with an inverted profile, and a selected call node.
    const storeWithInvertedCallTree = () => {
      const store = storeWithProfile(profile);
      store.dispatch(changeInvertCallstack(true));
      store.dispatch(changeSelectedCallNode(threadIndex, invertedCallNodePath));
      return store;
    };

    it('starts with a selectedCallNodePath', function () {
      const { getState } = storeWithInvertedCallTree();
      const { selectedCallNodePath, expandedCallNodePaths } =
        getPaths(getState());
      expect(selectedCallNodePath).toEqual(['J', 'I', 'B']);
      expect(expandedCallNodePaths).toEqual([['J'], ['J', 'I']]);
    });

    it('uninverts the selectedCallNodePath', function () {
      const { dispatch, getState } = storeWithInvertedCallTree();
      dispatch(changeInvertCallstack(false));
      const { selectedCallNodePath, expandedCallNodePaths } =
        getPaths(getState());

      expect(selectedCallNodePath).toEqual(['A', 'B']);
      expect(expandedCallNodePaths).toEqual([['A']]);
    });
  });
});

describe('actions/changeShowJsTracerSummary', function () {
  it('can change the view to show a summary', function () {
    const { profile } = getProfileFromTextSamples(`A`);
    const { dispatch, getState } = storeWithProfile(profile);
    expect(UrlStateSelectors.getShowJsTracerSummary(getState())).toBe(false);
    dispatch(changeShowJsTracerSummary(true));
    expect(UrlStateSelectors.getShowJsTracerSummary(getState())).toBe(true);
  });
});

describe('actions/changeShowUserTimings', function () {
  it('can change the view to show a summary', function () {
    const { profile } = getProfileFromTextSamples(`A`);
    const { dispatch, getState } = storeWithProfile(profile);
    expect(UrlStateSelectors.getShowUserTimings(getState())).toBe(false);
    dispatch(changeShowUserTimings(true));
    expect(UrlStateSelectors.getShowUserTimings(getState())).toBe(true);
  });
});

describe('selectors/getCombinedTimingRows', function () {
  function setupUserTimings() {
    // Approximately generate this type of graph with the following user timings.
    //
    // [renderFunction---------------------]
    //   [componentA---------------------]
    //     [componentB----]  [componentD]
    //      [componentC-]
    return getProfileWithMarkers([
      getUserTiming('renderFunction', 0, 10),
      getUserTiming('componentA', 1, 8),
      getUserTiming('componentB', 2, 4),
      getUserTiming('componentC', 3, 1),
      getUserTiming('componentD', 7, 1),
    ]);
  }

  function setupSamples() {
    const { profile } = getProfileFromTextSamples(
      `
        A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
        B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
        C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
        D[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
        E[cat:Graphics]  G[cat:Graphics]
      `
    );

    return profile;
  }

  it('combined timings includes user and call timings', () => {
    const markerProfile = setupUserTimings();
    const stackProfile = setupSamples();
    stackProfile.threads[0].markers = markerProfile.threads[0].markers;
    const store = storeWithProfile(stackProfile);

    expect(
      selectedThreadSelectors.getCombinedTimingRows(store.getState())
    ).toEqual([
      {
        start: [0],
        end: [10],
        index: [0],
        name: 'A',
        bucket: 'None',
        instantOnly: false,
        length: 1,
      },
      {
        start: [1],
        end: [9],
        index: [1],
        name: 'A',
        bucket: 'None',
        instantOnly: false,
        length: 1,
      },
      {
        start: [2],
        end: [6],
        index: [2],
        name: 'A',
        bucket: 'None',
        instantOnly: false,
        length: 1,
      },
      {
        bucket: 'None',
        end: [4],
        index: [3],
        length: 1,
        name: 'A',
        start: [3],
        instantOnly: false,
      },
      // Note that every sample has a different stack, therefore `sameWidthsStart`
      // and `sameWidthsEnd` have the same data as `start` and `end`.
      {
        start: [0],
        end: [3],
        sameWidthsStart: [0],
        sameWidthsEnd: [3],
        callNode: [0],
        length: 1,
      },
      {
        start: [0],
        end: [3],
        sameWidthsStart: [0],
        sameWidthsEnd: [3],
        callNode: [1],
        length: 1,
      },
      {
        start: [0, 2],
        end: [2, 3],
        sameWidthsStart: [0, 2],
        sameWidthsEnd: [2, 3],
        callNode: [2, 7],
        length: 2,
      },
      {
        start: [0, 1, 2],
        end: [1, 2, 3],
        sameWidthsStart: [0, 1, 2],
        sameWidthsEnd: [1, 2, 3],
        callNode: [3, 5, 8],
        length: 3,
      },
      {
        start: [0, 1],
        end: [1, 2],
        sameWidthsStart: [0, 1],
        sameWidthsEnd: [1, 2],
        callNode: [4, 6],
        length: 2,
      },
    ]);
  });
});

describe('selectors/getThreadRange', function () {
  it('should compute a thread range based on the number of samples', function () {
    const { profile } = getProfileFromTextSamples('A  B  C');
    const { getState } = storeWithProfile(profile);

    expect(selectedThreadSelectors.getThreadRange(getState())).toEqual({
      start: 0,
      end: 3,
    });
  });

  it('should compute a thread range based on markers when no samples are present', function () {
    const { getState } = storeWithProfile(
      getProfileWithMarkers([['Marker', 10, 20]])
    );

    expect(selectedThreadSelectors.getThreadRange(getState())).toEqual({
      start: 10,
      end: 21,
    });
  });

  it('should use proper marker start/end times depending on the phase', function () {
    // Gecko outputs "0" for the unused values.
    const profile = getProfileWithMarkers([
      ['Instant', 10, 0], // Only starTime should be taken into account.
      ['IntervalStart', 15, 0], // Only starTime should be taken into account.
      ['IntervalEnd', 0, 10], // Only endTime should be taken into account.
      ['Interval', 10, 20], // Both start and endTime should be taken into account.
    ]);

    // getProfileWithMarkers sets the phase depending on the timings, but we
    // want to add custom phases for each markers.
    profile.threads[0].markers.phase = [
      INSTANT,
      INTERVAL_START,
      INTERVAL_END,
      INTERVAL,
    ];

    const { getState } = storeWithProfile(profile);

    // Even though we have markers with 0 start and end time, it should only take
    // Interval marker start/end time into account while computing the range.
    expect(selectedThreadSelectors.getThreadRange(getState())).toEqual({
      start: 10,
      end: 21,
    });
  });

  it('should use the Interval marker start time even if it is zero', function () {
    // Gecko outputs "0" for the unused values.
    // Both start and endTime should be taken into account for Interval.
    const profile = getProfileWithMarkers([
      ['Interval', 10, 20],
      ['Interval', 0, 15],
    ]);

    // getProfileWithMarkers sets the phase depending on the timings, but we
    // want to add custom phases for each markers.
    profile.threads[0].markers.phase = [INTERVAL, INTERVAL];

    const { getState } = storeWithProfile(profile);

    // It take both Interval marker start/end times into account while computing the range.
    expect(selectedThreadSelectors.getThreadRange(getState())).toEqual({
      start: 0,
      end: 21,
    });
  });

  it('should use the Instant marker start time even if it is zero', function () {
    // Gecko outputs "0" for the unused values.
    // Both startTime should be taken into account for Instant.
    const profile = getProfileWithMarkers([
      ['Instant', 0, null],
      ['Interval', 10, 15],
    ]);

    // getProfileWithMarkers sets the phase depending on the timings, but we
    // want to add custom phases for each markers.
    profile.threads[0].markers.phase = [INSTANT, INTERVAL];

    const { getState } = storeWithProfile(profile);

    // It take both Interval marker start/end times into account while computing the range.
    expect(selectedThreadSelectors.getThreadRange(getState())).toEqual({
      start: 0,
      end: 16,
    });
  });

  it('ignores markers when there are samples', function () {
    const { profile } = getProfileFromTextSamples('A  B  C');
    {
      const markersProfile = getProfileWithMarkers([['Marker', 10, 20]]);
      // Replace the markers on the samples profile.
      profile.threads[0].markers = markersProfile.threads[0].markers;
    }

    const { getState } = storeWithProfile(profile);

    expect(selectedThreadSelectors.getThreadRange(getState())).toEqual({
      start: 0,
      end: 3,
    });
  });
});
