/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';

import MarkerChart from '../../components/marker-chart';
import { changeSelectedTab } from '../../actions/app';

import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/make-profile';
import { getBoundingBox } from '../fixtures/utils';
import mockRaf from '../fixtures/mocks/request-animation-frame';

const MARKERS = [
  ['Marker A', 0, { startTime: 0, endTime: 10 }],
  ['Marker B', 0, { startTime: 0, endTime: 10 }],
  ['Marker C', 5, { startTime: 5, endTime: 15 }],
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

  /**
   * Mock out any created refs for the components with relevant information.
   */
  function createNodeMock(element) {
    // <ChartCanvas><canvas /></ChartCanvas>
    if (element.type === 'canvas') {
      return {
        getBoundingClientRect: () => getBoundingBox(200, 300),
        getContext: () => ctx,
        style: {},
      };
    }
    // <ChartViewport />
    if (element.props.className.split(' ').includes('chartViewport')) {
      return {
        getBoundingClientRect: () => getBoundingBox(200, 300),
      };
    }
    return null;
  }

  const store = storeWithProfile(profile);
  store.dispatch(changeSelectedTab('marker-chart'));

  const markerChart = renderer.create(
    <Provider store={store}>
      <MarkerChart />
    </Provider>,
    { createNodeMock }
  );

  return {
    markerChart,
    flushRafCalls,
    store,
    flushDrawLog: () => ctx.__flushDrawLog(),
  };
}

it('renders MarkerChart correctly', () => {
  window.devicePixelRatio = 1;

  const profile = getProfileWithMarkers([...MARKERS, ...NETWORK_MARKERS]);
  const { flushRafCalls, store, markerChart, flushDrawLog } = setupWithProfile(
    profile
  );

  store.dispatch(changeSelectedTab('marker-chart'));
  flushRafCalls();

  let drawCalls = flushDrawLog();
  expect(markerChart).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  store.dispatch(changeSelectedTab('network-chart'));
  flushRafCalls();

  drawCalls = flushDrawLog();
  expect(markerChart).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  delete window.devicePixelRatio;
});

describe('Empty Reasons', () => {
  it('shows a reason when a profile has no marker', () => {
    const profile = getProfileWithMarkers([]);
    const { store, markerChart } = setupWithProfile(profile);

    store.dispatch(changeSelectedTab('marker-chart'));
    expect(markerChart).toMatchSnapshot();
  });

  it('shows a reason when a profil has no network markers', () => {
    const profile = getProfileWithMarkers(MARKERS);
    const { store, markerChart } = setupWithProfile(profile);

    store.dispatch(changeSelectedTab('network-chart'));
    expect(markerChart).toMatchSnapshot();
  });
});
