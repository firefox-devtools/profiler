/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { TrackEventDelay } from '../../components/timeline/TrackEventDelay';
import { ensureExists } from '../../utils/types';
import { enableEventDelayTracks } from '../../actions/app';

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
import { getProfileWithEventDelays } from '../fixtures/profiles/processed-profile';
import { autoMockElementSize } from '../fixtures/mocks/element-size';

import type { IndexIntoSamplesTable } from 'firefox-profiler/types';
import type { CssPixels } from '../../types/units';

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
 * This test verifies that the event delay track can draw a graph of the responsiveness.
 */
describe('TrackEventDelay', function () {
  function setup(isTrackEnabled: boolean = true) {
    const profile = getProfileWithEventDelays();
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

    // Enable the event delay tracks if we want to see them, they are disabled by default
    if (isTrackEnabled) {
      dispatch(enableEventDelayTracks());
    }

    const renderResult = render(
      <Provider store={store}>
        <TrackEventDelay threadIndex={0} />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const canvas = ensureExists(
      container.querySelector('.timelineTrackEventDelayCanvas'),
      `Couldn't find the event delay canvas, with selector .timelineTrackEventDelayCanvas`
    );
    const getTooltipContents = () =>
      document.querySelector('.timelineTrackEventDelayTooltip');
    const getEventDelayDot = () =>
      container.querySelector('.timelineTrackEventDelayGraphDot');
    const moveMouseAtEventDelay = (index: number, pos: number) =>
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
      store,
      canvas,
      getTooltipContents,
      moveMouseAtEventDelay,
      flushRafCalls,
      getEventDelayDot,
    };
  }

  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  it('matches the component snapshot when event delay tracks are disabled', () => {
    const { container } = setup(false);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    const { flushRafCalls } = setup();
    flushRafCalls();
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('can create a tooltip', function () {
    const { moveMouseAtEventDelay, getTooltipContents, canvas } = setup();
    expect(getTooltipContents()).toBeFalsy();
    moveMouseAtEventDelay(1, 0.5);
    expect(getTooltipContents()).toBeTruthy();
    fireEvent.mouseLeave(canvas);
    expect(getTooltipContents()).toBeFalsy();
  });

  it('has a tooltip that matches the snapshot', function () {
    const { moveMouseAtEventDelay, getTooltipContents } = setup();
    moveMouseAtEventDelay(5, 0.5);
    expect(getTooltipContents()).toMatchSnapshot();
  });

  it('draws a dot on the graph', function () {
    const { moveMouseAtEventDelay, getEventDelayDot } = setup();
    expect(getEventDelayDot()).toBeFalsy();
    moveMouseAtEventDelay(1, 0.5);
    expect(getEventDelayDot()).toBeTruthy();
  });

  it('can draw a dot on both extremes of the graph', function () {
    const { moveMouseAtEventDelay, getEventDelayDot } = setup();
    expect(getEventDelayDot()).toBeFalsy();
    moveMouseAtEventDelay(0, 0.25);
    expect(getEventDelayDot()).toBeTruthy();
    moveMouseAtEventDelay(8, 0);
    expect(getEventDelayDot()).toBeTruthy();
  });

  it('draws a dot that matches the snapshot', function () {
    const { moveMouseAtEventDelay, getEventDelayDot } = setup();
    moveMouseAtEventDelay(1, 0.5);
    expect(getEventDelayDot()).toMatchSnapshot();
  });
});
