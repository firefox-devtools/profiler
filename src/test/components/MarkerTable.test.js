/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render } from 'react-testing-library';
import { Provider } from 'react-redux';

import MarkerTable from '../../components/marker-table';
import { updatePreviewSelection } from '../../actions/profile-view';

import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import { getBoundingBox } from '../fixtures/utils';

describe('MarkerTable', function() {
  function setup() {
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
        [
          'setTimeout',
          165.87091900000001,
          {
            type: 'Text',
            startTime: 165.87091900000001,
            endTime: 165.871503,
            name: '5.5',
          },
        ],
      ]
        // Sort the markers.
        .sort((a, b) => a[1] - b[1])
    );

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <MarkerTable />
      </Provider>
    );
    const { container } = renderResult;

    const fixedRows = () =>
      Array.from(container.querySelectorAll('.treeViewRowFixedColumns'));
    const scrolledRows = () =>
      Array.from(container.querySelectorAll('.treeViewRowScrolledColumns'));

    return {
      ...renderResult,
      ...store,
      fixedRows,
      scrolledRows,
    };
  }

  it('renders some basic markers and updates when needed', () => {
    const { container, fixedRows, scrolledRows, dispatch } = setup();

    expect(fixedRows()).toHaveLength(3);
    expect(scrolledRows()).toHaveLength(3);
    expect(container.firstChild).toMatchSnapshot();

    /* Check that the table updates properly despite the memoisation. */
    dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 10,
        selectionEnd: 20,
      })
    );

    expect(fixedRows()).toHaveLength(2);
    expect(scrolledRows()).toHaveLength(2);
  });
});
