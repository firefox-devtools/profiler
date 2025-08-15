/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  fireEvent,
  screen,
  waitForElementToBeRemoved,
  act,
} from '@testing-library/react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { MenuButtons } from 'firefox-profiler/components/app/MenuButtons';
import { CurrentProfileUploadedInformationLoader } from 'firefox-profiler/components/app/CurrentProfileUploadedInformationLoader';

import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';
import {
  processGeckoProfile,
  unserializeProfileOfArbitraryFormat,
} from 'firefox-profiler/profile-logic/process-profile';
import {
  persistUploadedProfileInformationToDb,
  retrieveUploadedProfileInformationFromDb,
} from 'firefox-profiler/app-logic/uploaded-profiles-db';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { loadProfile } from 'firefox-profiler/actions/receive-profile';

import { getHash, getDataSource } from 'firefox-profiler/selectors/url-state';

import { ensureExists } from '../../utils/types';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
  addTabInformationToProfile,
  markTabIdsAsPrivateBrowsing,
} from '../fixtures/profiles/processed-profile';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { fireFullClick } from '../fixtures/utils';
import { storeWithProfile, blankStore } from '../fixtures/stores';

import type {
  Profile,
  Store,
  UploadedProfileInformation,
} from 'firefox-profiler/types';

// We need IndexedDB to get a SymbolStore that's necessary for symbolication
// to even start, in some of the tests for this file.
import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

// We mock profile-store but we want the real error, so that we can simulate it.
import {
  uploadBinaryProfileData,
  deleteProfileOnServer,
} from 'firefox-profiler/profile-logic/profile-store';
jest.mock('firefox-profiler/profile-logic/profile-store');
const { UploadAbortedError } = jest.requireActual(
  '../../profile-logic/profile-store'
);

// Mocking sha1
import sha1 from '../../utils/sha1';
jest.mock('../../utils/sha1');

// We want this module to have mocks so that we can change the return values in
// tests. But in beforeEach below, we return the real implementation by default.
// Note that we can't do it using the factory function because of this Jest issue:
// https://github.com/facebook/jest/issues/14080
jest.mock('firefox-profiler/utils/gz');

beforeEach(() => {
  const realModule = jest.requireActual('firefox-profiler/utils/gz');
  const { compress, decompress } = require('firefox-profiler/utils/gz');
  compress.mockImplementation(realModule.compress);
  decompress.mockImplementation(realModule.decompress);
});

// Mocking shortenUrl
import { shortenUrl } from '../../utils/shorten-url';
jest.mock('../../utils/shorten-url');

import { symbolicateProfile } from 'firefox-profiler/profile-logic/symbolication';
jest.mock('firefox-profiler/profile-logic/symbolication');

// Mock hash
const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';

