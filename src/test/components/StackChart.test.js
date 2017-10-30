/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import StackChartGraph from '../../components/stack-chart';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

jest.useFakeTimers();

it('renders StackChartGraph correctly', () => {
  // Tie the requestAnimationFrame into jest's fake timers.
  window.requestAnimationFrame = fn => setTimeout(fn, 0);
  window.devicePixelRatio = 1;
  const ctx = mockCanvasContext();

  /**
   * Mock out any created refs for the components with relevant information.
   */
  function createNodeMock(element) {
    // <TimelineCanvas><canvas /></TimelineCanvas>
    if (element.type === 'canvas') {
      return {
        getBoundingClientRect: () => getBoundingBox(200, 300),
        getContext: () => ctx,
        style: {},
      };
    }
    // <TimelineViewport />
    if (element.props.className.split(' ').includes('chartViewport')) {
      return {
        getBoundingClientRect: () => getBoundingBox(200, 300),
      };
    }
    return null;
  }

  const { profile } = getProfileFromTextSamples(`
    A A A
    B B B
    C C H
    D F I
    E G
  `);

  const store = storeWithProfile(profile);

  const stackChart = renderer.create(
    <Provider store={store}>
      <StackChartGraph threadIndex={0} viewHeight={1000} />
    </Provider>,
    { createNodeMock }
  );

  // Flush any requestAnimationFrames.
  jest.runAllTimers();

  const tree = stackChart.toJSON();
  const drawCalls = ctx.__flushDrawLog();

  expect(tree).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  delete window.requestAnimationFrame;
  delete window.devicePixelRatio;
});
