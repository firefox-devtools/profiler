/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import ProfileSharing from '../../components/app/ProfileSharing';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';

describe('app/ProfileSharing', function() {
  it('renders the ProfileSharing buttons', () => {
    /**
     * Mock out any created refs for the components with relevant information.
     */
    function createNodeMock(element) {
      if (element.type === 'input') {
        return {
          focus() {},
          select() {},
          blur() {},
        };
      }
      return null;
    }

    const profileSharing = renderer.create(
      <Provider store={storeWithProfile()}>
        <ProfileSharing />
      </Provider>,
      { createNodeMock }
    );

    expect(profileSharing).toMatchSnapshot();
  });
});
