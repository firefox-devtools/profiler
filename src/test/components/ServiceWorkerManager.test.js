/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';
import serviceWorkerRuntime from 'offline-plugin/runtime';

import { ServiceWorkerManager } from '../../components/app/ServiceWorkerManager';
import { stateFromLocation } from '../../app-logic/url-handling';
import { updateUrlState } from '../../actions/app';
import {
  viewProfile,
  startSymbolicating,
  doneSymbolicating,
} from '../../actions/receive-profile';
import { fatalError } from '../../actions/errors';

import { ensureExists } from '../../utils/flow';

import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { fireFullClick } from '../fixtures/utils';

// Mock the offline plugin library.
jest.mock('offline-plugin/runtime', () => ({
  install: jest.fn(),
  applyUpdate: jest.fn(),
}));

function _getSimpleProfile() {
  return getProfileFromTextSamples('A').profile;
}

describe('app/ServiceWorkerManager', () => {
  // Opt out of Flow checking for this variable because we're doing
  // unconventional things with it.
  let nativeLocation: any;
  beforeEach(() => {
    // Because of how window.location is implemented in browsers and jsdom, we
    // can't easily spy on `window.location.reload`. That's why we replace the
    // full property 'location' instead.

    nativeLocation = Object.getOwnPropertyDescriptor(window, 'location');

    // It seems node v8 doesn't let us change the value unless we delete it before.
    delete window.location;
    // $FlowExpectError because the value we pass isn't a proper Location object.
    Object.defineProperty(window, 'location', {
      value: { reload: jest.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = 'development';

    Object.defineProperty(window, 'location', nativeLocation);
    nativeLocation = null;
  });

  function setup() {
    jest.spyOn(console, 'log').mockImplementation(() => {});

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

    function navigateToFileLoadingPage() {
      const newUrlState = stateFromLocation({
        pathname: '/from-file/',
        search: '',
        hash: '',
      });
      store.dispatch(updateUrlState(newUrlState));
    }

    const store = blankStore();

    const renderResult = render(
      <Provider store={store}>
        <ServiceWorkerManager />
      </Provider>
    );

    const { getByText, getByLabelText } = renderResult;

    return {
      ...renderResult,
      getReloadButton: () => getByText(/reload/i),
      getCloseButton: () => getByLabelText(/hide/i),
      navigateToStoreLoadingPage,
      navigateToAddonLoadingPage,
      navigateToFileLoadingPage,
      dispatch: store.dispatch,
    };
  }

  it('does not register a service worker in the development environment', () => {
    setup();
    expect(serviceWorkerRuntime.install).not.toHaveBeenCalled();
  });

  describe('in the home, with the `none` datasource', () => {
    it('shows a notice when the SW is updated, and the user can close it', () => {
      process.env.NODE_ENV = 'production';

      const { container, getCloseButton, getReloadButton } = setup();

      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      // There's a new update!
      installOptions.onUpdateReady();

      expect(getReloadButton()).toHaveTextContent('Apply and reload');
      expect(container.firstChild).toMatchSnapshot();

      // Some other tab applied the update before we had the chance.
      installOptions.onUpdated();
      expect(console.log).toHaveBeenCalled();
      expect(getReloadButton()).toHaveTextContent('Reload the application');
      expect(container.firstChild).toMatchSnapshot();

      // Let's hide the notice.
      fireFullClick(getCloseButton());
      expect(container).toBeEmptyDOMElement();

      // But getting a new update should display the notice again.
      installOptions.onUpdateReady();
      expect(container.firstChild).toMatchSnapshot();

      // Until now, we didn't try to update from this tab.
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();

      // But let's do it now.
      const reloadButton = getReloadButton();
      fireFullClick(reloadButton);

      expect(serviceWorkerRuntime.applyUpdate).toHaveBeenCalled();
      expect(reloadButton).toHaveTextContent('Installing…');

      // And we should now reload automatically when the SW is fully updated.
      installOptions.onUpdated();
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('with the `public` datasource', () => {
    it(`doesn't show a notice until a profile is fully loaded`, async () => {
      process.env.NODE_ENV = 'production';

      const { navigateToStoreLoadingPage, container, dispatch } = setup();

      navigateToStoreLoadingPage();

      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      installOptions.onUpdateReady();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      await dispatch(viewProfile(_getSimpleProfile()));
      expect(container).not.toBeEmptyDOMElement();
    });

    it(`doesn't show a notice until we're done symbolicating`, async () => {
      process.env.NODE_ENV = 'production';

      const { navigateToStoreLoadingPage, dispatch, container } = setup();

      navigateToStoreLoadingPage();
      await dispatch(viewProfile(_getSimpleProfile()));
      dispatch(startSymbolicating());

      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      installOptions.onUpdateReady();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      dispatch(doneSymbolicating());
      expect(container).not.toBeEmptyDOMElement();
    });

    it('shows a warning notice if the SW was updated before we were ready', async () => {
      process.env.NODE_ENV = 'production';

      const {
        navigateToStoreLoadingPage,
        queryByText,
        getReloadButton,
        dispatch,
        container,
      } = setup();

      navigateToStoreLoadingPage();
      await dispatch(viewProfile(_getSimpleProfile()));
      dispatch(startSymbolicating());

      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      installOptions.onUpdateReady();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      // Some other tabs updated the SW.
      installOptions.onUpdated();
      expect(
        ensureExists(container.querySelector('.photon-message-bar')).className
      ).toMatch(/\bphoton-message-bar-warning\b/);
      expect(container.firstChild).toMatchSnapshot();

      // There's a reload button for the `public` datasource only once we're ready.
      expect(queryByText(/reload/i)).toBe(null);

      dispatch(doneSymbolicating());
      expect(getReloadButton()).not.toBe(null);
    });
  });

  describe('with the `from-addon` datasource', () => {
    it(`doesn't show a notice if updated after we were fully loaded`, async () => {
      process.env.NODE_ENV = 'production';

      const { navigateToAddonLoadingPage, container, dispatch } = setup();
      navigateToAddonLoadingPage();
      await dispatch(viewProfile(_getSimpleProfile()));

      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      // We don't display anything if there's an update ready.
      installOptions.onUpdateReady();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      // And we still don't if it was updated elsewhere.
      installOptions.onUpdated();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
    });

    it('shows a warning notice if updated before we were ready', async () => {
      process.env.NODE_ENV = 'production';

      const {
        navigateToAddonLoadingPage,
        container,
        dispatch,
        queryByText,
      } = setup();
      navigateToAddonLoadingPage();

      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      // We don't display anything if there's an update ready.
      installOptions.onUpdateReady();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      // But we do if it's updated from another tab.
      installOptions.onUpdated();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      expect(
        ensureExists(container.querySelector('.photon-message-bar')).className
      ).toMatch(/\bphoton-message-bar-warning\b/);
      // There's no reload button for the `from-addon` datasource.
      expect(queryByText(/reload/i)).toBe(null);
      expect(container.firstChild).toMatchSnapshot();

      // The notice stays if we're getting ready after that.
      await dispatch(viewProfile(_getSimpleProfile()));
      expect(container).not.toBeEmptyDOMElement();
    });
  });

  describe('automatic reloading', () => {
    it('reloads the application automatically if there is an error and there is a pending version', () => {
      process.env.NODE_ENV = 'production';

      const { dispatch } = setup();

      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      dispatch(fatalError(new Error('Error while loading profile')));
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      installOptions.onUpdateReady();
      expect(serviceWorkerRuntime.applyUpdate).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });

    it('reloads the application automatically if there is an error and there is a ready version happening then', () => {
      process.env.NODE_ENV = 'production';

      const { dispatch } = setup();
      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      dispatch(fatalError(new Error('Error while loading profile')));
      expect(window.location.reload).not.toHaveBeenCalled();
      installOptions.onUpdated();
      expect(window.location.reload).toHaveBeenCalled();
    });

    it('reloads the application automatically if there is an error and a new version has been notified before', () => {
      process.env.NODE_ENV = 'production';

      const { dispatch } = setup();
      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      installOptions.onUpdated();
      expect(window.location.reload).not.toHaveBeenCalled();
      dispatch(fatalError(new Error('Error while loading profile')));
      expect(window.location.reload).toHaveBeenCalled();
    });

    it('does not reload if the dataSource is from-file', () => {
      process.env.NODE_ENV = 'production';

      const { navigateToFileLoadingPage, dispatch } = setup();
      navigateToFileLoadingPage();

      const installOptions = serviceWorkerRuntime.install.mock.calls[0][0];

      dispatch(fatalError(new Error('Error while loading profile')));
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      installOptions.onUpdateReady();
      expect(serviceWorkerRuntime.applyUpdate).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    });
  });
});
