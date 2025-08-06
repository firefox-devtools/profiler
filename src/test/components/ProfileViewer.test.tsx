/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { ProfileViewer } from 'firefox-profiler/components/app/ProfileViewer';
import { getTimelineHeight } from 'firefox-profiler/selectors/app';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { viewProfile } from 'firefox-profiler/actions/receive-profile';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';

import { blankStore } from '../fixtures/stores';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import {
  autoMockElementSize,
  getElementWithFixedSize,
} from '../fixtures/mocks/element-size';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

describe('ProfileViewer', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: 200, height: 300 });
  autoMockIntersectionObserver();

  beforeEach(() => {
    jest
      .spyOn(ReactDOM, 'findDOMNode')
      .mockImplementation(() =>
        getElementWithFixedSize({ width: 300, height: 300 })
      );
  });

  function setup() {
    // WithSize uses requestAnimationFrame
    const flushRafCalls = mockRaf();

    const store = blankStore();
    store.dispatch(
      updateUrlState(
        stateFromLocation({
          pathname: '/from-browser',
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
    expect(getTimelineHeight(getState())).toBe(1224);
  });
});
