/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import Markers from '../../components/marker-table';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/make-profile';
import { getBoundingBox } from '../fixtures/utils';

describe('MarkerTable', function() {
  it('renders some basic markers', () => {
    // These were all taken from real-world values.
    const profile = getProfileWithMarkers(
      [
        [
          'DOMEvent',
          10.5,
          {
            type: 'DOMEvent',
            startTime: 10.5,
            endTime: 11.3,
            eventType: 'commandupdate',
            phase: 2,
          },
        ],
        [
          'UserTiming',
          12.5,
          {
            type: 'UserTiming',
            startTime: 12.5,
            endTime: 12.5,
            name: 'foobar',
            entryType: 'mark',
          },
        ],
        [
          'NotifyDidPaint',
          14.5,
          {
            type: 'tracing',
            startTime: 14.5,
            endTime: 14.5,
            category: 'Paint',
            interval: 'start',
            name: 'NotifyDidPaint',
          },
        ],
      ]
        // Sort the markers.
        .sort((a, b) => a[1] - b[1])
    );

    const markers = renderer.create(
      <Provider store={storeWithProfile(profile)}>
        <Markers />
      </Provider>,
      { createNodeMock }
    );

    expect(markers.toJSON()).toMatchSnapshot();
  });
});

/**
 * Mock out any created refs for the call tree components with relevant information.
 */
function createNodeMock(element) {
  const classNameParts = element.props.className.split(' ');
  if (
    // <VirtualList />
    classNameParts.includes('treeViewBody') ||
    // <VirtualListInner />
    classNameParts.includes('treeViewBodyInner')
  ) {
    return {
      addEventListener: () => {},
      // Set an arbitrary size that will not kick in any virtualization behavior.
      getBoundingClientRect: () => getBoundingBox(2000, 1000),
      focus: () => {},
    };
  }
  return null;
}
