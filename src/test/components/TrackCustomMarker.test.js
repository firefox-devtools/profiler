/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// based on the TrackMemory test

// @flow

import type { CssPixels } from 'firefox-profiler/types';

import * as React from 'react';
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { TrackCustomMarker } from '../../components/timeline/TrackCustomMarker';
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

function getMarkerPixelPosition(time: number): CssPixels {
  // Compute the pixel position related to the given marker time.
  return (time * GRAPH_WIDTH) / SAMPLE_COUNT;
}

function setup() {
  const { profile, stringTable } = getProfileFromTextSamples(
    Array(SAMPLE_COUNT).fill('A').join('  ')
  );
  const markerStringIndex = stringTable.indexForString('Marker');
  const threadIndex = 0;
  const thread = profile.threads[threadIndex];
  profile.meta.markerSchema.push({
    name: 'Marker',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    fields: [
      { key: 'first', label: 'first', format: 'integer', searchable: true },
      { key: 'second', label: 'second', format: 'integer', searchable: true },
    ],
    graphs: [
      // multiple lines are supported
      {
        key: 'first',
        type: 'line',
      },
      {
        key: 'second',
        color: 'green', // the default color is grey
        type: 'bar',
      },
    ],
  });
  const addMarker = (startTime: number, first: number, second: number) => {
    // $FlowExpectError - Invalid payload by our type system
    thread.markers.data.push({ type: 'Marker', first: first, second: second });
    thread.markers.name.push(markerStringIndex);
    thread.markers.startTime.push(startTime);
    thread.markers.endTime.push(startTime + 1);
    thread.markers.phase.push(1);
    thread.markers.category.push(4);
    thread.markers.length++;
  };
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    addMarker(i, i, i * 2);
  }
  const store = storeWithProfile(profile);
  const { getState, dispatch } = store;
  const flushRafCalls = mockRaf();

  /**
   * Coordinate the flushing of the requestAnimationFrame and the draw calls.
   */
  function getContextDrawCalls() {
    flushRafCalls();
    return flushDrawLog();
  }

  const renderResult = render(
    <Provider store={store}>
      <TrackCustomMarker
        threadIndex={0}
        markerSchema={
          profile.meta.markerSchema[profile.meta.markerSchema.length - 1]
        }
        markerName={markerStringIndex}
      />
    </Provider>
  );
  const { container } = renderResult;

  // WithSize uses requestAnimationFrame
  flushRafCalls();

  const canvas = ensureExists(
    container.querySelector('.timelineTrackCustomMarkerCanvas'),
    `Couldn't find the custom marker canvas, with selector .timelineTrackMarkerCustomCanvas`
  );
  const getTooltipContents = () => document.querySelector('.tooltipMarker');
  const getMarkerDot = () =>
    container.querySelector('.timelineTrackCustomMarkerGraphDot');
  const moveMouseAtMarker = (time) =>
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: getMarkerPixelPosition(time),
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
    moveMouseAtMarker,
    flushRafCalls,
    getMarkerDot,
    getContextDrawCalls,
  };
}

/**
 * This test verifies that the custom marker track can draw a bar and a line char.
 */
describe('TrackCustomMarker', function () {
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
    const { moveMouseAtMarker, getTooltipContents, canvas } = setup();
    expect(getTooltipContents()).toBeFalsy();
    moveMouseAtMarker(1);
    expect(getTooltipContents()).toBeTruthy();
    fireEvent.mouseLeave(canvas);
    expect(getTooltipContents()).toBeFalsy();
  });

  it('has a tooltip that matches the snapshot', function () {
    const { moveMouseAtMarker, getTooltipContents } = setup();
    moveMouseAtMarker(5);
    expect(getTooltipContents()).toMatchSnapshot();
  });

  it('draws a dot on the graph', function () {
    const { moveMouseAtMarker, getMarkerDot } = setup();
    expect(getMarkerDot()).toBeFalsy();
    moveMouseAtMarker(1);
    expect(getMarkerDot()).toBeTruthy();
  });

  it('can draw a dot on both extremes of the graph', function () {
    const { moveMouseAtMarker, getMarkerDot } = setup();
    expect(getMarkerDot()).toBeFalsy();
    moveMouseAtMarker(0);
    expect(getMarkerDot()).toBeTruthy();
    moveMouseAtMarker(7);
    expect(getMarkerDot()).toBeTruthy();
  });

  it('draws a dot that matches the snapshot', function () {
    const { moveMouseAtMarker, getMarkerDot } = setup();
    moveMouseAtMarker(1);
    expect(getMarkerDot()).toMatchSnapshot();
  });
});

describe('TrackCustomMarker with intersection observer', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  // Do not automatically trigger the intersection observers.
  autoMockIntersectionObserver(false);

  it('will not draw before the intersection observer', () => {
    const { getContextDrawCalls } = setup();
    const drawCalls = getContextDrawCalls();
    // There are other canvases inside the TrackThread too. We want to make sure
    // that custom marker graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      false
    );
  });

  it('will not draw after the intersection observer if it is not intersecting', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that custom marker graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it still
    // doesn't draw it.
    triggerIntersectionObservers({ isIntersecting: false });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      false
    );
  });

  it('will draw after the intersection observer if it is intersecting', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that custom marker graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it draws it.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      true
    );
  });

  it('will redraw after it becomes visible again', () => {
    const { getContextDrawCalls } = setup();
    let drawCalls = getContextDrawCalls();

    // There are other canvases inside the TrackThread too. We want to make sure
    // that activity graph is not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer and make sure that it draws it.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      true
    );

    // Now it goes out of view again. Make sure that we don't redraw.
    triggerIntersectionObservers({ isIntersecting: false });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      false
    );

    // Send out the resize with a width change.
    // By changing the "fake" result of getBoundingClientRect, we ensure that
    // the pure components rerender because their `width` props change.
    setMockedElementSize({ width: GRAPH_WIDTH * 2, height: GRAPH_HEIGHT });
    triggerResizeObservers();
    drawCalls = getContextDrawCalls();
    // It should still be not drawn yet.
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      false
    );

    // Now let's trigger the intersection observer again and make sure that it redraws.
    triggerIntersectionObservers({ isIntersecting: true });
    drawCalls = getContextDrawCalls();
    expect(drawCalls.some(([operation]) => operation === 'clearRect')).toBe(
      true
    );
  });
});
