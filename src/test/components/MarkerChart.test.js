/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import MarkerChart from '../../components/marker-chart';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/make-profile';
import { getBoundingBox } from '../fixtures/utils';

jest.useFakeTimers();

it('renders MarkerChart correctly', () => {
  // Tie the requestAnimationFrame into jest's fake timers.
  window.requestAnimationFrame = fn => setTimeout(fn, 0);
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
      'Very very very very very very long Marker D',
      6,
      { startTime: 5, endTime: 15 },
    ],
    ['Dot marker E', 4, { startTime: 4, endTime: 4 }],
    ['Non-interval marker F without data', 7, null],
    [
      'Marker G type DOMEvent',
      5,
      {
        startTime: 5,
        endTime: 10,
        type: 'DOMEvent',
        eventType: 'click',
        phase: 2,
      },
    ],
  ]);

  const markerChart = renderer.create(
    <Provider store={storeWithProfile(profile)}>
      <MarkerChart threadIndex={0} viewHeight={1000} />
    </Provider>,
    { createNodeMock }
  );

  // Flush any requestAnimationFrames.
  jest.runAllTimers();

  const tree = markerChart.toJSON();
  const drawCalls = ctx.__flushDrawLog();

  expect(tree).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  delete window.requestAnimationFrame;
  delete window.devicePixelRatio;
});
