/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// We want to test these components in isolation and tightly control the actions
// dispatched and avoid any side-effects.  That's why we mock this module and
// return dummy thunk actions that return a Promise.
jest.mock('../../actions/receive-profile', () => ({
  // These mocks will get their implementation in the `setup` function.
  // Otherwise the implementation is wiped before the test starts.
  // See https://github.com/facebook/jest/issues/7573 for more info.
  retrieveProfileFromAddon: jest.fn(),
  retrieveProfileFromStore: jest.fn(),
  retrieveProfilesToCompare: jest.fn(),
}));

// We mock <ProfileViewer> because it's complex and we should really test it
// elsewhere. Using a custom name makes it possible to test that  _this_
// component is used.
jest.mock('../../components/app/ProfileViewer', () => ({
  ProfileViewer: 'profile-viewer',
}));
// We mock <Home> as well because it brings too much noise in snapshots and it's
// overly tested in another test file.
jest.mock('../../components/app/Home', () => ({
  Home: 'home',
}));
jest.mock('../../components/app/CompareHome', () => ({
  CompareHome: 'compare-home',
}));
// ListOfPublishedProfiles depends on IDB and renders asynchronously, so we'll
// just test we want to render it, but otherwise test it more fully in a
// separate test file.
jest.mock('../../components/app/ListOfPublishedProfiles', () => ({
  ListOfPublishedProfiles: 'list-of-published-profiles',
}));

import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';

import { AppViewRouter } from '../../components/app/AppViewRouter';
import { ProfileLoader } from '../../components/app/ProfileLoader';
import { updateUrlState, changeProfilesToCompare } from '../../actions/app';
import { fatalError } from '../../actions/errors';

// Because this module is mocked but we want the real actions in the test, we
// use `jest.requireActual` here.
const {
  temporaryError,
  viewProfile,
  waitingForProfileFromAddon,
  waitingForProfileFromStore,
} = jest.requireActual('../../actions/receive-profile');
// These functions are mocks
import {
  retrieveProfileFromStore,
  retrieveProfileFromAddon,
  retrieveProfilesToCompare,
} from '../../actions/receive-profile';
import { stateFromLocation } from '../../app-logic/url-handling';
import { TemporaryError } from '../../utils/errors';

import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

describe('app/AppViewRouter', function() {
  it('renders an initial home', function() {
    const { container } = setup();

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the addon loading page, and the profile view after capturing', function() {
    const { container, dispatch, navigateToAddonLoadingPage } = setup();

    navigateToAddonLoadingPage();
    dispatch(waitingForProfileFromAddon());
    expect(container.firstChild).toMatchSnapshot();
    expect(retrieveProfileFromAddon).toBeCalled();

    const { profile } = getProfileFromTextSamples(`A`);
    dispatch(viewProfile(profile));
    expect(container.firstChild).toMatchSnapshot();
  });

  it('does not try to retrieve a profile when moving from from-addon to public', function() {
    const {
      container,
      dispatch,
      navigateToAddonLoadingPage,
      navigateToStoreLoadingPage,
    } = setup();

    navigateToAddonLoadingPage();
    dispatch(waitingForProfileFromAddon());
    const { profile } = getProfileFromTextSamples(`A`);
    dispatch(viewProfile(profile));

    navigateToStoreLoadingPage();
    expect(container.firstChild).toMatchSnapshot();
    expect(retrieveProfileFromStore).not.toBeCalled();
  });

  it('renders the profile view', function() {
    const { container, dispatch, navigateToStoreLoadingPage } = setup();

    navigateToStoreLoadingPage();
    dispatch(waitingForProfileFromStore());
    expect(container.firstChild).toMatchSnapshot();
    expect(retrieveProfileFromStore).toBeCalledWith('ThisIsAFakeHash');

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

  it('renders a compare home when navigating to /compare/, then loads when changing profiles', () => {
    const { container, dispatch, navigateToCompareHome } = setup();

    navigateToCompareHome();
    expect(container.querySelector('compare-home')).toBeTruthy();

    const url1 = 'http://fake-url.com/hash/1';
    const url2 = 'http://fake-url.com/hash/2';
    dispatch(changeProfilesToCompare([url1, url2]));

    expect(container.querySelector('.loading')).toBeTruthy();
    expect(retrieveProfilesToCompare).toHaveBeenCalledWith([url1, url2]);
  });

  it('renders a uploaded-recordings page when navigating to /uploaded-recordings', () => {
    const { container, navigateToMyProfiles } = setup();
    navigateToMyProfiles();
    expect(container.querySelector('list-of-published-profiles')).toBeTruthy();
  });
});

function setup() {
  // Let's silence the error output to the console
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // Flow doesn't know these actions are jest mocks.
  (retrieveProfileFromAddon: any).mockImplementation(() => async () => {});
  (retrieveProfileFromStore: any).mockImplementation(() => async () => {});
  (retrieveProfilesToCompare: any).mockImplementation(() => async () => {});

  const store = blankStore();
  const renderResult = render(
    <Provider store={store}>
      <>
        <ProfileLoader />
        <AppViewRouter />
      </>
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

  function navigateToCompareHome() {
    const newUrlState = stateFromLocation({
      pathname: '/compare/',
      hash: '',
      search: '',
    });
    store.dispatch(updateUrlState(newUrlState));
  }

  function navigateToMyProfiles() {
    const newUrlState = stateFromLocation({
      pathname: '/uploaded-recordings/',
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
    navigateToCompareHome,
    navigateToMyProfiles,
  };
}
