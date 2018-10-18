/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// We want to test these components in isolation and tightly control the actions
// dispatched and avoid any side-effects.  That's why we mock this module and
// return dummy actions.
jest.mock('../../actions/receive-profile', () => ({
  retrieveProfileFromAddon: () => ({ type: 'DUMMY_ACTION' }),
  retrieveProfileFromStore: () => ({ type: 'DUMMY_ACTION' }),
}));

import * as React from 'react';

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

import { shallowWithStore } from '../fixtures/enzyme';
import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

describe('app/ProfileViewWhenReady', function() {
  it('renders an initial home', function() {
    const { view } = setup();

    // dive() will shallow-render the wrapped component
    expect(view.dive()).toMatchSnapshot();
  });

  it('renders the addon loading page', function() {
    const { view, dispatch, navigateToAddonLoadingPage } = setup();

    navigateToAddonLoadingPage();
    dispatch(waitingForProfileFromAddon());
    expect(view.dive()).toMatchSnapshot();
  });

  it('renders the profile view', function() {
    const { view, dispatch, navigateToStoreLoadingPage } = setup();

    navigateToStoreLoadingPage();
    dispatch(waitingForProfileFromStore());
    expect(view.dive()).toMatchSnapshot();

    const { profile } = getProfileFromTextSamples(`A`);
    dispatch(viewProfile(profile));
    expect(view.dive()).toMatchSnapshot();
  });

  it('renders temporary errors', function() {
    const { view, dispatch, navigateToStoreLoadingPage } = setup();

    navigateToStoreLoadingPage();
    dispatch(
      temporaryError(
        new TemporaryError('This is a temporary error, wait a bit more.', {
          count: 3,
          total: 10,
        })
      )
    );
    expect(view.dive()).toMatchSnapshot();
  });

  it('renders an home when the user pressed back after an error', function() {
    const {
      view,
      dispatch,
      navigateToStoreLoadingPage,
      navigateBackToHome,
    } = setup();

    navigateToStoreLoadingPage();
    dispatch(fatalError(new Error('Error while loading profile')));
    expect(view.dive()).toMatchSnapshot();
    expect(console.error).toHaveBeenCalled();

    navigateBackToHome();
    expect(view.dive()).toMatchSnapshot();
  });
});

function setup() {
  // Let's silence the error output to the console
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const store = blankStore();
  const view = shallowWithStore(<ProfileViewWhenReady />, store);

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
    view,
    dispatch: store.dispatch,
    navigateToStoreLoadingPage,
    navigateToAddonLoadingPage,
    navigateBackToHome,
  };
}
