/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import ReactDOM from 'react-dom';
import { ProfileViewer } from '../../components/app/ProfileViewer';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { getBoundingBox } from '../fixtures/utils';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { getTimelineHeight } from '../../selectors/app';
import mockRaf from '../fixtures/mocks/request-animation-frame';

describe('ProfileViewer', function() {
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

    const ctx = mockCanvasContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);
  });

  it('calculates the full timeline height correctly', () => {
    // WithSize uses requestAnimationFrame
    const flushRafCalls = mockRaf();
    const store = storeWithProfile(getProfileWithNiceTracks());

    render(
      <Provider store={store}>
        <ProfileViewer />
      </Provider>
    );

    // Flushing the requestAnimationFrame calls so we can see the actual height of tracks.
    flushRafCalls();

    // Note: You should update this total height if you changed the height calculation algorithm.
    expect(getTimelineHeight(store.getState())).toBe(1250);
  });
});
