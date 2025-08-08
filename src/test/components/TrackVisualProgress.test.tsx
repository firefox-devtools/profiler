/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { IndexIntoSamplesTable, CssPixels } from 'firefox-profiler/types';
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { TrackVisualProgress } from '../../components/timeline/TrackVisualProgress';
import { ensureExists } from '../../utils/flow';
import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  addRootOverlayElement,
  removeRootOverlayElement,
  getMouseEvent,
} from '../fixtures/utils';

import { getVisualProgressTrackProfile } from '../fixtures/profiles/processed-profile';

// The following constants determine the size of the drawn graph.
const SAMPLE_COUNT = 7;
const PIXELS_PER_SAMPLE = 10;
const GRAPH_WIDTH = PIXELS_PER_SAMPLE * SAMPLE_COUNT;
const GRAPH_HEIGHT = 10;

function getSamplesPixelPosition(
  sampleIndex: IndexIntoSamplesTable
): CssPixels {
  // Compute the pixel position of the center of a given sample.
  return sampleIndex * PIXELS_PER_SAMPLE + PIXELS_PER_SAMPLE * 0.5;
}

/**
 * This test verifies that the memory track can draw a graph of the memory.
 */
describe('TrackVisualProgress', function () {
  function setup() {
    const profile = getVisualProgressTrackProfile(
      Array(SAMPLE_COUNT).fill('A').join('  ')
    );
    const {
      meta: { visualMetrics },
    } = profile;
    if (!visualMetrics) {
      throw new Error('This profile does not contain visual Metrics');
    }
    const { VisualProgress } = visualMetrics;
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

    const renderResult = render(
      <Provider store={store}>
        <TrackVisualProgress
          progressGraphData={VisualProgress}
          graphDotTooltipText=" visual completeness at this time"
        />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const canvas = ensureExists(
      container.querySelector('.timelineTrackVisualProgressCanvas'),
      `Couldn't find the memory canvas, with selector .timelineTrackVisualProgressCanvas`
    );
    const getTooltipContents = () =>
      document.querySelector('.timelineTrackVisualProgressTooltip');
    const getVisualProgressDot = () =>
      container.querySelector('.timelineTrackVisualProgressGraphDot');
    const moveMouseAtCounter = (index: number) =>
      fireEvent(
        canvas,
        getMouseEvent('mousemove', { pageX: getSamplesPixelPosition(index) })
      );

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      store,
      canvas,
      getTooltipContents,
      moveMouseAtCounter,
      flushRafCalls,
      getVisualProgressDot,
    };
  }

  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  it('matches the component snapshot', () => {
    const { container } = setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    const { flushRafCalls } = setup();
    flushRafCalls();
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('can create a tooltip', function () {
    const { moveMouseAtCounter, getTooltipContents, canvas } = setup();
    expect(getTooltipContents()).toBeFalsy();
    moveMouseAtCounter(5000);
    expect(getTooltipContents()).toBeTruthy();
    fireEvent.mouseLeave(canvas);
    expect(getTooltipContents()).toBeFalsy();
  });

  it('has a tooltip that matches the snapshot', function () {
    const { moveMouseAtCounter, getTooltipContents } = setup();
    moveMouseAtCounter(5000);
    expect(getTooltipContents()).toMatchSnapshot();
  });

  it('draws a dot on the graph', function () {
    const { moveMouseAtCounter, getVisualProgressDot } = setup();
    expect(getVisualProgressDot()).toBeFalsy();
    moveMouseAtCounter(5000);
    expect(getVisualProgressDot()).toBeTruthy();
  });

  it('draws a dot that matches the snapshot', function () {
    const { moveMouseAtCounter, getVisualProgressDot } = setup();
    moveMouseAtCounter(5000);
    expect(getVisualProgressDot()).toMatchSnapshot();
  });
});
