/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { BeforeUnloadManager } from '../../components/app/BeforeUnloadManager';
import { blankStore } from '../fixtures/stores';
import { uploadStarted } from 'firefox-profiler/actions/publish';
import { getUploadPhase } from '../../selectors/publish';

describe('app/BeforeUnloadManager', () => {
  function setup() {
    const store = blankStore();
    const { dispatch, getState } = store;

    const createBeforeUnloadManager = () =>
      render(
        <Provider store={store}>
          <BeforeUnloadManager />
        </Provider>
      );
    return { dispatch, getState, createBeforeUnloadManager };
  }

  it('Prevents default beforeunload behaviour', () => {
    const { dispatch, getState, createBeforeUnloadManager } = setup();
    createBeforeUnloadManager();

    // simulate profile upload phase
    act(() => {
      dispatch(uploadStarted());
    });
    expect(getUploadPhase(getState())).toBe('uploading');

    const event = new Event('beforeunload');

    /* Because of the current jsdom implementation, we need to mock
       preventDefault(). To prevent a Flow error when assigning jest.fn()
       to event.preventDefault (not writeable), we add the following line.
    */
    // $FlowExpectError
    event.preventDefault = jest.fn();

    fireEvent(window as any, event);
    expect((event as any).returnValue).toBeTruthy();
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
