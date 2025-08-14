/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';
import * as WorkboxModule from 'workbox-window';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { ServiceWorkerManager } from '../../components/app/ServiceWorkerManager';
import { stateFromLocation } from '../../app-logic/url-handling';
import { updateUrlState } from '../../actions/app';
import {
  viewProfile,
  startSymbolicating,
  doneSymbolicating,
} from '../../actions/receive-profile';
import { fatalError } from '../../actions/errors';

import { ensureExists } from '../../utils/types';

import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { fireFullClick } from '../fixtures/utils';

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
    delete (window as any).location;
    // $FlowExpectError because the value we pass isn't a proper Location object.
    Object.defineProperty(window, 'location', {
      value: { reload: jest.fn() },
      writable: true,
      configurable: true,
    });

    // We don't need a fullfledged service worker object because we're mocking
    // the workbox library. But we need _something_ so that the app will try to
    // add a service worker in the first place.
    (navigator as any).serviceWorker = {};
  });

  afterEach(() => {
    process.env.NODE_ENV = 'development';

    Object.defineProperty(window, 'location', nativeLocation);
    nativeLocation = null;

    delete (navigator as any).serviceWorker;
  });

  function setup() {
    // Comment out this spy when you want to debug this test file.
    jest.spyOn(console, 'log').mockImplementation(() => {});

    // Due to the following jest issues, we can't put this implementation in a
    // jest.mock() call and also spying on the Workbox constructor:
    // https://github.com/facebook/jest/issues/7573
    // https://github.com/facebook/jest/issues/10419
    // But we need the constructor spy to access the instance.
    // @ts-expect-error - Types don't fully conform
    jest.spyOn(WorkboxModule, 'Workbox').mockImplementation(() => {
      // Constructor

      // We reimplement the event system so that we can dispatchEvent in tests
      const listenersMap = new Map<any, any>();
      return {
        register: jest.fn(),
        messageSkipWaiting: jest.fn(),
        addEventListener: jest.fn((eventName, callback) => {
          const listeners = listenersMap.get(eventName) ?? new Set();
          listeners.add(callback);
          listenersMap.set(eventName, listeners);
        }),
        dispatchEvent: (eventName) => {
          const listeners = listenersMap.get(eventName) ?? new Set();
          for (const listener of listeners) {
            act(() => {
              listener();
            });
          }
        },
      };
    });

    function navigateToStoreLoadingPage() {
      const newUrlState = stateFromLocation({
        pathname: '/public/ThisIsAFakeHash/calltree',
        search: '',
        hash: '',
      });
      act(() => {
        store.dispatch(updateUrlState(newUrlState));
      });
    }

    function navigateToFromBrowserProfileLoadingPage() {
      const newUrlState = stateFromLocation({
        pathname: '/from-browser/',
        search: '',
        hash: '',
      });
      act(() => {
        store.dispatch(updateUrlState(newUrlState));
      });
    }

    function navigateToFileLoadingPage() {
      const newUrlState = stateFromLocation({
        pathname: '/from-file/',
        search: '',
        hash: '',
      });
      act(() => {
        store.dispatch(updateUrlState(newUrlState));
      });
    }

    function navigateToFromUrlLoadingPage(url: string) {
      const newUrlState = stateFromLocation({
        pathname: `/from-url/${encodeURIComponent(url)}/`,
        search: '',
        hash: '',
      });
      act(() => {
        store.dispatch(updateUrlState(newUrlState));
      });
    }

    function getWorkboxInstance() {
      // WorkboxModule.Workbox is a mock but Flow doesn't know about that.
      const instance = (WorkboxModule.Workbox as any).mock.results[0].value;
      return instance;
    }

    const store = blankStore();

    const renderResult = render(
      <Provider store={store}>
        <ServiceWorkerManager />
      </Provider>
    );

    return {
      ...renderResult,
      getReloadButton: () => screen.getByText(/reload/i),
      getCloseButton: () => screen.getByLabelText(/hide/i),
      navigateToStoreLoadingPage,
      navigateToFromBrowserProfileLoadingPage,
      navigateToFileLoadingPage,
      navigateToFromUrlLoadingPage,
      dispatch: store.dispatch,
      getWorkboxInstance,
    };
  }

  it('does not register a service worker in the development environment', () => {
    setup();
    expect(WorkboxModule.Workbox).not.toHaveBeenCalled();
  });

  describe('in the home, with the `none` datasource', () => {
    it('shows a notice when the SW is updated, and the user can close it', () => {
      process.env.NODE_ENV = 'production';

      const { container, getCloseButton, getReloadButton, getWorkboxInstance } =
        setup();
      expect(WorkboxModule.Workbox).toHaveBeenCalledWith('/sw.js', {
        updateViaCache: 'none',
      });

      const instance = getWorkboxInstance();
      expect(instance.register).toHaveBeenCalled();

      // There's a new update!
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');

      expect(getReloadButton()).toHaveTextContent('Apply and reload');
      expect(container.firstChild).toMatchSnapshot();

      // Some other tab applied the update before we had the chance.
      instance.dispatchEvent('controlling');
      expect(getReloadButton()).toHaveTextContent('Reload the application');
      expect(container.firstChild).toMatchSnapshot();

      // Let's hide the notice.
      fireFullClick(getCloseButton());
      expect(container).toBeEmptyDOMElement();

      // But getting a new update should display the notice again.
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');
      expect(container.firstChild).toMatchSnapshot();

      // Until now, we didn't try to update from this tab.
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();

      // But let's do it now.
      const reloadButton = getReloadButton();
      fireFullClick(reloadButton);

      expect(instance.messageSkipWaiting).toHaveBeenCalled();
      expect(reloadButton).toHaveTextContent('Applying…');

      // And we should now reload automatically when the SW is fully updated.
      instance.dispatchEvent('controlling');
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('with the `public` datasource', () => {
    it('shows a notice when the SW is updated', async () => {
      process.env.NODE_ENV = 'production';

      const {
        dispatch,
        getReloadButton,
        getWorkboxInstance,
        navigateToStoreLoadingPage,
      } = setup();
      navigateToStoreLoadingPage();
      await act(() => dispatch(viewProfile(_getSimpleProfile())));

      expect(WorkboxModule.Workbox).toHaveBeenCalledWith('/sw.js', {
        updateViaCache: 'none',
      });

      const instance = getWorkboxInstance();
      expect(instance.register).toHaveBeenCalled();

      // There's a new update!
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');

      expect(getReloadButton()).toHaveTextContent('Apply and reload');
      expect(document.body).toMatchSnapshot();

      // Until now, we didn't try to update from this tab.
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();

      // But let's do it now.
      const reloadButton = getReloadButton();
      fireFullClick(reloadButton);

      expect(instance.messageSkipWaiting).toHaveBeenCalled();
      expect(reloadButton).toHaveTextContent('Applying…');

      // And we should now reload automatically when the SW is fully updated.
      instance.dispatchEvent('controlling');
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });

    it(`doesn't show a notice until a profile is fully loaded`, async () => {
      process.env.NODE_ENV = 'production';

      const {
        navigateToStoreLoadingPage,
        container,
        dispatch,
        getWorkboxInstance,
      } = setup();

      navigateToStoreLoadingPage();

      const instance = getWorkboxInstance();
      // There's a new update!
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');

      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      await act(() => dispatch(viewProfile(_getSimpleProfile())));
      expect(container).not.toBeEmptyDOMElement();
    });

    it(`doesn't show a notice until we're done symbolicating`, async () => {
      process.env.NODE_ENV = 'production';

      const {
        navigateToStoreLoadingPage,
        dispatch,
        container,
        getWorkboxInstance,
      } = setup();

      navigateToStoreLoadingPage();
      await act(() => dispatch(viewProfile(_getSimpleProfile())));
      act(() => {
        dispatch(startSymbolicating());
      });

      const instance = getWorkboxInstance();
      // There's a new update!
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');

      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      act(() => {
        dispatch(doneSymbolicating());
      });
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
        getWorkboxInstance,
      } = setup();

      navigateToStoreLoadingPage();
      await act(() => dispatch(viewProfile(_getSimpleProfile())));
      act(() => {
        dispatch(startSymbolicating());
      });

      const instance = getWorkboxInstance();
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');

      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      // Some other tabs updated the SW.
      instance.dispatchEvent('controlling');
      expect(
        ensureExists(container.querySelector('.photon-message-bar')).className
      ).toMatch(/\bphoton-message-bar-warning\b/);
      expect(container.firstChild).toMatchSnapshot();

      // There's a reload button for the `public` datasource only once we're ready.
      expect(queryByText(/reload/i)).not.toBeInTheDocument();

      act(() => {
        dispatch(doneSymbolicating());
      });
      expect(getReloadButton()).toBeInTheDocument();
    });
  });

  describe('with the `from-browser` datasource', () => {
    it(`doesn't show a notice if updated after we were fully loaded`, async () => {
      process.env.NODE_ENV = 'production';

      const {
        navigateToFromBrowserProfileLoadingPage,
        container,
        dispatch,
        getWorkboxInstance,
      } = setup();
      navigateToFromBrowserProfileLoadingPage();
      await act(() => dispatch(viewProfile(_getSimpleProfile())));

      const instance = getWorkboxInstance();

      // We don't display anything if there's an update ready.
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      // And we still don't if it was updated elsewhere.
      instance.dispatchEvent('controlling');
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
    });

    it('shows a warning notice if updated before we were ready', async () => {
      process.env.NODE_ENV = 'production';

      const {
        navigateToFromBrowserProfileLoadingPage,
        container,
        dispatch,
        queryByText,
        getWorkboxInstance,
      } = setup();
      navigateToFromBrowserProfileLoadingPage();

      const instance = getWorkboxInstance();

      // We don't display anything if there's an update ready.
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();

      // But we do if it's updated from another tab.
      instance.dispatchEvent('controlling');
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(
        ensureExists(container.querySelector('.photon-message-bar')).className
      ).toMatch(/\bphoton-message-bar-warning\b/);
      // There's no reload button for the `from-browser` datasource.
      expect(queryByText(/reload/i)).not.toBeInTheDocument();
      expect(container.firstChild).toMatchSnapshot();

      // The notice stays if we're getting ready after that.
      await act(() => dispatch(viewProfile(_getSimpleProfile())));
      expect(container).not.toBeEmptyDOMElement();
    });
  });

  describe('with the `from-url` datasource', () => {
    it('shows a notice when the SW is updated', async () => {
      process.env.NODE_ENV = 'production';

      const {
        dispatch,
        getReloadButton,
        getWorkboxInstance,
        navigateToFromUrlLoadingPage,
      } = setup();
      navigateToFromUrlLoadingPage(
        'https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task…DbtMVxw/runs/0/artifacts/public/test_info/profile_amazon.zip'
      );
      await act(() => dispatch(viewProfile(_getSimpleProfile())));

      expect(WorkboxModule.Workbox).toHaveBeenCalledWith('/sw.js', {
        updateViaCache: 'none',
      });

      const instance = getWorkboxInstance();
      expect(instance.register).toHaveBeenCalled();

      // There's a new update!
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');

      expect(getReloadButton()).toHaveTextContent('Apply and reload');
      expect(document.body).toMatchSnapshot();

      // Until now, we didn't try to update from this tab.
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();

      // But let's do it now.
      const reloadButton = getReloadButton();
      fireFullClick(reloadButton);

      expect(instance.messageSkipWaiting).toHaveBeenCalled();
      expect(reloadButton).toHaveTextContent('Applying…');

      // And we should now reload automatically when the SW is fully updated.
      instance.dispatchEvent('controlling');
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });

    it(`doesn't show a notice when the profile url is on localhost`, async () => {
      process.env.NODE_ENV = 'production';

      const { dispatch, getWorkboxInstance, navigateToFromUrlLoadingPage } =
        setup();
      navigateToFromUrlLoadingPage('http://localhost:5656/profile_amazon.zip');
      await act(() => dispatch(viewProfile(_getSimpleProfile())));

      expect(WorkboxModule.Workbox).toHaveBeenCalledWith('/sw.js', {
        updateViaCache: 'none',
      });

      const instance = getWorkboxInstance();
      expect(instance.register).toHaveBeenCalled();

      // There's a new update!
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');

      // There's no reload button.
      expect(screen.queryByText(/reload/i)).not.toBeInTheDocument();
    });
  });

  describe('automatic reloading', () => {
    it('reloads the application automatically if there is an error and there is a pending version', () => {
      process.env.NODE_ENV = 'production';

      const { dispatch, getWorkboxInstance } = setup();

      const instance = getWorkboxInstance();

      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      // Dispatch the events that an update is ready.
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');
      expect(instance.messageSkipWaiting).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });

    it('reloads the application automatically if there is an error and there is a ready version happening then', () => {
      process.env.NODE_ENV = 'production';

      const { dispatch, getWorkboxInstance } = setup();
      const instance = getWorkboxInstance();

      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      expect(window.location.reload).not.toHaveBeenCalled();
      // Dispatch the event that an update has been activated in another tab.
      instance.dispatchEvent('controlling');
      expect(window.location.reload).toHaveBeenCalled();
    });

    it('reloads the application automatically if there is an error and a new version has been notified before', () => {
      process.env.NODE_ENV = 'production';

      const { dispatch, getWorkboxInstance } = setup();
      const instance = getWorkboxInstance();

      instance.dispatchEvent('controlling');
      expect(window.location.reload).not.toHaveBeenCalled();
      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      expect(window.location.reload).toHaveBeenCalled();
    });

    it('does not reload if the dataSource is from-file', () => {
      process.env.NODE_ENV = 'production';

      const { navigateToFileLoadingPage, dispatch, getWorkboxInstance } =
        setup();
      navigateToFileLoadingPage();

      const instance = getWorkboxInstance();

      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      instance.dispatchEvent('installing');
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    });
  });
});
