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

  it('unfocuses the uncommited input field on selection move', () => {
    const { container } = setup();

    const selection = container.querySelector('.timelineSelection')!;

    jest.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      jest.fn(function () {
        return {
          item() {
            return { x: 0, y: 0, width: 100, height: 100 } as DOMRect;
          },
          length: 1,
          '0': { x: 0, y: 0, width: 100, height: 100 } as DOMRect,
          [Symbol.iterator]() {
            // The iterator is not used.
            // Defined here just to make the tsc happy.
            return {
              next() {
                return {
                  done: true,
                };
              },
            } as ArrayIterator<DOMRect>;
          },
        } as DOMRectList;
      })
    );

    fireEvent.mouseDown(selection, {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });

    fireEvent.mouseMove(selection, {
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 10,
    });

    fireEvent.mouseUp(selection, {
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 10,
    });

    const uncommittedItem = container.querySelector(
      '.filterNavigatorBarItemUncommittedFieldInput'
    )! as HTMLInputElement;
    expect(uncommittedItem.value).toBe('100μs');

    fireEvent.focus(uncommittedItem);

    fireEvent.change(uncommittedItem, {
      target: { value: '200us' },
    });
    expect(uncommittedItem.value).toBe('200us');

    const blur = jest.fn();
    jest.spyOn(HTMLElement.prototype, 'blur').mockImplementation(blur);

    fireEvent.mouseDown(selection, {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });

    fireEvent.mouseMove(selection, {
      button: 0,
      buttons: 1,
      clientX: 50,
      clientY: 10,
    });

    fireEvent.mouseUp(selection, {
      button: 0,
      buttons: 1,
      clientX: 50,
      clientY: 10,
    });

    // Due to the restriction on the mock, blur() call does not trigger
    // blur event.
    expect(blur).toHaveBeenCalled();
    fireEvent.blur(uncommittedItem);

    expect(uncommittedItem.value).toBe('400μs');

    fireEvent.focus(uncommittedItem);

    fireEvent.change(uncommittedItem, {
      target: { value: '200us' },
    });
    expect(uncommittedItem.value).toBe('200us');

    const grip = container.querySelector(
      '.timelineSelectionGrippyRangeStart'
    ) as HTMLElement;

    fireEvent.mouseDown(grip, {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });

    fireEvent.mouseMove(grip, {
      button: 0,
      buttons: 1,
      clientX: 50,
      clientY: 10,
    });

    fireEvent.mouseUp(grip, {
      button: 0,
      buttons: 1,
      clientX: 50,
      clientY: 10,
    });

    // Due to the restriction on the mock, blur() call does not trigger
    // blur event.
    expect(blur).toHaveBeenCalled();
    fireEvent.blur(uncommittedItem);

    expect(uncommittedItem.value).toBe('67μs');
  });
});
