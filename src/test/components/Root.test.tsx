/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// We want to test these components in isolation and tightly control the actions
// dispatched and avoid any side-effects.  That's why we mock this module and
// return dummy thunk actions that return a Promise.
jest.mock('../../actions/receive-profile', () => ({
  // These mocks will get their implementation in the `setup` function.
  // Otherwise the implementation is wiped before the test starts.
  // See https://github.com/facebook/jest/issues/7573 for more info.
  retrieveProfileFromBrowser: jest.fn(),
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
import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { AppViewRouter } from '../../components/app/AppViewRouter';
import { ProfileLoader } from '../../components/app/ProfileLoader';
import { updateUrlState, changeProfilesToCompare } from '../../actions/app';
import { fatalError } from '../../actions/errors';

// Because this module is mocked but we want the real actions in the test, we
// use `jest.requireActual` here.
const {
  temporaryError,
  viewProfile,
  waitingForProfileFromBrowser,
  waitingForProfileFromStore,
} = jest.requireActual('../../actions/receive-profile');
// These functions are mocks
import {
  retrieveProfileFromStore,
  retrieveProfileFromBrowser,
  retrieveProfilesToCompare,
} from '../../actions/receive-profile';
import { stateFromLocation } from '../../app-logic/url-handling';
import { TemporaryError } from '../../utils/errors';

import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import type { Action } from 'firefox-profiler/types';

describe('app/AppViewRouter', function () {
  it('renders an initial home', function () {
    const { container } = setup();

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the addon loading page, and the profile view after capturing', function () {
    const { container, dispatch, navigateToFromBrowserProfileLoadingPage } =
      setup();

    navigateToFromBrowserProfileLoadingPage();
    dispatch(waitingForProfileFromBrowser());
    expect(container.firstChild).toMatchSnapshot();
    // We do not check that retrieveProfileFromBrowser gets called, because the call
    // happens asynchronously.

    const { profile } = getProfileFromTextSamples(`A`);
    dispatch(viewProfile(profile));
    expect(container.firstChild).toMatchSnapshot();
  });

  it('does not try to retrieve a profile when moving from from-browser to public', function () {
    const {
      container,
      dispatch,
      navigateToFromBrowserProfileLoadingPage,
      navigateToStoreLoadingPage,
    } = setup();

    navigateToFromBrowserProfileLoadingPage();
    dispatch(waitingForProfileFromBrowser());
    const { profile } = getProfileFromTextSamples(`A`);
    dispatch(viewProfile(profile));

    navigateToStoreLoadingPage();
    expect(container.firstChild).toMatchSnapshot();
    expect(retrieveProfileFromStore).not.toHaveBeenCalled();
  });

  it('renders the profile view', function () {
    const { container, dispatch, navigateToStoreLoadingPage } = setup();

    navigateToStoreLoadingPage();
    dispatch(waitingForProfileFromStore());
    expect(container.firstChild).toMatchSnapshot();
    expect(retrieveProfileFromStore).toHaveBeenCalledWith('ThisIsAFakeHash');

    const { profile } = getProfileFromTextSamples(`A`);
    dispatch(viewProfile(profile));
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders temporary errors', function () {
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

  it('renders an home when the user pressed back after an error', function () {
    const {
      container,
      dispatch,
      navigateToFromFileProfileLoadingPage,
      navigateBackToHome,
    } = setup();

    navigateToFromFileProfileLoadingPage();
    dispatch(fatalError(new Error('Error while loading profile')));
    expect(container.firstChild).toMatchSnapshot();
    expect(console.error).toHaveBeenCalled();

    navigateBackToHome();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('does not render back home link when not opened with from-file', function () {
    const {
      container,
      dispatch,
      navigateToStoreLoadingPage,
    } = setup();

    navigateToStoreLoadingPage();
    dispatch(fatalError(new Error('Error while loading profile')));
    expect(container.firstChild).toMatchSnapshot();
    expect(console.error).toHaveBeenCalled();
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
  (retrieveProfileFromBrowser as any).mockImplementation(() => async () => {});
  (retrieveProfileFromStore as any).mockImplementation(() => async () => {});
  (retrieveProfilesToCompare as any).mockImplementation(() => async () => {});

  const store = blankStore();
  const renderResult = render(
    <Provider store={store}>
      <>
        <ProfileLoader />
        <AppViewRouter />
      </>
    </Provider>
  );

  function actAndDispatch(what: Action) {
    act(() => {
      store.dispatch(what);
    });
  }

  function navigateToStoreLoadingPage() {
    const newUrlState = stateFromLocation({
      pathname: '/public/ThisIsAFakeHash/calltree',
      search: '',
      hash: '',
    });
    actAndDispatch(updateUrlState(newUrlState));
  }

  function navigateToFromBrowserProfileLoadingPage() {
    const newUrlState = stateFromLocation({
      pathname: '/from-browser/',
      search: '',
      hash: '',
    });
    actAndDispatch(updateUrlState(newUrlState));
  }

  function navigateToFromFileProfileLoadingPage() {
    const newUrlState = stateFromLocation({
      pathname: '/from-file/calltree',
      search: '',
      hash: '',
    });
    actAndDispatch(updateUrlState(newUrlState));
  }

  function navigateBackToHome() {
    const newUrlState = stateFromLocation({
      pathname: '/',
      hash: '',
      search: '',
    });
    actAndDispatch(updateUrlState(newUrlState));
  }

  function navigateToCompareHome() {
    const newUrlState = stateFromLocation({
      pathname: '/compare/',
      hash: '',
      search: '',
    });
    actAndDispatch(updateUrlState(newUrlState));
  }

  function navigateToMyProfiles() {
    const newUrlState = stateFromLocation({
      pathname: '/uploaded-recordings/',
      hash: '',
      search: '',
    });
    actAndDispatch(updateUrlState(newUrlState));
  }

  return {
    ...renderResult,
    dispatch: actAndDispatch,
    navigateToStoreLoadingPage,
    navigateToFromBrowserProfileLoadingPage,
    navigateToFromFileProfileLoadingPage,
    navigateBackToHome,
    navigateToCompareHome,
    navigateToMyProfiles,
  };
}
