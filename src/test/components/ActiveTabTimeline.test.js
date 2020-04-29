/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import ReactDOM from 'react-dom';
import Timeline from '../../components/timeline';
import { render } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { processProfile } from '../../profile-logic/process-profile';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { changeViewAndRecomputeProfileData } from '../../actions/receive-profile';
import { getBoundingBox } from '../fixtures/utils';

describe('ActiveTabTimeline', function() {
  const browsingContextID = 123123;
  beforeEach(() => {
    jest.spyOn(ReactDOM, 'findDOMNode').mockImplementation(() => {
      // findDOMNode uses nominal typing instead of structural (null | Element | Text), so
      // opt out of the type checker for this mock by returning `any`.
      const mockEl = ({
        getBoundingClientRect: () => getBoundingBox(300, 300),
      }: any);
      return mockEl;
    });

    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(200, 300));
  });

  it('should be rendered properly from the Timeline component', () => {
    const profile = processProfile(createGeckoProfile());
    const store = storeWithProfile(profile);
    store.dispatch(changeViewAndRecomputeProfileData(browsingContextID));

    const { container } = render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
