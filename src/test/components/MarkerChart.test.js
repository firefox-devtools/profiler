/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';

import { changeMarkersSearchString } from '../../actions/profile-view';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import MarkerChart from '../../components/marker-chart';
import { changeSelectedTab } from '../../actions/app';
import { ensureExists } from '../../utils/flow';

import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import {
  getBoundingBox,
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import mockRaf from '../fixtures/mocks/request-animation-frame';

const MARKERS = [
  ['Marker A', 0, { startTime: 0, endTime: 10 }],
  ['Marker A', 0, { startTime: 0, endTime: 10 }],
  ['Marker A', 11, { startTime: 11, endTime: 15 }],
  [
    'Very very very very very very Very very very very very very Very very very very very very Very very very very very very Very very very very very very long Marker D',
    6,
    { startTime: 5, endTime: 15 },
  ],
  ['Dot marker E', 4, { startTime: 4, endTime: 4 }],
  ['Non-interval marker F without data', 7, null],
  [
    'Marker G type DOMEvent',
    5,
    {
      type: 'tracing',
      category: 'DOMEvent',
      eventType: 'click',
      interval: 'start',
      phase: 2,
    },
  ],
  [
    'Marker G type DOMEvent',
    10,
    {
      type: 'tracing',
      category: 'DOMEvent',
      eventType: 'click',
      interval: 'end',
      phase: 2,
    },
  ],
  [
    'Marker H with no start',
    3,
    {
      type: 'tracing',
      category: 'Paint',
      interval: 'end',
    },
  ],
  [
    'Marker H with no end',
    9,
    {
      type: 'tracing',
      category: 'Paint',
      interval: 'start',
    },
  ],
];

function setupWithProfile(profile) {
  const flushRafCalls = mockRaf();
  const ctx = mockCanvasContext();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);

  // Ideally we'd want this only on the Canvas and on ChartViewport, but this is
  // a lot easier to mock this everywhere.
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() =>
      getBoundingBox(200 + TIMELINE_MARGIN_LEFT + TIMELINE_MARGIN_RIGHT, 300)
    );

  const store = storeWithProfile(profile);
  store.dispatch(changeSelectedTab('marker-chart'));

  const renderResult = render(
    <Provider store={store}>
      <MarkerChart />
    </Provider>
  );

  return {
    ...renderResult,
    flushRafCalls,
    dispatch: store.dispatch,
    getState: store.getState,
    flushDrawLog: () => ctx.__flushDrawLog(),
  };
}

describe('MarkerChart', function() {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  it('renders the normal marker chart and matches the snapshot', () => {
    window.devicePixelRatio = 1;

    const profile = getProfileWithMarkers([...MARKERS]);
    const {
      container,
      flushRafCalls,
      dispatch,
      flushDrawLog,
    } = setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    flushRafCalls();

    const drawCalls = flushDrawLog();
    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    delete window.devicePixelRatio;
  });

  it('does not render several dot markers on the same pixel', () => {
    window.devicePixelRatio = 1;
    const markers = [
      // 'Marker first' and 'Marker last' define our range.
      ['Marker first', 0, null],
      // Then 2 very close dot markers with the same name. They shouldn't be
      // drawn both together.
      ['Marker A', 5000, null],
      ['Marker A', 5001, null],
      // This is a longer marker, it should always be drawn even if it starts at
      // the same location as a dot marker
      ['Marker A', 5001, { startTime: 5001, endTime: 7000 }],
      [
        'Marker last',
        15000,
        null,
      ] /* add a marker that's quite far away to have a big range */,
    ];

    const profile = getProfileWithMarkers(markers);
    const { flushRafCalls, flushDrawLog } = setupWithProfile(profile);
    flushRafCalls();

    const drawCalls = flushDrawLog();

    // Check that we have 3 arc operations (first marker, one of the 2 dot
    // markers in the middle, and last marker)
    const arcOperations = drawCalls.filter(
      ([operation]) => operation === 'arc'
    );
    expect(arcOperations).toHaveLength(3);

    // Check that all X values are different
    const arcOperationsX = new Set(arcOperations.map(([, x]) => Math.round(x)));
    expect(arcOperationsX.size).toBe(3);

    // Check that we have a fillRect operation for the longer marker.
    // We filter on the height to get only 1 relevant fillRect operation per marker
    const fillRectOperations = drawCalls.filter(
      ([operation, , , , height]) =>
        operation === 'fillRect' && height > 1 && height < 16
    );
    expect(fillRectOperations).toHaveLength(1);

    delete window.devicePixelRatio;
  });

  it('renders the hoveredItem markers properly', () => {
    window.devicePixelRatio = 1;

    const profile = getProfileWithMarkers(MARKERS);
    const {
      flushRafCalls,
      dispatch,
      container,
      flushDrawLog,
    } = setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    flushRafCalls();
    flushDrawLog();

    // No tooltip displayed yet
    expect(document.querySelector('.tooltip')).toBeFalsy();

    // Move the mouse on top of an item.
    fireEvent(
      ensureExists(
        container.querySelector('canvas'),
        `Couldn't find the canvas element`
      ),
      getMouseEvent('mousemove', {
        offsetX: 50 + TIMELINE_MARGIN_LEFT,
        offsetY: 5,
        pageX: 50,
        pageY: 5,
      })
    );

    flushRafCalls();

    const drawCalls = flushDrawLog();
    expect(drawCalls).toMatchSnapshot();

    // The tooltip should be displayed
    expect(document.querySelector('.tooltip')).toMatchSnapshot();
  });

  describe('with search strings', function() {
    function getFillTextCalls(drawCalls) {
      return drawCalls
        .filter(([methodName]) => methodName === 'fillText')
        .map(([_, text]) => text);
    }

    const searchString = 'Dot marker E';

    it('renders lots of markers initially', function() {
      const profile = getProfileWithMarkers(MARKERS);
      const { flushRafCalls, flushDrawLog } = setupWithProfile(profile);

      flushRafCalls();
      const text = getFillTextCalls(flushDrawLog());
      expect(text.length).toBeGreaterThan(1);
      // Check that our test search string is in here:
      expect(text.filter(t => t === searchString).length).toBe(1);
    });

    it('renders only the marker that was searched for', function() {
      const profile = getProfileWithMarkers(MARKERS);
      const { flushRafCalls, dispatch, flushDrawLog } = setupWithProfile(
        profile
      );

      // Flush out any existing draw calls.
      flushRafCalls();
      flushDrawLog();

      // Update the chart with a search string.
      dispatch(changeMarkersSearchString(searchString));
      flushRafCalls();

      const text = getFillTextCalls(flushDrawLog());
      expect(text.length).toBe(1);
      expect(text[0]).toBe(searchString);
    });
  });

  describe('EmptyReasons', () => {
    it('shows a reason when a profile has no markers', () => {
      const profile = getProfileWithMarkers([]);
      const { dispatch, container } = setupWithProfile(profile);

      dispatch(changeSelectedTab('marker-chart'));
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it("shows a reason when a profile's markers have been filtered out", () => {
      const profile = getProfileWithMarkers(MARKERS);
      const { dispatch, container } = setupWithProfile(profile);

      dispatch(changeSelectedTab('marker-chart'));
      dispatch(changeMarkersSearchString('MATCH_NOTHING'));
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });
  });
});