describe('app/MenuButtons', function () {
  function createSimpleProfile(updateChannel = 'release') {
    const { profile } = getProfileFromTextSamples('A');
    profile.meta.updateChannel = updateChannel;
    return { profile };
  }

  function createPreferenceReadProfile(updateChannel = 'release') {
    const profile = getProfileWithMarkers([
      [
        'PreferenceRead',
        0,
        1,
        {
          type: 'PreferenceRead',
          prefAccessTime: 0,
          prefName: 'testing',
          prefKind: 'testing',
          prefType: 'testing',
          prefValue: 'testing',
        },
      ],
    ]);
    profile.meta.updateChannel = updateChannel;
    return { profile };
  }

  function setup(store: Store) {
    // We need a sensible data source for this component.
    store.dispatch(
      updateUrlState(
        stateFromLocation({
          pathname: '/from-browser',
          search: '',
          hash: '',
        })
      )
    );

    const renderResult = render(
      <Provider store={store}>
        <>
          <CurrentProfileUploadedInformationLoader />
          <MenuButtons />
        </>
      </Provider>
    );

    const navigateToHash = (hash: string) => {
      const newUrlState = stateFromLocation({
        pathname: `/public/${hash}/calltree`,
        search: '',
        hash: '',
      });
      act(() => {
        store.dispatch(updateUrlState(newUrlState));
      });
    };

    async function waitForPanelToBeRemoved() {
      await waitForElementToBeRemoved(
        ensureExists(document.querySelector('.arrowPanelContent'))
      );
    }

    return {
      ...store,
      ...renderResult,
      navigateToHash,
      waitForPanelToBeRemoved,
    };
  }

  describe('<Publish>', function () {
    function mockUpload() {
      // Create a promise with the resolve function outside of it.
      // const { promise, resolve: resolveUpload, reject: rejectUpload } = Promise.withResolvers();
      let resolveUpload: (param: any) => void,
        rejectUpload: (reason?: any) => void;
      const promise = new Promise((resolve, reject) => {
        resolveUpload = resolve;
        rejectUpload = reject;
      });

      promise.catch(() => {
        // Node complains if we don't handle a promise/catch, and this one may reject
        // before it's properly handled. Catch it here so that Node doesn't complain.
        // This won't hide problems in our code because the app code "awaits" the
        // result of startUpload, so any rejection will be handled there.
      });

      // TypeScript doesn't know uploadBinaryProfileData is a jest mock.
      (uploadBinaryProfileData as any).mockImplementation(() => ({
        abortUpload: () => {
          // In the real implementation, we call xhr.abort, which in turn
          // triggers an "abort" event on the XHR object, which in turn rejects
          // the promise with the error UploadAbortedError. So we do just that
          // here directly, to simulate this.
          rejectUpload(new UploadAbortedError());
        },
        startUpload: () => promise,
      }));

      // @ts-expect-error - TS2454: Variable 'resolveUpload' is used before being assigned.
      // This is incorrect; new Promise runs its callback synchronously so these variables
      // are already assigned. Anyway, once we can use Promise.withResolvers, that'll be
      // the more straightforward solution.
      return { resolveUpload, rejectUpload };
    }

    function setupForPublish(profile = createSimpleProfile().profile) {
      const { resolveUpload, rejectUpload } = mockUpload();

      const setupResult = setup(storeWithProfile(profile));

      const getPublishButton = () =>
        screen.getByText(/^(Re-upload|Upload Local Profile)$/);
      const findPublishButton = () =>
        screen.findByText(/^(Re-upload|Upload Local Profile)$/);
      const getCancelButton = () => screen.getByText('Cancel Upload');
      const getPanelForm = () =>
        ensureExists(
          document.querySelector('form'),
          'Could not find the form in the panel'
        );
      const queryPreferenceCheckbox = () =>
        screen.queryByText('Include preference values');
      const queryPrivateBrowsingCheckbox = () =>
        screen.queryByRole('checkbox', {
          name: /Include the data from private browsing windows/,
        });
      const getPrivateBrowsingCheckbox = () =>
        screen.getByRole('checkbox', {
          name: /Include the data from private browsing windows/,
        });
      const getRemoveOtherTabsCheckbox = () =>
        screen.getByRole('checkbox', {
          name: /Include the data from other tabs/,
        });
      const getPanel = () => screen.getByTestId('MenuButtonsPublish-container');
      const openPublishPanel = async () => {
        fireFullClick(getPublishButton());
        await screen.findByText(/^(Share|Re-upload) Performance Profile$/);
      };

      return {
        ...setupResult,
        getPanel,
        findPublishButton,
        getPublishButton,
        getCancelButton,
        getPanelForm,
        queryPreferenceCheckbox,
        queryPrivateBrowsingCheckbox,
        getPrivateBrowsingCheckbox,
        getRemoveOtherTabsCheckbox,
        openPublishPanel,
        resolveUpload,
        rejectUpload,
      };
    }

    afterAll(async function () {
      // @ts-expect-error "property must be optional"
      delete URL.createObjectURL;
      // @ts-expect-error "property must be optional"
      delete URL.revokeObjectURL;
    });

    beforeEach(function () {
      // Flow doesn't know sha1 is a jest mock.
      (sha1 as any).mockImplementation((_data: Uint8Array) =>
        Promise.resolve(hash)
      );
      // Flow doesn't know shortenUrl is a jest mock.
      (shortenUrl as any).mockImplementation(() =>
        Promise.resolve('https://profiler.firefox.com/')
      );
      // jsdom does not have URL.createObjectURL.
      // See https://github.com/jsdom/jsdom/issues/1721
      (URL as any).createObjectURL = () => 'mockCreateObjectUrl';
      (URL as any).revokeObjectURL = () => {};
    });

    it('matches the snapshot for the closed state', () => {
      const { profile } = createSimpleProfile();
      const { container } = setupForPublish(profile);
      expect(container).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a nightly profile', async () => {
      const { profile } = createSimpleProfile('nightly');
      const { getPanel, openPublishPanel } = setupForPublish(profile);
      await openPublishPanel();
      await screen.findByRole('link', { name: /Download/ });
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a release profile', async () => {
      const { profile } = createSimpleProfile('release');
      const { getPanel, openPublishPanel } = setupForPublish(profile);
      await openPublishPanel();
      await screen.findByRole('link', { name: /Download/ });
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the menu buttons and the opened panel for an already uploaded profile', async () => {
      const { profile } = createSimpleProfile();
      const { getPanel, container, navigateToHash, openPublishPanel } =
        setupForPublish(profile);
      navigateToHash('VALID_HASH');
      expect(container).toMatchSnapshot();
      await openPublishPanel();
      await screen.findByRole('link', { name: /Download/ });
      expect(getPanel()).toMatchSnapshot();
    });

    it('shows the Include preference values checkbox when a PreferenceRead marker is in the profile', async () => {
      const { profile } = createPreferenceReadProfile('release');
      const { queryPreferenceCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryPreferenceCheckbox()).toBeTruthy();
    });

    it('does not show the Include preference values checkbox when a PreferenceRead marker is in the profile', async () => {
      const { profile } = createSimpleProfile('release');
      const { queryPreferenceCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryPreferenceCheckbox()).toBeFalsy();
    });

    it('Unchecks the Include Browsing Data checkbox in nightly when some private browsing data is in the profile', async () => {
      const { profile } = createSimpleProfile();
      const { firstTabTabID } = addTabInformationToProfile(profile);
      markTabIdsAsPrivateBrowsing(profile, [firstTabTabID]);

      const { getPrivateBrowsingCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();

      const privateBrowsingCheckbox = getPrivateBrowsingCheckbox();
      expect(privateBrowsingCheckbox).toBeInTheDocument();
      expect(privateBrowsingCheckbox).not.toBeChecked();
    });

    it('Unchecks the Include Browsing Data checkbox in release when some private browsing data is in the profile', async () => {
      const { profile } = createSimpleProfile('release');
      const { firstTabTabID } = addTabInformationToProfile(profile);
      markTabIdsAsPrivateBrowsing(profile, [firstTabTabID]);

      const { getPrivateBrowsingCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();

      const privateBrowsingCheckbox = getPrivateBrowsingCheckbox();
      expect(privateBrowsingCheckbox).toBeInTheDocument();
      expect(privateBrowsingCheckbox).not.toBeChecked();
    });

    it('does not show the Include Browsing Data checkbox when no private browsing data is in the profile', async () => {
      const { profile } = createSimpleProfile();
      const { queryPrivateBrowsingCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryPrivateBrowsingCheckbox()).not.toBeInTheDocument();
    });

    it('can publish and revert', async () => {
      const { openPublishPanel, getPanelForm, resolveUpload, getState } =
        setupForPublish();
      await openPublishPanel();
      fireEvent.submit(getPanelForm());
      resolveUpload('SOME_HASH');

      const revertButton = await screen.findByText(/revert/i);
      expect(getDataSource(getState())).toBe('public');
      expect(getHash(getState())).toBe('SOME_HASH');
      expect(document.body).toMatchSnapshot();

      fireFullClick(revertButton);
      await waitForElementToBeRemoved(revertButton);

      expect(getDataSource(getState())).toBe('from-browser');
      expect(getHash(getState())).toBe('');
    });

    it('can publish, cancel, and then publish again', async () => {
      const {
        getPanel,
        getPublishButton,
        findPublishButton,
        getCancelButton,
        getPanelForm,
        openPublishPanel,
      } = setupForPublish();
      await openPublishPanel();
      fireEvent.submit(getPanelForm());

      // These shouldn't exist anymore.
      expect(() => getPanel()).toThrow();
      expect(() => getPublishButton()).toThrow();

      fireFullClick(getCancelButton());

      // This might be asynchronous, depending on the underlying code.
      expect(await findPublishButton()).toBeTruthy();
    });

    it('matches the snapshot for an upload error', async () => {
      const { getPanel, getPanelForm, rejectUpload, openPublishPanel } =
        setupForPublish();

      await openPublishPanel();
      fireEvent.submit(getPanelForm());
      rejectUpload('This is a mock error');

      // Wait until the error button is visible.
      const errorButton = await screen.findByText('Error uploading');

      // Now click the error button, and get a snapshot of the panel.
      fireFullClick(errorButton);
      await screen.findByText(/something went wrong/);
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for a compression error', async () => {
      const { compress } = require('firefox-profiler/utils/gz');
      // $FlowExpectError Flow doesn't know about Jest mocks
      compress.mockRejectedValue(new Error('Compression error'));
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getPanel, openPublishPanel } = setupForPublish();

      await openPublishPanel();
      expect(
        await screen.findByText(/Error while compressing/)
      ).toBeInTheDocument();
      expect(console.error).toHaveBeenCalledWith(
        'Error while compressing the profile data',
        expect.any(Error)
      );
      expect(getPanel()).toMatchSnapshot();
    });
  });

  describe('<MetaInfoPanel>', function () {
    async function setupForMetaInfoPanel(profile: Profile) {
      jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (
        this: Date
      ) {
        // eslint-disable-next-line @babel/no-invalid-this
        return 'toLocaleString ' + this.toUTCString();
      });

      const store = blankStore();

      // Note that we dispatch this action directly instead of using viewProfile
      // or loadProfile because we want to control tightly how symbolication is
      // started in these tests.
      await store.dispatch(loadProfile(profile, { skipSymbolication: true }));

      const setupResult = setup(store);

      async function displayMetaInfoPanel() {
        fireFullClick(screen.getByText('Profile Info'));
        await screen.findByText('Profile Information');
      }

      function getMetaInfoPanel() {
        return document.querySelector('.metaInfoPanel');
      }

      return {
        ...setupResult,
        getMetaInfoPanel,
        displayMetaInfoPanel,
      };
    }

    it('matches the snapshot', async () => {
      // Using gecko profile because it has metadata and profilerOverhead data in it.
      const profile = processGeckoProfile(createGeckoProfile());
      profile.meta.configuration = {
        features: ['js', 'threads'],
        threads: ['GeckoMain', 'DOM Worker'],
        // The capacity is expressed in entries, where 1 entry == 8 bytes.
        // 128M entries is 1GB.
        capacity: 128 * 1024 * 1024,
        duration: 20,
      };

      const { displayMetaInfoPanel, getMetaInfoPanel } =
        await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();
      const renderedCapacity = ensureExists(
        screen.getByText(/Buffer capacity/).nextSibling
      );

      /* This rule needs to be disabled because `renderedCapacity` is a text
       * code, and this triggers
       * https://github.com/testing-library/jest-dom/issues/306 */
      /* eslint-disable-next-line jest-dom/prefer-to-have-text-content */
      expect(renderedCapacity.textContent).toBe('1GB');
      expect(getMetaInfoPanel()).toMatchSnapshot();
    });

    it('matches the snapshot with device information', async () => {
      // Using gecko profile because it has metadata and profilerOverhead data in it.
      const profile = processGeckoProfile(createGeckoProfile());
      profile.meta.device = 'Android Device';

      const { displayMetaInfoPanel, getMetaInfoPanel } =
        await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();

      const renderedDevice = ensureExists(
        screen.getByText(/Device:/).nextSibling
      );

      /* This rule needs to be disabled because `renderedDevice` is a text
       * code, and this triggers
       * https://github.com/testing-library/jest-dom/issues/306 */
      /* eslint-disable-next-line jest-dom/prefer-to-have-text-content */
      expect(renderedDevice.textContent).toBe('Android Device');
      expect(getMetaInfoPanel()).toMatchSnapshot();
    });

    it('matches the snapshot with uptime', async () => {
      // Using gecko profile because it has metadata and profilerOverhead data in it.
      const profile = processGeckoProfile(createGeckoProfile());
      // The profiler was started 500ms after the parent process.
      profile.meta.profilingStartTime = 500;

      const { displayMetaInfoPanel, getMetaInfoPanel } =
        await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();

      const uptime = ensureExists(screen.getByText(/Uptime:/).nextSibling);
      expect(uptime).toHaveTextContent('500ms');
      expect(getMetaInfoPanel()).toMatchSnapshot();
    });

    it('with no statistics object should not make the app crash', async () => {
      // Using gecko profile because it has metadata and profilerOverhead data in it.
      const profile = processGeckoProfile(createGeckoProfile());
      // We are removing statistics objects from all overhead objects to test
      // the robustness of our handling code.
      if (profile.profilerOverhead) {
        for (const overhead of profile.profilerOverhead) {
          delete overhead.statistics;
        }
      }

      const { displayMetaInfoPanel, getMetaInfoPanel } =
        await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();
      expect(getMetaInfoPanel()).toMatchSnapshot();
    });

    it('with no extra info there is no more info button', async () => {
      const { profile } = getProfileFromTextSamples('A');
      const { displayMetaInfoPanel } = await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();

      expect(screen.queryByText('Show more')).not.toBeInTheDocument();
    });

    it('with more extra info, opens more info section if clicked', async () => {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.extra = [
        {
          label: 'CPU',
          entries: [
            {
              label: 'CPU 1',
              format: 'string',
              value: 'Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz',
            },
          ],
        },
        {
          label: 'Memory',
          entries: [],
        },
        {
          label: 'Hard Drives',
          entries: [
            {
              label: 'SSD',
              format: 'string',
              value: 'Samsung SSD 850 EVO 500GB',
            },
            {
              label: 'HDD',
              format: 'string',
              value: 'Seagate ST1000LM035-1RK172',
            },
          ],
        },
      ];

      const { displayMetaInfoPanel } = await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();

      const summary = screen.getByText('Show more');
      fireFullClick(summary);
      const moreInfoPart = document.querySelector('.moreInfoPart');
      expect(moreInfoPart).toMatchSnapshot();
    });

    it('Does display a link for the build if there is a URL', async () => {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.sourceURL =
        'https://hg.mozilla.org/mozilla-central/rev/6be6a06991d7a2123d4b51f4ce384c6bce92f859';
      const buildID = '20250402094810';
      profile.meta.appBuildID = buildID;

      const unserializedProfile =
        await unserializeProfileOfArbitraryFormat(profile);
      const { displayMetaInfoPanel } =
        await setupForMetaInfoPanel(unserializedProfile);
      await displayMetaInfoPanel();

      const buildIdElement = ensureExists(
        screen.getByText(/Build ID:/).nextSibling
      );
      expect(buildIdElement).toBeInstanceOf(HTMLAnchorElement);
      expect(buildIdElement).toHaveTextContent(buildID);
      expect((buildIdElement as any).href).toBe(profile.meta.sourceURL);
    });

    it('does not display a link for the build ID if there is no URL', async () => {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.sourceURL = 'unknown';
      const buildID = '20250402094810';
      profile.meta.appBuildID = buildID;
      const unserializedProfile =
        await unserializeProfileOfArbitraryFormat(profile);
      const { displayMetaInfoPanel } =
        await setupForMetaInfoPanel(unserializedProfile);
      await displayMetaInfoPanel();

      const buildIdElement = ensureExists(
        screen.getByText(/Build ID:/).nextSibling
      );
      expect(buildIdElement).toBeInstanceOf(Text);
      expect(buildIdElement).toHaveTextContent(buildID);
    });

    describe('deleting a profile', () => {
      const FAKE_HASH = 'FAKE_HASH';
      const FAKE_PROFILE_DATA = {
        profileToken: FAKE_HASH,
        jwtToken: null,
        publishedDate: new Date('4 Jul 2020 13:00 GMT'),
        name: 'PROFILE',
        preset: null,
        meta: {
          product: 'Firefox',
          platform: 'Macintosh',
          toolkit: 'cocoa',
          misc: 'rv:62.0',
          oscpu: 'Intel Mac OS X 10.12',
        },
        urlPath: '/public/MACOSX/marker-chart/',
        publishedRange: { start: 2000, end: 40000 },
      };

      async function addUploadedProfileInformation(
        uploadedProfileInformationOverrides: Partial<UploadedProfileInformation> = {}
      ) {
        const uploadedProfileInformation = {
          ...FAKE_PROFILE_DATA,
          ...uploadedProfileInformationOverrides,
        };
        await persistUploadedProfileInformationToDb(uploadedProfileInformation);
      }

      async function setupForDeletion() {
        const { profile } = createSimpleProfile();
        const setupResult = await setupForMetaInfoPanel(profile);
        const { navigateToHash, displayMetaInfoPanel } = setupResult;
        navigateToHash(FAKE_HASH);
        await displayMetaInfoPanel();

        return setupResult;
      }

      test('does not display the delete button if the profile is public but without uploaded data', async () => {
        const { getMetaInfoPanel } = await setupForDeletion();
        // We wait a bit using the "find" flavor of the queries because this is
        // reached asynchronously.
        await expect(screen.findByText('Uploaded:')).rejects.toThrow();
        expect(screen.queryByText('Delete')).not.toBeInTheDocument();
        expect(getMetaInfoPanel()).toMatchSnapshot();
      });

      test('displays the delete button if we have the uploaded data but no JWT token', async () => {
        await addUploadedProfileInformation();
        const { getMetaInfoPanel } = await setupForDeletion();
        expect(await screen.findByText('Uploaded:')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeDisabled();
        expect(getMetaInfoPanel()).toMatchSnapshot();
      });

      test('displays the delete button if we have the uploaded data and some JWT token', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        const { getMetaInfoPanel } = await setupForDeletion();
        expect(await screen.findByText('Uploaded:')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeEnabled();
        expect(getMetaInfoPanel()).toMatchSnapshot();
      });

      test('clicking on the button shows the confirmation', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        const { getMetaInfoPanel } = await setupForDeletion();
        fireFullClick(await screen.findByText('Delete'));
        expect(screen.getByText(/are you sure/i)).toBeEnabled();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
        expect(getMetaInfoPanel()).toMatchSnapshot();
      });

      test('clicking on the "cancel" button will move back to the profile information', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        await setupForDeletion();
        fireFullClick(await screen.findByText('Delete'));

        // Canceling should move back to the previous
        fireFullClick(screen.getByText('Cancel'));

        // We're back at the profile information panel.
        expect(screen.getByText('Profile Information')).toBeInTheDocument();
      });

      test('dismissing the panel will move back to the profile information when opened again', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        const { displayMetaInfoPanel, waitForPanelToBeRemoved } =
          await setupForDeletion();
        fireFullClick(await screen.findByText('Delete'));

        // Dismissing by clicking elsewhere
        fireFullClick(ensureExists(document.body));
        await waitForPanelToBeRemoved();

        // We're back at the profile information panel if we open the panel again.
        await displayMetaInfoPanel();
        expect(screen.getByText('Profile Information')).toBeInTheDocument();
      });

      test('confirming the delete should delete on the server and in the db', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        const {
          getMetaInfoPanel,
          displayMetaInfoPanel,
          waitForPanelToBeRemoved,
        } = await setupForDeletion();
        fireFullClick(await screen.findByText('Delete'));
        fireFullClick(screen.getByText('Delete'));
        await screen.findByText(/successfully/i);
        // This has been deleted from the server.
        expect(deleteProfileOnServer).toHaveBeenCalledWith({
          profileToken: FAKE_HASH,
          jwtToken: 'FAKE_TOKEN',
        });
        // This has been deleted from the DB.
        expect(await retrieveUploadedProfileInformationFromDb(FAKE_HASH)).toBe(
          null
        );
        expect(getMetaInfoPanel()).toMatchSnapshot();

        // Dismissing the metainfo panel and displaying it again should show the
        // initial panel now.
        fireFullClick(ensureExists(document.body));
        await waitForPanelToBeRemoved();
        await displayMetaInfoPanel();
        expect(screen.getByText('Profile Information')).toBeInTheDocument();
        expect(screen.queryByText('Uploaded:')).not.toBeInTheDocument();
      });
    });

    describe('symbolication', function () {
      type SymbolicationTestConfig = Readonly<{
        symbolicated: boolean;
      }>;

      async function setupSymbolicationTest(config: SymbolicationTestConfig) {
        const { profile } = getProfileFromTextSamples('A');
        profile.meta.symbolicated = config.symbolicated;

        const setupResult = await setupForMetaInfoPanel(profile);
        await setupResult.displayMetaInfoPanel();
        return setupResult;
      }

      it('handles successfully symbolicated profiles', async () => {
        await setupSymbolicationTest({ symbolicated: true });

        expect(screen.getByText('Profile is symbolicated')).toBeInTheDocument();
        fireFullClick(screen.getByText('Re-symbolicate profile'));

        expect(symbolicateProfile).toHaveBeenCalled();
        expect(
          screen.getByText('Attempting to re-symbolicate profile')
        ).toBeInTheDocument();
        // No symbolicate button is available.
        expect(
          screen.queryByText('Symbolicate profile')
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText('Re-symbolicate profile')
        ).not.toBeInTheDocument();

        // After a while, we get a result
        expect(
          await screen.findByText('Profile is symbolicated')
        ).toBeInTheDocument();
        expect(screen.getByText('Re-symbolicate profile')).toBeInTheDocument();
      });

      it('handles the contradictory state of non-symbolicated profiles that are done', async () => {
        await setupSymbolicationTest({ symbolicated: false });

        expect(
          screen.getByText('Profile is not symbolicated')
        ).toBeInTheDocument();
        fireFullClick(screen.getByText('Symbolicate profile'));
        expect(symbolicateProfile).toHaveBeenCalled();

        expect(
          screen.getByText('Currently symbolicating profile')
        ).toBeInTheDocument();
        // No symbolicate button is available.
        expect(
          screen.queryByText('Symbolicate profile')
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText('Re-symbolicate profile')
        ).not.toBeInTheDocument();

        // After a while, we get a result
        expect(
          await screen.findByText('Profile is symbolicated')
        ).toBeInTheDocument();
        expect(screen.getByText('Re-symbolicate profile')).toBeInTheDocument();
      });
    });
  });
});
