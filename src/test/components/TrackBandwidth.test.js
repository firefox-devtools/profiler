/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { IndexIntoSamplesTable, CssPixels } from 'firefox-profiler/types';

import * as React from 'react';
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';

import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { TrackBandwidth } from '../../components/timeline/TrackBandwidth';
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
 * This test verifies that the bandwidth track can draw a graph.
 */
describe('TrackBandwidth', function () {
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
    for (let i = 7; i < thread.samples.length - 1; ++i) {
      sampleTimes[i] = 7 + i / 100;
    }
    profile.counters = [
      getCounterForThreadWithSamples(
        thread,
        threadIndex,
        {
          time: sampleTimes.slice(),
          // Bandwidth usage numbers. They are bytes.
          count: [
            10000, 40000, 50000, 100000, 2000000, 5000000, 30000, 1000000,
            20000, 1, 12000, 100000,
          ],
          length: SAMPLE_COUNT,
        },
        'SystemBandwidth',
        'bandwidth'
      ),
    ];
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

    const renderResult = render(
      <Provider store={store}>
        <TrackBandwidth counterIndex={0} />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const canvas = ensureExists(
      container.querySelector('.timelineTrackBandwidthCanvas'),
      `Couldn't find the bandwidth canvas, with selector .timelineTrackBandwidthCanvas`
    );
    const getTooltipContents = () =>
      document.querySelector('.timelineTrackBandwidthTooltip');
    const getBandwidthDot = () =>
      container.querySelector('.timelineTrackBandwidthGraphDot');
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
      getBandwidthDot,
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
    moveMouseAtCounter(4, 0.5);
    expect(getTooltipContents()).toMatchSnapshot();
  });

  it('draws a dot on the graph', function () {
    const { moveMouseAtCounter, getBandwidthDot } = setup();
    expect(getBandwidthDot()).toBeFalsy();
    moveMouseAtCounter(1, 0.5);
    expect(getBandwidthDot()).toBeTruthy();
  });

  it('can draw a dot on both extremes of the graph', function () {
    const { moveMouseAtCounter, getBandwidthDot } = setup();
    expect(getBandwidthDot()).toBeFalsy();
    moveMouseAtCounter(0, 0.25);
    expect(getBandwidthDot()).toBeTruthy();
    moveMouseAtCounter(7, 0);
    expect(getBandwidthDot()).toBeTruthy();
  });

  it('draws a dot that matches the snapshot', function () {
    const { moveMouseAtCounter, getBandwidthDot } = setup();
    moveMouseAtCounter(1, 0.5);
    expect(getBandwidthDot()).toMatchSnapshot();
  });

  it('shows a tooltip with bandwidth information', function () {
    const { dispatch, moveMouseAtCounter } = setup();
    act(() => {
      dispatch(
        updatePreviewSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 5,
          selectionEnd: 6,
        })
      );
    });

    moveMouseAtCounter(3, 0);
    // Note: Fluent adds isolation characters \u2068 and \u2069 around variables.
    expect(screen.getByText(/speed/).nextSibling).toHaveTextContent(
      '95.4MB\u2069 per second'
    );
    expect(screen.getByText(/visible range:/).nextSibling).toHaveTextContent(
      /7.97MB\u2069 \(\u2068\d+(\.\d+)?\u2069 g CO₂e\)/
    );
    expect(
      screen.getByText(/current selection:/).nextSibling
    ).toHaveTextContent(/4.77MB\u2069 \(\u2068\d+(\.\d+)?\u2069 g CO₂e\)/);
  });
});
