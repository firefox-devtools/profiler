/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { mount } from 'enzyme';
import { Provider } from 'react-redux';

import { changeMarkersSearchString } from '../../actions/profile-view';
import MarkerChart from '../../components/marker-chart';
import { changeSelectedTab } from '../../actions/app';

import EmptyReasons from '../../components/shared/EmptyReasons';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/make-profile';
import { getBoundingBox } from '../fixtures/utils';
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
];

const NETWORK_MARKERS = [
  [
    'Load event',
    11,
    {
      type: 'Network',
      startTime: 11,
      endTime: 12,
      id: 31666793873480,
      status: 'STATUS_START',
      pri: 0,
      URI: 'https://tiles.services.mozilla.com/v3/links/ping-centre',
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
    .mockImplementation(() => getBoundingBox(200, 300));

  const store = storeWithProfile(profile);
  store.dispatch(changeSelectedTab('marker-chart'));

  const markerChart = mount(
    <Provider store={store}>
      <MarkerChart />
    </Provider>
  );

  return {
    markerChart,
    flushRafCalls,
    dispatch: store.dispatch,
    flushDrawLog: () => ctx.__flushDrawLog(),
  };
}

it('renders MarkerChart correctly', () => {
  window.devicePixelRatio = 1;

  const profile = getProfileWithMarkers([...MARKERS, ...NETWORK_MARKERS]);
  const {
    flushRafCalls,
    dispatch,
    markerChart,
    flushDrawLog,
  } = setupWithProfile(profile);

  dispatch(changeSelectedTab('marker-chart'));
  markerChart.update();
  flushRafCalls();

  let drawCalls = flushDrawLog();
  expect(markerChart).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  dispatch(changeSelectedTab('network-chart'));
  markerChart.update();
  flushRafCalls();

  drawCalls = flushDrawLog();
  expect(markerChart).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  delete window.devicePixelRatio;
});

it('renders the hoveredItem markers properly', () => {
  window.devicePixelRatio = 1;

  const profile = getProfileWithMarkers(MARKERS);
  const {
    flushRafCalls,
    dispatch,
    markerChart,
    flushDrawLog,
  } = setupWithProfile(profile);

  dispatch(changeSelectedTab('marker-chart'));
  markerChart.update();
  flushRafCalls();
  flushDrawLog();

  // No tooltip displayed yet
  expect(markerChart.find('Tooltip').exists()).toEqual(false);

  // Move the mouse on top of an item.
  markerChart.find('canvas').simulate('mousemove', {
    nativeEvent: { offsetX: 50, offsetY: 5 },
    pageX: 50,
    pageY: 5,
  });
  markerChart.update();
  flushRafCalls();

  const drawCalls = flushDrawLog();
  expect(drawCalls).toMatchSnapshot();

  // The tooltip should be displayed
  expect(markerChart.find('Tooltip').exists()).toEqual(true);
});

describe('EmptyReasons', () => {
  it('shows a reason when a profile has no markers', () => {
    const profile = getProfileWithMarkers([]);
    const { dispatch, markerChart } = setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    markerChart.update();
    expect(markerChart.find(EmptyReasons)).toMatchSnapshot();
  });

  fit("shows a reason when a profile's markers have been filtered out", () => {
    const profile = getProfileWithMarkers(MARKERS);
    const { dispatch, markerChart } = setupWithProfile(profile);

    dispatch(changeSelectedTab('marker-chart'));
    dispatch(changeMarkersSearchString('MATCH_NOTHING'));
    markerChart.update();
    console.log(markerChart.find(EmptyReasons).text());
    expect(markerChart.find(EmptyReasons)).toMatchSnapshot();
  });

  it('shows a reason when a profile has no network markers', () => {
    const profile = getProfileWithMarkers(MARKERS);
    const { dispatch, markerChart } = setupWithProfile(profile);

    dispatch(changeSelectedTab('network-chart'));
    markerChart.update();
    expect(markerChart.find(EmptyReasons)).toMatchSnapshot();
  });

  it("shows a reason when a profile's network markers have been filtered out", () => {
    const profile = getProfileWithMarkers(NETWORK_MARKERS);
    const { dispatch, markerChart } = setupWithProfile(profile);

    dispatch(changeSelectedTab('network-chart'));
    dispatch(changeMarkersSearchString('MATCH_NOTHING'));
    markerChart.update();
    expect(markerChart.find(EmptyReasons)).toMatchSnapshot();
  });
});
