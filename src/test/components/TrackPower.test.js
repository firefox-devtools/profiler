/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { IndexIntoSamplesTable, CssPixels } from 'firefox-profiler/types';

import * as React from 'react';
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { TrackPower } from '../../components/timeline/TrackPower';
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
  samplePosition
): CssPixels {
  // Compute the pixel position of the center of a given sample.
  return sampleIndex * PIXELS_PER_SAMPLE + PIXELS_PER_SAMPLE * samplePosition;
}

/**
 * This test verifies that the power track can draw a graph.
 */
describe('TrackPower', function () {
  function setup() {
    const { profile } = getProfileFromTextSamples(
      Array(SAMPLE_COUNT).fill('A').join('  ')
    );
    const threadIndex = 0;
    const thread = profile.threads[threadIndex];
    // Changing one of the sample times, so we can test different intervals.
    thread.samples.time[1] = 1.5; // It was 1 before.
    profile.counters = [
      getCounterForThreadWithSamples(
        thread,
        threadIndex,
        {
          time: thread.samples.time.slice(),
          // Power usage numbers.
          count: [100, 400, 500, 1000, 200, 500, 300, 100],
          length: SAMPLE_COUNT,
        },
        'SystemPower',
        'power'
      ),
    ];
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

    const renderResult = render(
      <Provider store={store}>
        <TrackPower counterIndex={0} />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const canvas = ensureExists(
      container.querySelector('.timelineTrackPowerCanvas'),
      `Couldn't find the power canvas, with selector .timelineTrackPowerCanvas`
    );
    const getTooltipContents = () =>
      document.querySelector('.timelineTrackPowerTooltip');
    const getPowerDot = () =>
      container.querySelector('.timelineTrackPowerGraphDot');
    const moveMouseAtCounter = (index, pos) =>
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
      getPowerDot,
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
    const { moveMouseAtCounter, getPowerDot } = setup();
    expect(getPowerDot()).toBeFalsy();
    moveMouseAtCounter(1, 0.5);
    expect(getPowerDot()).toBeTruthy();
  });

  it('can draw a dot on both extremes of the graph', function () {
    const { moveMouseAtCounter, getPowerDot } = setup();
    expect(getPowerDot()).toBeFalsy();
    moveMouseAtCounter(0, 0.25);
    expect(getPowerDot()).toBeTruthy();
    moveMouseAtCounter(7, 0);
    expect(getPowerDot()).toBeTruthy();
  });

  it('draws a dot that matches the snapshot', function () {
    const { moveMouseAtCounter, getPowerDot } = setup();
    moveMouseAtCounter(1, 0.5);
    expect(getPowerDot()).toMatchSnapshot();
  });

  it('shows a tooltip with a Power: line and a power unit', function () {
    const { moveMouseAtCounter } = setup();
    moveMouseAtCounter(3, 0);
    // 1000pWh spent over 1ms is 3.6mW
    expect(screen.getByText(/Power:/)).toHaveTextContent('3.6mW');
  });
});
