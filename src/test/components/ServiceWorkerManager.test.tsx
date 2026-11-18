/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';
import { Workbox } from 'workbox-window';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { ServiceWorkerManager } from '../../components/app/ServiceWorkerManager';
import { stateFromLocation } from '../../app-logic/url-handling';
import { updateUrlState, urlSetupDone } from '../../actions/app';
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

jest.mock('workbox-window', () => ({
  Workbox: jest.fn(),
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
    delete (window as any).location;
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
    delete process.env.ENABLE_SERVICE_WORKER;

    Object.defineProperty(window, 'location', nativeLocation);
    nativeLocation = null;

    delete (navigator as any).serviceWorker;
  });

  function setup({ isUrlSetupDone = true } = {}) {
    // Comment out this spy when you want to debug this test file.
    jest.spyOn(console, 'log').mockImplementation(() => {});

    // A fake ServiceWorkerRegistration. Workbox doesn't emit an event when an
    // update starts installing, so the component listens to the registration.
    const updateFoundListeners = new Set<() => void>();
    const registration: {
      installing: ServiceWorker | null;
      addEventListener: jest.Mock;
    } = {
      installing: null,
      addEventListener: jest.fn((eventName, callback) => {
        if (eventName === 'updatefound') {
          updateFoundListeners.add(callback);
        }
      }),
    };

    // Simulates the browser starting to install a new service worker. It
    // returns a function that changes the state of this worker.
    function startInstallingServiceWorker() {
      const stateChangeListeners = new Set<() => void>();
      const worker = {
        state: 'installing',
        addEventListener: jest.fn((eventName, callback) => {
          if (eventName === 'statechange') {
            stateChangeListeners.add(callback);
          }
        }),
      };
      registration.installing = worker as any;
      for (const listener of updateFoundListeners) {
        act(() => listener());
      }
      return (state: string) => {
        worker.state = state;
        if (registration.installing === (worker as any)) {
          registration.installing = null;
        }
        for (const listener of stateChangeListeners) {
          act(() => listener());
        }
      };
    }

    (Workbox as unknown as jest.Mock).mockImplementation(() => {
      // Constructor

      // We reimplement the event system so that we can dispatchEvent in tests
      const listenersMap = new Map<any, any>();
      return {
        register: jest.fn(() => Promise.resolve(registration)),
        messageSkipWaiting: jest.fn(),
        addEventListener: jest.fn((eventName, callback) => {
          const listeners = listenersMap.get(eventName) ?? new Set();
          listeners.add(callback);
          listenersMap.set(eventName, listeners);
        }),
        dispatchEvent: (eventName: string, event: object = {}) => {
          const listeners = listenersMap.get(eventName) ?? new Set();
          for (const listener of listeners) {
            act(() => {
              listener(event);
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
      const instance = (Workbox as unknown as jest.Mock).mock.results[0].value;
      return instance;
    }

    const store = blankStore();
    if (isUrlSetupDone) {
      store.dispatch(urlSetupDone());
    }

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
      registration,
      startInstallingServiceWorker,
      // register() is asynchronous.
      waitForRegistration: () =>
        act(() => getWorkboxInstance().register.mock.results[0].value),
    };
  }

  it('does not register a service worker in the development environment', () => {
    setup();
    expect(Workbox).not.toHaveBeenCalled();
  });

  it('does not register a service worker in a local production build', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_SERVICE_WORKER = 'false';

    setup();
    expect(Workbox).not.toHaveBeenCalled();
  });

  describe('in the home, with the `none` datasource', () => {
    it('shows a notice when the SW is updated, and the user can close it', () => {
      process.env.NODE_ENV = 'production';

      const { container, getCloseButton, getReloadButton, getWorkboxInstance } =
        setup();
      expect(Workbox).toHaveBeenCalledWith('/sw.js', {
        updateViaCache: 'none',
      });

      const instance = getWorkboxInstance();
      expect(instance.register).toHaveBeenCalled();

      // There's a new update!
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

  describe('before the URL setup is done', () => {
    it('does not propose to apply an update', () => {
      process.env.NODE_ENV = 'production';

      const { dispatch, getReloadButton, getWorkboxInstance } = setup({
        isUrlSetupDone: false,
      });
      const instance = getWorkboxInstance();

      // There's a new update! But the dataSource isn't known yet.
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');
      expect(screen.queryByText(/reload/i)).not.toBeInTheDocument();

      // We're in the home.
      act(() => {
        dispatch(urlSetupDone());
      });
      expect(getReloadButton()).toHaveTextContent('Apply and reload');
    });

    it('reloads after an error if another tab applied an update while the profile was loading', () => {
      process.env.NODE_ENV = 'production';

      const { dispatch, getWorkboxInstance, navigateToFromUrlLoadingPage } =
        setup({ isUrlSetupDone: false });
      navigateToFromUrlLoadingPage('https://example.com/profile.json');
      const instance = getWorkboxInstance();

      // Another tab applies an update while this tab loads the profile.
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');
      instance.dispatchEvent('controlling');
      expect(
        screen.getByText(/was applied before this page was fully loaded/)
      ).toBeInTheDocument();
      expect(window.location.reload).not.toHaveBeenCalled();

      // Then the profile fails to load. The new version might fix it.
      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
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

      expect(Workbox).toHaveBeenCalledWith('/sw.js', {
        updateViaCache: 'none',
      });

      const instance = getWorkboxInstance();
      expect(instance.register).toHaveBeenCalled();

      // There's a new update!
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

      expect(Workbox).toHaveBeenCalledWith('/sw.js', {
        updateViaCache: 'none',
      });

      const instance = getWorkboxInstance();
      expect(instance.register).toHaveBeenCalled();

      // There's a new update!
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

      expect(Workbox).toHaveBeenCalledWith('/sw.js', {
        updateViaCache: 'none',
      });

      const instance = getWorkboxInstance();
      expect(instance.register).toHaveBeenCalled();

      // There's a new update!
      instance.dispatchEvent('installed');
      instance.dispatchEvent('waiting');

      // There's no reload button.
      expect(screen.queryByText(/reload/i)).not.toBeInTheDocument();
    });
  });

  describe('automatic reloading', () => {
    it('reloads the application automatically if there is an error and there is a pending version', async () => {
      process.env.NODE_ENV = 'production';
      (navigator as any).serviceWorker.controller = {};

      const {
        dispatch,
        getWorkboxInstance,
        startInstallingServiceWorker,
        waitForRegistration,
      } = setup();
      await waitForRegistration();

      const instance = getWorkboxInstance();

      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(screen.queryByText(/being installed/)).not.toBeInTheDocument();

      // Dispatch the events that an update is ready.
      const setWorkerState = startInstallingServiceWorker();
      expect(screen.getByText(/being installed/)).toBeInTheDocument();
      setWorkerState('installed');
      instance.dispatchEvent('installed', { isUpdate: true });
      instance.dispatchEvent('waiting', { isUpdate: true });
      expect(instance.messageSkipWaiting).toHaveBeenCalled();
      // We need to wait until the new version controls the page, otherwise the
      // reload could load the old version again.
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(screen.getByText(/being installed/)).toBeInTheDocument();

      instance.dispatchEvent('controlling');
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('shows the updating notice if the update started before the registration completed', async () => {
      process.env.NODE_ENV = 'production';
      (navigator as any).serviceWorker.controller = {};

      const { dispatch, registration, waitForRegistration } = setup();
      registration.installing = { addEventListener: jest.fn() } as any;
      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      expect(screen.queryByText(/being installed/)).not.toBeInTheDocument();

      await waitForRegistration();
      expect(screen.getByText(/being installed/)).toBeInTheDocument();
    });

    it('does not show the updating notice for the first installation', async () => {
      process.env.NODE_ENV = 'production';

      const { dispatch, startInstallingServiceWorker, waitForRegistration } =
        setup();
      await waitForRegistration();

      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      startInstallingServiceWorker();
      expect(screen.queryByText(/being installed/)).not.toBeInTheDocument();
    });

    it('hides the updating notice if the installation fails', async () => {
      process.env.NODE_ENV = 'production';
      (navigator as any).serviceWorker.controller = {};

      const { dispatch, startInstallingServiceWorker, waitForRegistration } =
        setup();
      await waitForRegistration();

      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      const setWorkerState = startInstallingServiceWorker();
      expect(screen.getByText(/being installed/)).toBeInTheDocument();
      setWorkerState('redundant');
      expect(screen.queryByText(/being installed/)).not.toBeInTheDocument();
      expect(window.location.reload).not.toHaveBeenCalled();
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

    it('does not reload if the dataSource is from-file', async () => {
      process.env.NODE_ENV = 'production';
      (navigator as any).serviceWorker.controller = {};

      const {
        navigateToFileLoadingPage,
        dispatch,
        getWorkboxInstance,
        startInstallingServiceWorker,
        waitForRegistration,
      } = setup();
      navigateToFileLoadingPage();
      await waitForRegistration();

      const instance = getWorkboxInstance();

      act(() => {
        dispatch(fatalError(new Error('Error while loading profile')));
      });
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      startInstallingServiceWorker();
      expect(screen.queryByText(/being installed/)).not.toBeInTheDocument();
      instance.dispatchEvent('installed', { isUpdate: true });
      instance.dispatchEvent('waiting', { isUpdate: true });
      expect(instance.messageSkipWaiting).not.toHaveBeenCalled();
      expect(window.location.reload).not.toHaveBeenCalled();
    });
  });
});
