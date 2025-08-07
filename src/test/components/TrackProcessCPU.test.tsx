/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { IndexIntoSamplesTable, CssPixels } from 'firefox-profiler/types';
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { TrackProcessCPU } from '../../components/timeline/TrackProcessCPU';
import { ensureExists } from '../../utils/flow';

import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  addRootOverlayElement,
  removeRootOverlayElement,
  getMouseEvent,
} from '../fixtures/utils';
import {
  getProfileFromTextSamples,
  getCounterForThreadWithSamples,
} from '../fixtures/profiles/processed-profile';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

// The following constants determine the size of the drawn graph.
const SAMPLE_COUNT = 8;
const PIXELS_PER_SAMPLE = 10;
const GRAPH_WIDTH = PIXELS_PER_SAMPLE * SAMPLE_COUNT;
const GRAPH_HEIGHT = 10;

function getSamplesPixelPosition(
  sampleIndex: IndexIntoSamplesTable,
  samplePosition: number
): CssPixels {
  // Compute the pixel position of the center of a given sample.
  return sampleIndex * PIXELS_PER_SAMPLE + PIXELS_PER_SAMPLE * samplePosition;
}

/**
 * This test verifies that the process CPU track can draw a graph of the process CPU.
 */
describe('TrackProcessCPU', function () {
  function setup() {
    const { profile } = getProfileFromTextSamples(
      Array(SAMPLE_COUNT).fill('A').join('  ')
    );
    const threadIndex = 0;
    const thread = profile.threads[threadIndex];
    const sampleTimes = ensureExists(thread.samples.time);
    // Changing one of the sample times, so we can test different intervals.
    sampleTimes[1] = 1.5; // It was 1 before.
    profile.counters = [
      getCounterForThreadWithSamples(
        thread,
        threadIndex,
        {
          time: sampleTimes.slice(),
          // CPU usage numbers for the per-process CPU.
          count: [100, 400, 500, 1000, 200, 500, 300, 100],
          length: SAMPLE_COUNT,
        },
        'processCPU',
        'CPU'
      ),
    ];
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

    const renderResult = render(
      <Provider store={store}>
        <TrackProcessCPU counterIndex={0} />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const canvas = ensureExists(
      container.querySelector('.timelineTrackProcessCPUCanvas'),
      `Couldn't find the process CPU canvas, with selector .timelineTrackProcessCPUCanvas`
    );
    const getTooltipContents = () =>
      document.querySelector('.timelineTrackProcessCPUTooltip');
    const getProcessCPUDot = () =>
      container.querySelector('.timelineTrackProcessCPUGraphDot');
    const moveMouseAtCounter = (index: number, pos: number) =>
      fireEvent(
        canvas,
        getMouseEvent('mousemove', {
          pageX: getSamplesPixelPosition(index, pos),
        })
      );

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      thread,
      store,
      threadIndex,
      canvas,
      getTooltipContents,
      moveMouseAtCounter,
      flushRafCalls,
      getProcessCPUDot,
    };
  }

  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  autoMockIntersectionObserver();
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
    moveMouseAtCounter(1, 0.5);
    expect(getTooltipContents()).toBeTruthy();
    fireEvent.mouseLeave(canvas);
    expect(getTooltipContents()).toBeFalsy();
  });

  it('has a tooltip that matches the snapshot', function () {
    const { moveMouseAtCounter, getTooltipContents } = setup();
    // We are hovering exactly between 4th and 5th counter. That's why it should
    // show the 5th counter.
    moveMouseAtCounter(4, 0.5);
    expect(getTooltipContents()).toMatchSnapshot();
  });

  it('draws a dot on the graph', function () {
    const { moveMouseAtCounter, getProcessCPUDot } = setup();
    expect(getProcessCPUDot()).toBeFalsy();
    moveMouseAtCounter(1, 0.5);
    expect(getProcessCPUDot()).toBeTruthy();
  });

  it('can draw a dot on both extremes of the graph', function () {
    const { moveMouseAtCounter, getProcessCPUDot } = setup();
    expect(getProcessCPUDot()).toBeFalsy();
    moveMouseAtCounter(0, 0.25);
    expect(getProcessCPUDot()).toBeTruthy();
    moveMouseAtCounter(7, 0);
    expect(getProcessCPUDot()).toBeTruthy();
  });

  it('draws a dot that matches the snapshot', function () {
    const { moveMouseAtCounter, getProcessCPUDot } = setup();
    moveMouseAtCounter(1, 0.5);
    expect(getProcessCPUDot()).toMatchSnapshot();
  });

  it('accounts the real sample times correctly', function () {
    const { moveMouseAtCounter } = setup();
    moveMouseAtCounter(2, 0);
    // 2nd index has 500 value in it. Without thinking about the intervals, it
    // should be 50% CPU ratio since the highest value is 1000. But if we look
    // at the intervals, we can see that the interval of this sample is 0.5ms
    // therefore, the CPU usage should be 100% instead.
    expect(screen.getByText(/CPU:/)).toHaveTextContent('100%');
  });
});
