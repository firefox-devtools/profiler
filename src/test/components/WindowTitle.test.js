/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';

import { WindowTitle } from '../../components/shared/WindowTitle';
import {
  getEmptyProfile,
  getEmptyThread,
} from '../../profile-logic/data-structures';
import { storeWithProfile } from '../fixtures/stores';
import { changeProfileName } from '../../actions/profile-view';

describe('WindowTitle', () => {
  it('shows basic window title', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe(
      'Firefox – 1/1/1970, 12:00:00 AM UTC – Firefox Profiler'
    );
  });

  it('shows platform details in the window title if it is available', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    Object.assign(profile.meta, {
      oscpu: 'Intel Mac OS X 10.14',
      platform: 'Macintosh',
      toolkit: 'cocoa',
    });
    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe(
      'Firefox – macOS 10.14 – 1/1/1970, 12:00:00 AM UTC – Firefox Profiler'
    );
  });

  it('shows profile name in the window title if it is available', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    Object.assign(profile.meta, {
      oscpu: 'Intel Mac OS X 10.14',
      platform: 'Macintosh',
      toolkit: 'cocoa',
    });
    const store = storeWithProfile(profile);
    store.dispatch(changeProfileName('good profile'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('good profile – Firefox Profiler');

    store.dispatch(changeProfileName('awesome profile'));
    expect(document.title).toBe('awesome profile – Firefox Profiler');
  });

  it('shows profile name when formatedmetastring is empty null', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    Object.assign(profile.meta, {
      oscpu: '',
      platform: '',
      toolkit: '',
      product: '',
    });
    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('1/1/1970, 12:00:00 AM UTC – Firefox Profiler');
  });
});
