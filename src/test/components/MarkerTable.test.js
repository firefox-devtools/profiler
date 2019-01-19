/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import Markers from '../../components/marker-table';
import { render } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import { getBoundingBox } from '../fixtures/utils';

describe('MarkerTable', function() {
  it('renders some basic markers', () => {
    // Set an arbitrary size that will not kick in any virtualization behavior.
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(2000, 1000));

    // These were all taken from real-world values.
    const profile = getProfileWithMarkers(
      [
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
            category: 'Paint',
            interval: 'start',
          },
        ],
      ]
        // Sort the markers.
        .sort((a, b) => a[1] - b[1])
    );

    const { container } = render(
      <Provider store={storeWithProfile(profile)}>
        <Markers />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
