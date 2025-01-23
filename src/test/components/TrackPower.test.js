/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { IndexIntoSamplesTable, CssPixels } from 'firefox-profiler/types';

import * as React from 'react';
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';

import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
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
const SAMPLE_COUNT = 12;
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
    const sampleTimes = ensureExists(thread.samples.time);
    // Changing one of the sample times, so we can test different intervals.
    sampleTimes[1] = 1.5; // It was 1 before.
    // Ensure some samples are very close to each other, to exercise
    // the max min decimation algorithm.
    for (let i = 7; i < sampleTimes.length - 1; ++i) {
      sampleTimes[i] = 7 + i / 100;
    }
    profile.counters = [
      getCounterForThreadWithSamples(
        thread,
        threadIndex,
        {
          time: sampleTimes.slice(),
          // Power usage numbers. They are pWh so they are pretty big.
          count: [
            10000, 40000, 50000, 100000, 2000000, 5000000, 30000, 1000000,
            20000, 1, 12000, 100000,
          ],
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
    // Here are the values we'll get in the tooltip:
    // 5th counter value is 5000000 pWh, that is 5 µWh. Over 1ms, this means
    // 18W (5 * 1000 * 3600 / 1000^2).
    // Over the full range, we get 7.240 µWh, therefore we'll see in the tooltip
    // 0.007 mWh.
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
    const { dispatch, moveMouseAtCounter } = setup();
    dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 5,
        selectionEnd: 6,
      })
    );
    moveMouseAtCounter(3, 0);
    // 100000pWh spent over 1ms is 360mW
    // Note: Fluent adds isolation characters \u2068 and \u2069 around variables.
    expect(screen.getByText(/Power:/).nextSibling).toHaveTextContent(
      '360\u2069 mW'
    );
    // Over the full range, we get 8.352 µWh, therefore we'll see in the tooltip
    // 8.4 µWh.
    expect(screen.getByText(/visible range:/).nextSibling).toHaveTextContent(
      '8.4\u2069 µWh'
    );
    // Over the preview selection, we get 5 µWh which shows up as 5.0 µWh.
    expect(
      screen.getByText(/Energy used in the current selection:/).nextSibling
    ).toHaveTextContent('5.0\u2069 µWh');
    expect(
      screen.getByText(/Average power in the current selection/).nextSibling
    ).toHaveTextContent('18.0\u2069 W');
  });

  it('does not break when the selection is empty', function () {
    const { dispatch, moveMouseAtCounter } = setup();
    dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 6,
        selectionEnd: 6,
      })
    );
    moveMouseAtCounter(3, 0);
    // 100000pWh spent over 1ms is 360mW
    // Note: Fluent adds isolation characters \u2068 and \u2069 around variables.
    expect(screen.getByText(/Power:/).nextSibling).toHaveTextContent(
      '360\u2069 mW'
    );
    // Over the full range, we get 8.352 µWh, therefore we'll see in the tooltip
    // 8.4 µWh.
    expect(screen.getByText(/visible range:/).nextSibling).toHaveTextContent(
      '8.4\u2069 µWh'
    );

    // The preview selection being empty, these 2 lines are not useful and
    // therefore not rendered.
    expect(
      screen.queryByText(/Energy used in the current selection:/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Average power in the current selection/)
    ).not.toBeInTheDocument();
  });
});
