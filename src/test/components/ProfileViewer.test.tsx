/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import {
  render,
  fireEvent,
} from 'firefox-profiler/test/fixtures/testing-library';
import { ProfileViewer } from 'firefox-profiler/components/app/ProfileViewer';
import { getTimelineHeight } from 'firefox-profiler/selectors/app';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { viewProfile } from 'firefox-profiler/actions/receive-profile';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';

import { blankStore } from '../fixtures/stores';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { getMarkerTableProfile } from '../fixtures/profiles/processed-profile';
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

  function setup(profile = getProfileWithNiceTracks()) {
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
    store.dispatch(viewProfile(profile));

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

  it('does not show a button to reset the zeroAt when not overridden', () => {
    const { container } = setup(getMarkerTableProfile());

    const button = container.querySelector(
      '.menuButtonsResetZeroAtButton'
    )! as HTMLElement;
    expect(button).toBeNull();
  });

  it('shows a button to reset the zeroAt when overridden', () => {
    const { container, getByText } = setup(getMarkerTableProfile());

    const tab = getByText('Marker Table');
    fireEvent.click(tab);

    const row1 = container.querySelector(
      '.treeViewRowFixedColumns:nth-child(1)'
    )! as HTMLElement;
    {
      const start = row1.querySelector('.start')! as HTMLElement;
      expect(start).toHaveTextContent('0s');
    }

    const row3 = container.querySelector(
      '.treeViewRowFixedColumns:nth-child(3)'
    )! as HTMLElement;
    {
      const start = row3.querySelector('.start')! as HTMLElement;
      expect(start).toHaveTextContent('0.108s');
    }

    // The following mousedown will trigger a warning due to the limitation
    // on the test env.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    fireEvent.mouseDown(row3, { button: 2 });

    const item = container.querySelector(
      '.markerContextMenuIconOverrideZeroAtMarkerStart'
    )! as HTMLElement;

    fireEvent.click(item);

    {
      const start = row1.querySelector('.start')! as HTMLElement;
      expect(start).toHaveTextContent('-0.108s');
    }
    {
      const start = row3.querySelector('.start')! as HTMLElement;
      expect(start).toHaveTextContent('0s');
    }

    // After overriding the zeroAt, the button should be shown.
    const button = container.querySelector(
      '.menuButtonsResetZeroAtButton'
    )! as HTMLElement;
    expect(button).toHaveTextContent('Starting point moved to ⁨107.50ms⁩');

    // Clicking the button should reset the override.
    fireEvent.click(button);

    const button2 = container.querySelector(
      '.menuButtonsResetZeroAtButton'
    )! as HTMLElement;
    expect(button2).toBeNull();

    {
      const start = row1.querySelector('.start')! as HTMLElement;
      expect(start).toHaveTextContent('0s');
    }
    {
      const start = row3.querySelector('.start')! as HTMLElement;
      expect(start).toHaveTextContent('0.108s');
    }
  });
});
