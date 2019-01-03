/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// We want to test these components in isolation and tightly control the actions
// dispatched and avoid any side-effects.  That's why we mock this module and
// return dummy thunk actions that return a Promise.
jest.mock('../../actions/receive-profile', () => ({
  retrieveProfileFromAddon: () => async () => {},
  retrieveProfileFromStore: () => async () => {},
}));

// We mock <ProfileViewer> because it's complex and we should really test it
// elsewhere. Using a custom name makes it possible to test that  _this_
// component is used.
jest.mock('../../components/app/ProfileViewer', () => 'profile-viewer');
// We mock <Home> as well because it brings too much noise in snapshots and it's
// overly tested in another test file.
jest.mock('../../components/app/Home', () => 'home');

import * as React from 'react';
import { Provider } from 'react-redux';
import { render, cleanup } from 'react-testing-library';

import { ProfileViewWhenReady } from '../../components/app/Root';
import { updateUrlState } from '../../actions/app';
// Because this module is mocked but we want the real actions in the test, we
// use `jest.requireActual` here.
const {
  fatalError,
  temporaryError,
  viewProfile,
  waitingForProfileFromAddon,
  waitingForProfileFromStore,
} = jest.requireActual('../../actions/receive-profile');
import { stateFromLocation } from '../../app-logic/url-handling';
import { TemporaryError } from '../../utils/errors';

import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

afterEach(cleanup);
describe('app/ProfileViewWhenReady', function() {
  it('renders an initial home', function() {
    const { container } = setup();

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the addon loading page', function() {
    const { container, dispatch, navigateToAddonLoadingPage } = setup();

    navigateToAddonLoadingPage();
    dispatch(waitingForProfileFromAddon());
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the profile view', function() {
    const { container, dispatch, navigateToStoreLoadingPage } = setup();

    navigateToStoreLoadingPage();
    dispatch(waitingForProfileFromStore());
    expect(container.firstChild).toMatchSnapshot();

    const { profile } = getProfileFromTextSamples(`A`);
    dispatch(viewProfile(profile));
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders temporary errors', function() {
    const { container, dispatch, navigateToStoreLoadingPage } = setup();

    navigateToStoreLoadingPage();
    dispatch(
      temporaryError(
        new TemporaryError('This is a temporary error, wait a bit more.', {
          count: 3,
          total: 10,
        })
      )
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders an home when the user pressed back after an error', function() {
    const {
      container,
      dispatch,
      navigateToStoreLoadingPage,
      navigateBackToHome,
    } = setup();

    navigateToStoreLoadingPage();
    dispatch(fatalError(new Error('Error while loading profile')));
    expect(container.firstChild).toMatchSnapshot();
    expect(console.error).toHaveBeenCalled();

    navigateBackToHome();
    expect(container.firstChild).toMatchSnapshot();
  });
});

function setup() {
  // Let's silence the error output to the console
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const store = blankStore();
  const renderResult = render(
    <Provider store={store}>
      <ProfileViewWhenReady />
    </Provider>
  );

  function navigateToStoreLoadingPage() {
    const newUrlState = stateFromLocation({
      pathname: '/public/ThisIsAFakeHash/calltree',
      search: '',
      hash: '',
    });
    store.dispatch(updateUrlState(newUrlState));
  }

  function navigateToAddonLoadingPage() {
    const newUrlState = stateFromLocation({
      pathname: '/from-addon/',
      search: '',
      hash: '',
    });
    store.dispatch(updateUrlState(newUrlState));
  }

  function navigateBackToHome() {
    const newUrlState = stateFromLocation({
      pathname: '/',
      hash: '',
      search: '',
    });
    store.dispatch(updateUrlState(newUrlState));
  }

  return {
    ...renderResult,
    dispatch: store.dispatch,
    navigateToStoreLoadingPage,
    navigateToAddonLoadingPage,
    navigateBackToHome,
  };
}
