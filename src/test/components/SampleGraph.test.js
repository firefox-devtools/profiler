/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { fireEvent } from '@testing-library/react';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { ensureExists } from 'firefox-profiler/utils/flow';
import { TimelineTrackThread } from 'firefox-profiler/components/timeline/TrackThread';
import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  fireFullClick,
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
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

import type {
  Profile,
  IndexIntoSamplesTable,
  CssPixels,
} from 'firefox-profiler/types';

// Mocking the ActivityGraph because we don't want to see the content/draw log
// of it in these tests. It has its own tests.
jest.mock('firefox-profiler/components/shared/thread/ActivityGraph', () => ({
  ThreadActivityGraph: 'thread-activity-graph',
}));

// The following constants determine the size of the drawn graph.
const SAMPLE_COUNT = 8;
const PIXELS_PER_SAMPLE = 10;
const GRAPH_WIDTH = PIXELS_PER_SAMPLE * SAMPLE_COUNT;
const GRAPH_HEIGHT = 10;
function getSamplesPixelPosition(
  sampleIndex: IndexIntoSamplesTable
): CssPixels {
  // Compute the pixel position of the exact sample.
  return sampleIndex * PIXELS_PER_SAMPLE;
}

function getSamplesProfile() {
  return getProfileFromTextSamples(`
    A[cat:DOM]  A[cat:DOM]       A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]
    B           B                B             B             B             B             B             B
    C           C                H[cat:Other]  H[cat:Other]  H[cat:Other]  H[cat:Other]  H[cat:Other]  C
    D           F[cat:Graphics]  I             I             I             I             I             F[cat:Graphics]
    E           G                                                                                      G
  `).profile;
}

