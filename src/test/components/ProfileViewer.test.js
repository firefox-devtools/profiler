/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import ReactDOM from 'react-dom';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';

import { ProfileViewer } from 'firefox-profiler/components/app/ProfileViewer';
import { getTimelineHeight } from 'firefox-profiler/selectors/app';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { viewProfile } from 'firefox-profiler/actions/receive-profile';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';

import { blankStore } from '../fixtures/stores';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { getBoundingBox } from '../fixtures/utils';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
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

  function setup() {
    // WithSize uses requestAnimationFrame
    const flushRafCalls = mockRaf();

    const store = blankStore();
    store.dispatch(
      updateUrlState(
        stateFromLocation({
          pathname: '/from-addon',
          search: '',
          hash: '',
        })
      )
    );
    store.dispatch(viewProfile(getProfileWithNiceTracks()));

    const renderResult = render(
      <Provider store={store}>
        <ProfileViewer />
      </Provider>
    );

    // Flushing the requestAnimationFrame calls so we can see the actual height of tracks.
    flushRafCalls();

    return { ...renderResult, ...store };
  }

  it('calculates the full timeline height correctly', () => {
    const { getState } = setup();

    // Note: You should update this total height if you changed the height calculation algorithm.
    expect(getTimelineHeight(getState())).toBe(1250);
  });
});
