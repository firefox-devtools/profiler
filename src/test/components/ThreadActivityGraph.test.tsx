/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Profile,
  IndexIntoSamplesTable,
  CssPixels,
} from 'firefox-profiler/types';
import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getTimelineType, getSelectedTab } from '../../selectors/url-state';
import { getLastVisibleThreadTabSlug } from '../../selectors/app';
import { ensureExists } from '../../utils/flow';
import { TimelineTrackThread } from '../../components/timeline/TrackThread';
import { commitRange } from '../../actions/profile-view';
import { changeSelectedTab } from '../../actions/app';

import type {
  DrawOperation,
  LineToOperation,
} from '../fixtures/mocks/canvas-context';
import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { fireFullClick } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  autoMockElementSize,
  setMockedElementSize,
} from '../fixtures/mocks/element-size';
import {
  autoMockIntersectionObserver,
  triggerIntersectionObservers,
} from '../fixtures/mocks/intersection-observer';
import { triggerResizeObservers } from '../fixtures/mocks/resize-observer';

// The following constants determine the size of the drawn graph.
const SAMPLE_COUNT = 8;
const PIXELS_PER_SAMPLE = 10;
const GRAPH_WIDTH = PIXELS_PER_SAMPLE * SAMPLE_COUNT;
const GRAPH_HEIGHT = 10;
function getSamplesPixelPosition(
  sampleIndex: IndexIntoSamplesTable
): CssPixels {
  // Compute the pixel position of the center of a given sample.
  return sampleIndex * PIXELS_PER_SAMPLE + PIXELS_PER_SAMPLE * 0.5;
}

function getSamplesProfile() {
  return getProfileFromTextSamples(`
    A[cat:DOM]   A[cat:DOM]       A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]
    B            B                B              B              B              B              B              B
    C            C                H[cat:Layout]  H[cat:Layout]  H[cat:Layout]  H[cat:Layout]  H[cat:Layout]  C
    D            F[cat:Graphics]  I              I              I              I              I              F[cat:Graphics]
    E[cat:Idle]  G                                                                                           G
  `).profile;
}

