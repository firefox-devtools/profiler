/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ProfileThreadTrackingMarkerOverview from '../../components/header/ProfileThreadTracingMarkerOverview';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/make-profile';
import ReactDOM from 'react-dom';
import { getBoundingBox } from '../fixtures/utils';

jest.useFakeTimers();
ReactDOM.findDOMNode = jest.fn(() => ({
  getBoundingClientRect: () => getBoundingBox(200, 300),
}));

it('renders ProfileThreadTracingMarkerOverview correctly', () => {
  // Tie the requestAnimationFrame into jest's fake timers.
  window.requestAnimationFrame = fn => setTimeout(fn, 0);
  window.devicePixelRatio = 1;
  const ctx = mockCanvasContext();

  /**
   * Mock out any created refs for the components with relevant information.
   */
  function createNodeMock(element) {
    // This is the canvas used to draw markers
    if (element.type === 'canvas') {
      return {
        getBoundingClientRect: () => getBoundingBox(200, 300),
        getContext: () => ctx,
        style: {},
      };
    }
    return null;
  }

  const profile = getProfileWithMarkers([
    ['GCMajor', 2, { startTime: 2, endTime: 12 }],
    ['Marker A', 0, { startTime: 0, endTime: 10 }],
    ['Marker B', 0, { startTime: 0, endTime: 10 }],
    ['Marker C', 5, { startTime: 5, endTime: 15 }],
  ]);

  const overview = renderer.create(
    <Provider store={storeWithProfile(profile)}>
      <ProfileThreadTrackingMarkerOverview
        className="profileThreadTrackingMarkerOverview"
        rangeStart={0}
        rangeEnd={15}
        threadIndex={0}
        onSelect={() => {}}
        isModifyingSelection={false}
      />
    </Provider>,
    { createNodeMock }
  );

  // Flush any requestAnimationFrames.
  jest.runAllTimers();

  const tree = overview.toJSON();
  const drawCalls = ctx.__flushDrawLog();

  expect(tree).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  delete window.requestAnimationFrame;
  delete window.devicePixelRatio;
});