describe('SampleGraph', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  autoMockIntersectionObserver();
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  function setup(profile: Profile = getSamplesProfile()) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

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

    const sampleGraphCanvas = ensureExists(
      document.querySelector('.threadSampleGraphCanvas'),
      `Couldn't find the sample graph canvas, with selector .threadSampleGraphCanvas`
    );
    const thread = profile.threads[0];
    const { stringArray } = profile.shared;

    // Perform a click on the sample graph.
    function clickSampleGraph(index: IndexIntoSamplesTable) {
      fireFullClick(sampleGraphCanvas, {
        pageX: getSamplesPixelPosition(index),
        offsetX: getSamplesPixelPosition(index),
        pageY: GRAPH_HEIGHT / 2,
      });
    }

    // Hover over the sample graph.
    function hoverSampleGraph(index: IndexIntoSamplesTable) {
      fireEvent(
        sampleGraphCanvas,
        getMouseEvent('mousemove', {
          pageX: getSamplesPixelPosition(index),
          offsetX: getSamplesPixelPosition(index),
          pageY: GRAPH_HEIGHT / 2,
        })
      );
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
    function getContextDrawCalls() {
      flushRafCalls();
      return flushDrawLog();
    }

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      thread,
      store,
      sampleGraphCanvas,
      clickSampleGraph,
      hoverSampleGraph,
      getCallNodePath,
      getContextDrawCalls,
    };
  }

  it('matches the component snapshot', () => {
    const { sampleGraphCanvas } = setup();
    expect(sampleGraphCanvas).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    setup();
    expect(flushDrawLog()).toMatchSnapshot();
  });

  /**
   * The ThreadSampleGraph is not a connected component. It's easiest to test it
   * as once it's connected to the Redux store in the TrackThread.
   */
  describe('ThreadSampleGraph', function () {
    it('selects the full call node path when clicked', function () {
      const { clickSampleGraph, getCallNodePath } = setup();

      // The full call node at this sample is:
      //  A -> B -> C -> F -> G
      clickSampleGraph(1);
      expect(getCallNodePath()).toEqual(['A', 'B', 'C', 'F', 'G']);

      // The full call node at this sample is:
      //  A -> B -> H -> I
      clickSampleGraph(2);
      expect(getCallNodePath()).toEqual(['A', 'B', 'H', 'I']);
    });

    it('clicking outside of any sample removes any selection', function () {
      const { clickSampleGraph, getCallNodePath, sampleGraphCanvas } = setup();

      // Starting while nothing is selected.
      expect(getCallNodePath()).toEqual([]);

      // Selecting the sample with index 1.
      // The full call node at this sample is:
      //  A -> B -> C -> F -> G
      clickSampleGraph(1);
      expect(getCallNodePath()).toEqual(['A', 'B', 'C', 'F', 'G']);

      // Now we are selecting outside of the sample, which should remove the selection.
      fireFullClick(sampleGraphCanvas, {
        pageX: getSamplesPixelPosition(1) + PIXELS_PER_SAMPLE / 2,
        offsetX: getSamplesPixelPosition(1) + PIXELS_PER_SAMPLE / 2,
        pageY: GRAPH_HEIGHT / 2,
      });
      expect(getCallNodePath()).toEqual([]);
    });

    it('shows the correct tooltip when hovered', function () {
      const { hoverSampleGraph, getCallNodePath } = setup();

      // Hovering the sample with index 1.
      // The full call node at this sample is:
      //  A -> B -> C -> F -> G
      hoverSampleGraph(1);

      // We didn't click, so selection should not change in the selected node path.
      expect(getCallNodePath()).toEqual([]);

      // Make sure that we have a tooltip.
      expect(
        ensureExists(
          document.querySelector('.tooltip'),
          'A tooltip component must exist for this test.'
        )
      ).toMatchSnapshot();
    });

    it('does not show a tooltip when outside of a sample is hovered', function () {
      const { hoverSampleGraph, getCallNodePath, sampleGraphCanvas } = setup();

      // The full call node at this sample is:
      //  A -> B -> C -> F -> G

      hoverSampleGraph(1);
      // We didn't click, so selection should not change.
      expect(getCallNodePath()).toEqual([]);

      // Make sure that we have a tooltip.
      expect(document.querySelector('.tooltip')).toBeTruthy();

      // Now we are hovering outside of the samples.
      fireEvent(
        sampleGraphCanvas,
        getMouseEvent('mousemove', {
          pageX: getSamplesPixelPosition(1) + PIXELS_PER_SAMPLE / 2,
          offsetX: getSamplesPixelPosition(1) + PIXELS_PER_SAMPLE / 2,
          pageY: GRAPH_HEIGHT / 2,
        })
      );

      // There should be no tooltip this time
      expect(document.querySelector('.tooltip')).toBeFalsy();
    });
  });
});

describe('SampleGraph with intersection observer', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  // Do not automatically trigger the intersection observers.
  autoMockIntersectionObserver(false);

  function setup(profile: Profile = getSamplesProfile()) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

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
    function getContextDrawCalls() {
      flushRafCalls();
      return flushDrawLog();
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
    // that sample graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );
  });

  it('will not draw after the intersection observer if it is not intersecting', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that sample graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'beginPath')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it still
    // doesn't draw it.
    triggerIntersectionObservers({ isIntersecting: false });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );
  });

  it('will draw after the intersection observer if it is intersecting', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that sample graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it draws it.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      true
    );
  });

  it('will redraw after it becomes visible again', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that activity graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it draws it.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      true
    );

    // Now it goes out of view again. Make sure that we don't redraw.
    triggerIntersectionObservers({ isIntersecting: false });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );

    // Send out the resize with a width change.
    // By changing the "fake" result of getBoundingClientRect, we ensure that
    // the pure components rerender because their `width` props change.
    setMockedElementSize({ width: GRAPH_WIDTH * 2, height: GRAPH_HEIGHT });
    triggerResizeObservers();
    drawCalls = getContextDrawCalls();
    // It should still be not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer again and make sure that it redraws.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'fillRect')).toBe(
      true
    );
  });
});