describe('ThreadActivityGraph', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  autoMockIntersectionObserver();

  function setup(profile: Profile = getSamplesProfile()) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const threadIndex = 0;
    const flushRafCalls = mockRaf();

    /**
     * The ThreadActivityGraph is not a connected component. It's easiest to
     * test it as once it's connected to the Redux store in TimelineTrackThread.
     */
    const renderResult = render(
      <Provider store={store}>
        <TimelineTrackThread
          threadsKey={0}
          trackType="expanded"
          trackName="Test Track"
        />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const activityGraphCanvas = ensureExists(
      container.querySelector('.threadActivityGraphCanvas'),
      `Couldn't find the activity graph canvas, with selector .threadActivityGraphCanvas`
    ) as HTMLElement;
    const thread = profile.threads[0];
    const { stringArray } = profile.shared;

    // Perform a click on the activity graph.
    function clickActivityGraph(
      index: IndexIntoSamplesTable,
      graphHeightPercentage: number
    ) {
      fireFullClick(activityGraphCanvas, {
        offsetX: getSamplesPixelPosition(index),
        offsetY: GRAPH_HEIGHT * graphHeightPercentage,
      });
    }

    // This function gets the selected call node path as a list of function names.
    function getCallNodePath() {
      return selectedThreadSelectors
        .getSelectedCallNodePath(getState())
        .map((funcIndex) => stringArray[thread.funcTable.name[funcIndex]]);
    }

    /**
     * Coordinate the flushing of the requestAnimationFrame and the draw calls.
     */
    function getContextDrawCalls(): string[] {
      flushRafCalls();
      return (window as any).__flushDrawLog();
    }

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      thread,
      store,
      threadIndex,
      activityGraphCanvas,
      clickActivityGraph,
      getCallNodePath,
      getContextDrawCalls,
    };
  }

  it('matches the component snapshot', () => {
    const { container } = setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    setup();
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('redraws on resize', () => {
    const { getContextDrawCalls } = setup();

    // Flush out any existing draw calls.
    getContextDrawCalls();
    // Ensure we start out with 0.
    expect(getContextDrawCalls().length).toEqual(0);

    // Send out the resize with a width change.
    // By changing the "fake" result of getBoundingClientRect, we ensure that
    // the pure components rerender because their `width` props change.
    setMockedElementSize({ width: GRAPH_WIDTH * 2, height: GRAPH_HEIGHT });
    triggerResizeObservers();
    const drawCalls = getContextDrawCalls();
    // We want to ensure that we redraw the activity graph and not something
    // else like the sample graph.
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      true
    );
  });

  it('matches the 2d canvas draw snapshot with CPU values', () => {
    const profile = getSamplesProfile();
    profile.meta.interval = 1;
    profile.meta.sampleUnits = {
      time: 'ms',
      eventDelay: 'ms',
      threadCPUDelta: 'variable CPU cycles',
    };
    profile.threads[0].samples.threadCPUDelta = [
      null,
      400,
      1000,
      500,
      100,
      200,
      800,
      300,
    ];

    const { getState } = setup(profile);
    // If there are CPU values, it should be automatically defaulted to this view.
    expect(getTimelineType(getState())).toBe('cpu-category');
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot with CPU values with missing samples', () => {
    const profile = getSamplesProfile();
    profile.meta.interval = 1;
    profile.meta.sampleUnits = {
      time: 'ms',
      eventDelay: 'ms',
      threadCPUDelta: 'variable CPU cycles',
    };
    profile.threads[0].samples.threadCPUDelta = [
      null,
      400,
      1000,
      500,
      100,
      200,
      800,
      300,
    ];
    // Update the time array to create a gap between 3rd and 4th samples.
    profile.threads[0].samples.time = [0, 1, 2, 7, 8, 9, 10, 11];

    const { getState } = setup(profile);
    // If there are CPU values, it should be automatically defaulted to this view.
    expect(getTimelineType(getState())).toBe('cpu-category');
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot with only one CPU usage value', () => {
    const { profile } = getProfileFromTextSamples('A  B');
    profile.meta.interval = 1;
    profile.meta.sampleUnits = {
      time: 'ms',
      eventDelay: 'ms',
      threadCPUDelta: 'variable CPU cycles',
    };

    // We need to have at least two samples to test it because the first
    // threadCPUDelta is always null.
    profile.threads[0].samples.threadCPUDelta = [null, 100];
    const { getState, dispatch } = setup(profile);

    // Commit a range that contains only the second sample.
    act(() => {
      dispatch(commitRange(0.1, 2.0));
    });

    // If there are CPU values, it should be automatically defaulted to this view.
    expect(getTimelineType(getState())).toBe('cpu-category');
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('selects the full call node path when clicked', function () {
    const { clickActivityGraph, getCallNodePath } = setup();

    // The full call node at this sample is:
    //  A -> B -> C -> F -> G
    clickActivityGraph(1, 0.2);
    expect(getCallNodePath()).toEqual(['A', 'B', 'C', 'F', 'G']);

    // The full call node at this sample is:
    //  A -> B -> H -> I
    clickActivityGraph(1, 0.8);
    expect(getCallNodePath()).toEqual(['A', 'B', 'H', 'I']);

    // There's no sample at this location.
    clickActivityGraph(0, 1);
    expect(getCallNodePath()).toEqual([]);
  });

  it('when clicking a stack, this selects the call tree panel', function () {
    const { dispatch, getState, clickActivityGraph } = setup();

    expect(getSelectedTab(getState())).toBe('calltree');
    dispatch(changeSelectedTab('marker-chart'));

    // The full call node at this sample is:
    //  A -> B -> C -> F -> G
    clickActivityGraph(1, 0.2);
    expect(getSelectedTab(getState())).toBe('calltree');
    expect(getLastVisibleThreadTabSlug(getState())).toBe('calltree');
  });

  it(`when clicking outside of the graph, this doesn't select the call tree panel`, function () {
    const { dispatch, getState, clickActivityGraph } = setup();

    expect(getSelectedTab(getState())).toBe('calltree');
    dispatch(changeSelectedTab('marker-chart'));

    // There's no sample at this location.
    clickActivityGraph(0, 1);
    expect(getSelectedTab(getState())).toBe('marker-chart');
    expect(getLastVisibleThreadTabSlug(getState())).toBe('marker-chart');
  });

  it("when clicking a sample in a track with only '(root)' samples, this doesn't select the hidden call tree panel", function () {
    const { profile } = getProfileFromTextSamples('(root)');
    const { getState, clickActivityGraph } = setup(profile);

    expect(getSelectedTab(getState())).toBe('marker-chart');

    clickActivityGraph(1, 0.2);
    expect(getSelectedTab(getState())).toBe('marker-chart');
  });

  it('will redraw even when there are no samples in range', function () {
    const { dispatch } = setup();
    flushDrawLog();

    // Commit a thin range which contains no samples
    act(() => {
      dispatch(commitRange(0.5, 0.6));
    });
    const drawCalls = flushDrawLog();
    // We use the presence of 'globalCompositeOperation' to know
    // whether the canvas was redrawn or not.
    expect(drawCalls.map(([fn]) => fn)).toContain(
      'set globalCompositeOperation'
    );
  });

  it('will compute the percentage properly even though it is in a committed range with missing samples', function () {
    const MS_TO_NS_MULTIPLIER = 1000000;
    const profile = getSamplesProfile();
    profile.meta.interval = 1;
    profile.meta.sampleUnits = {
      time: 'ms',
      eventDelay: 'ms',
      threadCPUDelta: 'ns',
    };

    // We are creating a profile which has 8ms missing sample area in it.
    // It's starting between the sample 2 and 3.
    profile.threads[0].samples.threadCPUDelta = [
      null,
      0.4 * MS_TO_NS_MULTIPLIER,
      0.1 * MS_TO_NS_MULTIPLIER,
      4 * MS_TO_NS_MULTIPLIER, // It's 50% CPU because the actual interval is 8ms.
      1 * MS_TO_NS_MULTIPLIER,
      0.2 * MS_TO_NS_MULTIPLIER,
      0.8 * MS_TO_NS_MULTIPLIER,
      0.3 * MS_TO_NS_MULTIPLIER,
    ];
    profile.threads[0].samples.time = [
      0,
      1,
      2,
      10, // For this sample, the interval is 8ms since there are missing samples.
      11,
      12,
      13,
      14,
    ];

    const { dispatch } = setup(profile);
    flushDrawLog();

    // Commit a range that starts right after the missing sample.
    act(() => {
      dispatch(commitRange(9, 14));
    });

    const drawCalls = flushDrawLog();
    // Activity graph uses lineTo to draw the lines for the samples.
    const lineToOperations = drawCalls.filter<LineToOperation>(
      // @ts-expect-error - TS2345: Signature '([operation]: DrawOperation): boolean' must be a type predicate.ts(2345)
      ([operation]) => operation === 'lineTo'
    );

    expect(lineToOperations.length).toBeGreaterThan(0);
    // Make sure that all the lineTo operations are inside the activity graph
    // rectangle. There should not be any sample that starts or ends outside
    // of the graph.
    expect(
      lineToOperations.filter(
        ([, x, y]) =>
          x < 0 ||
          x > GRAPH_WIDTH ||
          y < 0 ||
          y > GRAPH_HEIGHT ||
          isNaN(x) ||
          isNaN(y)
      )
    ).toEqual([]);
  });

  it('selects the correct call node path when clicked on an area where multiple stacks overlap with various categories', function () {
    const { profile } = getProfileFromTextSamples(`
    A[cat:DOM]   A[cat:DOM]       A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]
    B            B                B              B              B              B              B              B
    C            C                H              H              H              H              H              C
    D            F                I              I              K[cat:Layout]  L              J              F[cat:Graphics]
    E[cat:Idle]  G                                                                                           G
  `);
    const { clickActivityGraph, getCallNodePath } = setup(profile);

    // Previously every sample was taking 10 pixel and the graph width was
    // sample count * 10. Reducing the size of the graph to make sure that we
    // have multiple overlapping samples.
    setMockedElementSize({ width: GRAPH_WIDTH / 4, height: GRAPH_HEIGHT });
    triggerResizeObservers();

    // The full call node at this sample is:
    //  A -> B -> H -> J
    clickActivityGraph(2 / 4, 0.1);
    expect(getCallNodePath()).toEqual(['A', 'B', 'H', 'J']);

    // The full call node at this sample is:
    //  A -> B -> H -> L
    clickActivityGraph(2 / 4, 0.2);
    expect(getCallNodePath()).toEqual(['A', 'B', 'H', 'L']);

    // The full call node at this sample is:
    //  A -> B -> H -> I
    clickActivityGraph(2 / 4, 0.5);
    expect(getCallNodePath()).toEqual(['A', 'B', 'H', 'I']);

    // The full call node at this sample is:
    //  A -> B -> H -> K
    clickActivityGraph(2 / 4, 0.8);
    expect(getCallNodePath()).toEqual(['A', 'B', 'H', 'K']);

    // // There's no sample at this location.
    clickActivityGraph(0, 1);
    expect(getCallNodePath()).toEqual([]);
  });
});

describe('ThreadActivityGraph with intersection observer', function () {
  // Do not automatically trigger the intersection observers.
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  autoMockIntersectionObserver(false);

  function setup(profile: Profile = getSamplesProfile()) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

    /**
     * The ThreadActivityGraph is not a connected component. It's easiest to
     * test it as once it's connected to the Redux store in TimelineTrackThread.
     */
    const renderResult = render(
      <Provider store={store}>
        <TimelineTrackThread
          threadsKey={0}
          trackType="expanded"
          trackName="Test Track"
        />
      </Provider>
    );

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    /**
     * Coordinate the flushing of the requestAnimationFrame and the draw calls.
     */
    function getContextDrawCalls(): DrawOperation[] {
      flushRafCalls();
      return (window as any).__flushDrawLog();
    }

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      store,
      getContextDrawCalls,
    };
  }

  it('will not draw before the intersection observer', () => {
    const { getContextDrawCalls } = setup();
    const drawCalls = getContextDrawCalls();
    // There are other canvases inside the TrackThread too. We want to make sure
    // that activity graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );
  });

  it('will not draw after the intersection observer if it is not intersecting', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that activity graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it still
    // doesn't draw it.
    triggerIntersectionObservers({ isIntersecting: false });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );
  });

  it('will draw after the intersection observer if it is intersecting', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that activity graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it draws it.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      true
    );
  });

  it('will redraw after it becomes visible again', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that activity graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it draws it.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      true
    );

    // Now it goes out of view again. Make sure that we don't redraw.
    triggerIntersectionObservers({ isIntersecting: false });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );

    // Send out the resize with a width change.
    // By changing the "fake" result of getBoundingClientRect, we ensure that
    // the pure components rerender because their `width` props change.
    setMockedElementSize({ width: GRAPH_WIDTH * 2, height: GRAPH_HEIGHT });
    triggerResizeObservers();
    drawCalls = getContextDrawCalls();
    // It should still be not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );

    // Now let's trigger the intersection observer again and make sure that it redraws.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      true
    );
  });
});
