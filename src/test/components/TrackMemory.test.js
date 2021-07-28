/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { IndexIntoSamplesTable, CssPixels } from 'firefox-profiler/types';

import * as React from 'react';
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { TrackMemory } from '../../components/timeline/TrackMemory';
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
  getCounterForThread,
} from '../fixtures/profiles/processed-profile';
import { autoMockElementSize } from '../fixtures/mocks/element-size';

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
 * This test verifies that the memory track can draw a graph of the memory.
 */
describe('TrackMemory', function() {
  function setup() {
    const { profile } = getProfileFromTextSamples(
      Array(SAMPLE_COUNT)
        .fill('A')
        .join('  ')
    );
    const threadIndex = 0;
    const thread = profile.threads[threadIndex];
    profile.counters = [getCounterForThread(thread, threadIndex)];
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

    const renderResult = render(
      <Provider store={store}>
        <TrackMemory counterIndex={0} />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const canvas = ensureExists(
      container.querySelector('.timelineTrackMemoryCanvas'),
      `Couldn't find the memory canvas, with selector .timelineTrackMemoryCanvas`
    );
    const getTooltipContents = () =>
      document.querySelector('.timelineTrackMemoryTooltip');
    const getMemoryDot = () =>
      container.querySelector('.timelineTrackMemoryGraphDot');
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
      getMemoryDot,
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

  it('can create a tooltip', function() {
    const { moveMouseAtCounter, getTooltipContents, canvas } = setup();
    expect(getTooltipContents()).toBeFalsy();
    moveMouseAtCounter(1, 0.5);
    expect(getTooltipContents()).toBeTruthy();
    fireEvent.mouseLeave(canvas);
    expect(getTooltipContents()).toBeFalsy();
  });

  it('has a tooltip that matches the snapshot', function() {
    const { moveMouseAtCounter, getTooltipContents } = setup();
    moveMouseAtCounter(5, 0.5);
    expect(getTooltipContents()).toMatchSnapshot();
  });

  it('draws a dot on the graph', function() {
    const { moveMouseAtCounter, getMemoryDot } = setup();
    expect(getMemoryDot()).toBeFalsy();
    moveMouseAtCounter(1, 0.5);
    expect(getMemoryDot()).toBeTruthy();
  });

  it('can draw a dot on both extremes of the graph', function() {
    const { moveMouseAtCounter, getMemoryDot } = setup();
    expect(getMemoryDot()).toBeFalsy();
    moveMouseAtCounter(0, 0.25);
    expect(getMemoryDot()).toBeTruthy();
    moveMouseAtCounter(7, 0);
    expect(getMemoryDot()).toBeTruthy();
  });

  it('draws a dot that matches the snapshot', function() {
    const { moveMouseAtCounter, getMemoryDot } = setup();
    moveMouseAtCounter(1, 0.5);
    expect(getMemoryDot()).toMatchSnapshot();
  });
});
