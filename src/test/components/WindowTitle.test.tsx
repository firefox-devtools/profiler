/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { WindowTitle } from 'firefox-profiler/components/app/WindowTitle';
import {
  getEmptyProfile,
  getEmptyThread,
} from 'firefox-profiler/profile-logic/data-structures';
import {
  changeProfileName,
  setDataSource,
} from 'firefox-profiler/actions/profile-view';
import * as ZippedProfilesActions from 'firefox-profiler/actions/zipped-profiles';

import { storeWithProfile, blankStore } from '../fixtures/stores';
import { storeWithZipFile } from '../fixtures/profiles/zip-file';

describe('WindowTitle', () => {
  it('shows basic window title', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    const store = storeWithProfile(profile);
    store.dispatch(setDataSource('from-url'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('Firefox – Firefox Profiler');
  });

  it('shows the profiler startTime in the window title if it is available', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    Object.assign(profile.meta, {
      startTime: new Date('5 Nov 2024 13:00 UTC').getTime(),
    });
    const store = storeWithProfile(profile);
    store.dispatch(setDataSource('from-url'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe(
      'Firefox – 11/5/2024, 1:00:00 PM UTC – Firefox Profiler'
    );
  });

  it('shows the profiler startTime with public annotation in the window title if it is available', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    Object.assign(profile.meta, {
      startTime: new Date('5 Nov 2024 13:00 UTC').getTime(),
    });
    const store = storeWithProfile(profile);
    store.dispatch(setDataSource('public'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe(
      'Firefox – 11/5/2024, 1:00:00 PM UTC (public) – Firefox Profiler'
    );
  });

  it('shows the public annotation without startTime in the window title', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    const store = storeWithProfile(profile);
    store.dispatch(setDataSource('public'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('Firefox (public) – Firefox Profiler');
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
    store.dispatch(setDataSource('from-url'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('Firefox – macOS 10.14 – Firefox Profiler');
  });

  it('shows platform details with the start time in the window title if it is available', () => {
    const profile = getEmptyProfile();
    profile.threads.push(getEmptyThread());
    Object.assign(profile.meta, {
      oscpu: 'Intel Mac OS X 10.14',
      platform: 'Macintosh',
      toolkit: 'cocoa',
      startTime: new Date('5 Nov 2024 13:00 UTC').getTime(),
    });
    const store = storeWithProfile(profile);
    store.dispatch(setDataSource('from-url'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe(
      'Firefox – macOS 10.14 – 11/5/2024, 1:00:00 PM UTC – Firefox Profiler'
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
    store.dispatch(setDataSource('from-url'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('good profile – Firefox Profiler');

    act(() => {
      store.dispatch(changeProfileName('awesome profile'));
    });
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
    store.dispatch(setDataSource('from-url'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('Firefox Profiler');
  });

  it('shows the correct title for uploaded recordings', () => {
    const store = blankStore();
    store.dispatch(setDataSource('uploaded-recordings'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('Uploaded Recordings – Firefox Profiler');
  });

  it('shows the correct title for the compare view', () => {
    // In this test we check that the title updates when navigating in the app.
    const store = blankStore();
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('Firefox Profiler');

    act(() => {
      store.dispatch(setDataSource('compare'));
    });

    expect(document.title).toBe('Compare Profiles – Firefox Profiler');
  });

  it("shows a title when a profile isn't loaded yet", () => {
    const store = blankStore();
    store.dispatch(setDataSource('from-url'));
    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('Firefox Profiler');
  });

  it('shows the file name when viewing a file from a zip file', async () => {
    const { store } = await storeWithZipFile([
      'foo/bar/profile1.json',
      'foo/profile2.json',
      'baz/profile3.json',
    ]);

    store.dispatch(setDataSource('from-url'));

    render(
      <Provider store={store}>
        <WindowTitle />
      </Provider>
    );

    expect(document.title).toBe('Archive Contents – Firefox Profiler');

    await act(() =>
      store.dispatch(
        ZippedProfilesActions.viewProfileFromPathInZipFile(
          'foo/bar/profile1.json'
        )
      )
    );

    expect(document.title).toBe(
      'bar/profile1.json – Firefox – Firefox Profiler'
    );
  });
});
