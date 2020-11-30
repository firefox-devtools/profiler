/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { BeforeUnloadManager } from '../../components/app/BeforeUnloadManager';
import { blankStore } from '../fixtures/stores';
import { Provider } from 'react-redux';
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
    dispatch(uploadStarted());
    expect(getUploadPhase(getState())).toBe('uploading');

    const event = new Event('beforeunload');

    /* Because of the current jsdom implementation, we need to mock
       preventDefault(). To prevent a Flow error when assigning jest.fn()
       to event.preventDefault (not writeable), we add the following line.
    */
    // $FlowExpectError
    event.preventDefault = jest.fn();

    fireEvent((window: any), event);
    expect((event: any).returnValue).toBeTruthy();
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
