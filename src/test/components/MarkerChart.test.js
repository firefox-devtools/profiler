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

it('renders MarkerChart correctly', () => {
  const flushRafCalls = mockRaf();
  window.devicePixelRatio = 1;
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

  const profile = getProfileWithMarkers([
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
  ]);

  const store = storeWithProfile(profile);
  store.dispatch(changeSelectedTab('marker-chart'));

  const markerChart = renderer.create(
    <Provider store={store}>
      <MarkerChart />
    </Provider>,
    { createNodeMock }
  );

  flushRafCalls();

  let drawCalls = ctx.__flushDrawLog();
  expect(markerChart).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  store.dispatch(changeSelectedTab('network-chart'));

  flushRafCalls();
  drawCalls = ctx.__flushDrawLog();
  expect(markerChart).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  delete window.devicePixelRatio;
});
