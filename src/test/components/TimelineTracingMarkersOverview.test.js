/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { TimelineTracingMarkersOverview } from '../../components/timeline/TracingMarkers';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/make-profile';
import ReactDOM from 'react-dom';
import { getBoundingBox } from '../fixtures/utils';
import mockRaf from '../fixtures/mocks/request-animation-frame';

describe('TimelineTracingMarkersOverview', function() {
  beforeEach(() => {
    jest.spyOn(ReactDOM, 'findDOMNode').mockImplementation(() => {
      // findDOMNode uses nominal typing instead of structural (null | Element | Text), so
      // opt out of the type checker for this mock by returning `any`.
      const mockEl = ({
        getBoundingClientRect: () => getBoundingBox(200, 300),
      }: any);
      return mockEl;
    });
  });

  it('renders correctly', () => {
    const flushRafCalls = mockRaf();
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
      [
        'BHR-detected hang',
        5,
        { type: 'BHR-detected hang', startTime: 2, endTime: 13 },
      ],
      [
        'LongTask',
        6,
        {
          type: 'MainThreadLongTask',
          category: 'LongTask',
          startTime: 2,
          endTime: 6,
        },
      ],
      [
        'LongIdleTask',
        8,
        {
          type: 'MainThreadLongTask',
          category: 'LongTask',
          startTime: 6,
          endTime: 8,
        },
      ],
    ]);

    const overview = renderer.create(
      <Provider store={storeWithProfile(profile)}>
        <TimelineTracingMarkersOverview
          className="timelineTracingMarkersOverview"
          rangeStart={0}
          rangeEnd={15}
          threadIndex={0}
          onSelect={() => {}}
        />
      </Provider>,
      { createNodeMock }
    );

    // We need to flush twice since when the first flush is run, it
    // will request more code to be run in later animation frames.
    flushRafCalls();
    flushRafCalls();

    const tree = overview.toJSON();
    const drawCalls = ctx.__flushDrawLog();

    expect(tree).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    delete window.devicePixelRatio;
  });
});
