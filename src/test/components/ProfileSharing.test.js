/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ProfileSharing from '../../components/app/ProfileSharing';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import {
  startSymbolicating,
  doneSymbolicating,
} from '../../actions/receive-profile';

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

    const store = storeWithProfile();
    store.dispatch(startSymbolicating());

    const profileSharing = renderer.create(
      <Provider store={store}>
        <ProfileSharing />
      </Provider>,
      { createNodeMock }
    );

    expect(profileSharing).toMatchSnapshot();

    store.dispatch(doneSymbolicating());
    expect(profileSharing).toMatchSnapshot();
  });
});
