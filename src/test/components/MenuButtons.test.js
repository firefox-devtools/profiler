/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { MenuButtons } from '../../components/app/MenuButtons';
import { MetaInfoPanel } from '../../components/app/MenuButtons/MetaInfo';
import {
  render,
  fireEvent,
  waitFor,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { storeWithProfile, blankStore } from '../fixtures/stores';
import { TextEncoder } from 'util';
import { stateFromLocation } from '../../app-logic/url-handling';
import { updateUrlState } from 'firefox-profiler/actions/app';
import {
  changeTimelineTrackOrganization,
  loadProfile,
} from 'firefox-profiler/actions/receive-profile';
import { getTimelineTrackOrganization } from 'firefox-profiler/selectors';

import { getHash, getDataSource } from 'firefox-profiler/selectors/url-state';

import { ensureExists } from '../../utils/flow';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { processGeckoProfile } from '../../profile-logic/process-profile';
import { fireFullClick } from '../fixtures/utils';

import type { Profile } from 'firefox-profiler/types';

// We need IndexedDB to get a SymbolStore that's necessary for symbolication
// to even start, in some of the tests for this file.
import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

// We mock profile-store but we want the real error, so that we can simulate it.
import { uploadBinaryProfileData } from '../../profile-logic/profile-store';
jest.mock('../../profile-logic/profile-store');
const { UploadAbortedError } = jest.requireActual(
  '../../profile-logic/profile-store'
);

// Mocking sha1
import sha1 from '../../utils/sha1';
jest.mock('../../utils/sha1');

// Mocking compress
jest.mock('../../utils/gz');

// Mocking shortenUrl
import { shortenUrl } from '../../utils/shorten-url';
jest.mock('../../utils/shorten-url');

import { symbolicateProfile } from 'firefox-profiler/profile-logic/symbolication';
jest.mock('firefox-profiler/profile-logic/symbolication');

// Mock hash
const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';

describe('app/MenuButtons', function() {
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

  function setup(profile) {
    jest.useFakeTimers();

    const store = storeWithProfile(profile);

    store.dispatch(
      updateUrlState(
        stateFromLocation({
          pathname: '/from-addon',
          search: '',
          hash: '',
        })
      )
    );

    const renderResult = render(
      <Provider store={store}>
        <MenuButtons />
      </Provider>
    );

    const clickAndRunTimers = where => {
      fireFullClick(where);
      jest.runAllTimers();
    };
    const navigateToHash = (hash: string) => {
      const newUrlState = stateFromLocation({
        pathname: `/public/${hash}/calltree`,
        search: '',
        hash: '',
      });
      store.dispatch(updateUrlState(newUrlState));
    };
    return {
      ...store,
      ...renderResult,
      clickAndRunTimers,
      navigateToHash,
    };
  }

  describe('<Publish>', function() {
    function mockUpload() {
      // Create a promise with the resolve function outside of it.
      let resolveUpload, rejectUpload;
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

      // Flow doesn't know uploadBinaryProfileData is a jest mock.
      (uploadBinaryProfileData: any).mockImplementation(
        (() => ({
          abortUpload: () => {
            // In the real implementation, we call xhr.abort, which in turn
            // triggers an "abort" event on the XHR object, which in turn rejects
            // the promise with the error UploadAbortedError. So we do just that
            // here directly, to simulate this.
            rejectUpload(new UploadAbortedError());
          },
          startUpload: () => promise,
        }): typeof uploadBinaryProfileData)
      );

      return { resolveUpload, rejectUpload };
    }

    function setupForPublish(profile) {
      const { resolveUpload, rejectUpload } = mockUpload();

      const setupResult = setup(profile);

      const getPublishButton = () => screen.getByText(/^(Re-upload|Upload)$/);
      const findPublishButton = () => screen.findByText(/^(Re-upload|Upload)$/);
      const getErrorButton = () => screen.getByText('Error uploading');
      const getCancelButton = () => screen.getByText('Cancel Upload');
      const getPanelForm = () =>
        ensureExists(
          document.querySelector('form'),
          'Could not find the form in the panel'
        );
      const queryPreferenceCheckbox = () =>
        screen.queryByText('Include preference values');
      const getPanel = () => screen.getByTestId('MenuButtonsPublish-container');

      return {
        ...setupResult,
        getPanel,
        findPublishButton,
        getPublishButton,
        getErrorButton,
        getCancelButton,
        getPanelForm,
        queryPreferenceCheckbox,
        resolveUpload,
        rejectUpload,
      };
    }

    beforeAll(function() {
      if ((window: any).TextEncoder) {
        throw new Error('A TextEncoder was already on the window object.');
      }
      (window: any).TextEncoder = TextEncoder;
    });

    afterAll(async function() {
      delete URL.createObjectURL;
      delete URL.revokeObjectURL;
      delete (window: any).TextEncoder;
    });

    beforeEach(function() {
      // Flow doesn't know sha1 is a jest mock.
      (sha1: any).mockImplementation((_data: Uint8Array) =>
        Promise.resolve(hash)
      );
      // Flow doesn't know shortenUrl is a jest mock.
      (shortenUrl: any).mockImplementation(() =>
        Promise.resolve('https://profiler.firefox.com/')
      );
      // jsdom does not have URL.createObjectURL.
      // See https://github.com/jsdom/jsdom/issues/1721
      (URL: any).createObjectURL = () => 'mockCreateObjectUrl';
      (URL: any).revokeObjectURL = () => {};
    });

    it('matches the snapshot for the closed state', () => {
      const { profile } = createSimpleProfile();
      const { container } = setupForPublish(profile);
      expect(container).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a nightly profile', () => {
      const { profile } = createSimpleProfile('nightly');
      const { getPanel, getPublishButton, clickAndRunTimers } = setupForPublish(
        profile
      );
      clickAndRunTimers(getPublishButton());
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a release profile', () => {
      const { profile } = createSimpleProfile('release');
      const { getPanel, getPublishButton, clickAndRunTimers } = setupForPublish(
        profile
      );
      clickAndRunTimers(getPublishButton());
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the menu buttons and the opened panel for an already uploaded profile', () => {
      const { profile } = createSimpleProfile();
      const {
        getPanel,
        container,
        navigateToHash,
        getPublishButton,
        clickAndRunTimers,
      } = setupForPublish(profile);
      navigateToHash('VALID_HASH');
      expect(container).toMatchSnapshot();
      clickAndRunTimers(getPublishButton());
      expect(getPanel()).toMatchSnapshot();
    });

    it('shows the Include preference values checkbox when a PreferenceRead marker is in the profile', () => {
      const { profile } = createPreferenceReadProfile('release');
      const {
        getPublishButton,
        clickAndRunTimers,
        queryPreferenceCheckbox,
      } = setupForPublish(profile);
      clickAndRunTimers(getPublishButton());
      expect(queryPreferenceCheckbox()).toBeTruthy();
    });

    it('does not show the Include preference values checkbox when a PreferenceRead marker is in the profile', () => {
      const { profile } = createSimpleProfile('release');
      const {
        getPublishButton,
        clickAndRunTimers,
        queryPreferenceCheckbox,
      } = setupForPublish(profile);
      clickAndRunTimers(getPublishButton());
      expect(queryPreferenceCheckbox()).toBeFalsy();
    });

    it('can publish and revert', async () => {
      const { profile } = createSimpleProfile();
      const {
        getPublishButton,
        getPanelForm,
        clickAndRunTimers,
        resolveUpload,
        getState,
      } = setupForPublish(profile);
      clickAndRunTimers(getPublishButton());
      fireEvent.submit(getPanelForm());
      resolveUpload('SOME_HASH');

      const revertButton = await screen.findByText(/revert/i);
      expect(getDataSource(getState())).toBe('public');
      expect(getHash(getState())).toBe('SOME_HASH');
      expect(document.body).toMatchSnapshot();

      fireFullClick(revertButton);
      await waitForElementToBeRemoved(revertButton);

      expect(getDataSource(getState())).toBe('from-addon');
      expect(getHash(getState())).toBe('');
    });

    it('can publish, cancel, and then publish again', async () => {
      const { profile } = createSimpleProfile();
      const {
        getPanel,
        getPublishButton,
        findPublishButton,
        getCancelButton,
        getPanelForm,
        clickAndRunTimers,
      } = setupForPublish(profile);
      clickAndRunTimers(getPublishButton());
      fireEvent.submit(getPanelForm());

      // These shouldn't exist anymore.
      expect(() => getPanel()).toThrow();
      expect(() => getPublishButton()).toThrow();

      clickAndRunTimers(getCancelButton());

      // This might be asynchronous, depending on the underlying code.
      expect(await findPublishButton()).toBeTruthy();
    });

    it('matches the snapshot for an error', async () => {
      const { profile } = createSimpleProfile();
      const {
        getPanel,
        getPublishButton,
        getErrorButton,
        getPanelForm,
        rejectUpload,
        clickAndRunTimers,
      } = setupForPublish(profile);

      clickAndRunTimers(getPublishButton());
      fireEvent.submit(getPanelForm());
      rejectUpload('This is a mock error');

      // Wait until the error button is visible.
      await waitFor(() => {
        getErrorButton();
      });

      // Now click the error button, and get a snapshot of the panel.
      clickAndRunTimers(getErrorButton());
      expect(getPanel()).toMatchSnapshot();
    });
  });
});

describe('<MetaInfoPanel>', function() {
  async function setup(profile: Profile) {
    jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function() {
      // eslint-disable-next-line babel/no-invalid-this
      return 'toLocaleString ' + this.toUTCString();
    });

    const store = blankStore();

    // Note that we dispatch this action directly instead of using viewProfile
    // or loadProfile because we want to control tightly how symbolication is
    // started in these tests.
    await store.dispatch(loadProfile(profile, { skipSymbolication: true }));

    return render(
      <Provider store={store}>
        <MetaInfoPanel />
      </Provider>
    );
  }

  it('matches the snapshot', async () => {
    // Using gecko profile because it has metadata and profilerOverhead data in it.
    const profile = processGeckoProfile(createGeckoProfile());
    profile.meta.configuration = {
      features: ['js', 'threads'],
      threads: ['GeckoMain', 'DOM Worker'],
      capacity: Math.pow(2, 14),
      duration: 20,
    };

    const { container } = await setup(profile);
    // This component renders a fragment, so we look at the full container so
    // that we get all children.
    expect(container).toMatchSnapshot();
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

    const { container } = await setup(profile);
    // This component renders a fragment, so we look at the full container so
    // that we get all children.
    expect(container).toMatchSnapshot();
  });

  describe('symbolication', function() {
    type SymbolicationTestConfig = $ReadOnly<{|
      symbolicated: boolean,
    |}>;

    function setupSymbolicationTest(config: SymbolicationTestConfig) {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.symbolicated = config.symbolicated;

      return setup(profile);
    }

    it('handles successfully symbolicated profiles', async () => {
      await setupSymbolicationTest({ symbolicated: true });

      expect(screen.getByText('Profile is symbolicated')).toBeTruthy();
      fireFullClick(screen.getByText('Re-symbolicate profile'));

      expect(symbolicateProfile).toHaveBeenCalled();
      expect(
        screen.getByText('Attempting to re-symbolicate profile')
      ).toBeTruthy();
      // No symbolicate button is available.
      expect(screen.queryByText('Symbolicate profile')).toBeFalsy();
      expect(screen.queryByText('Re-symbolicate profile')).toBeFalsy();

      // After a while, we get a result
      expect(await screen.findByText('Profile is symbolicated')).toBeTruthy();
      expect(screen.getByText('Re-symbolicate profile')).toBeTruthy();
    });

    it('handles the contradictory state of non-symbolicated profiles that are done', async () => {
      await setupSymbolicationTest({ symbolicated: false });

      expect(screen.getByText('Profile is not symbolicated')).toBeTruthy();
      fireFullClick(screen.getByText('Symbolicate profile'));
      expect(symbolicateProfile).toHaveBeenCalled();

      expect(screen.getByText('Currently symbolicating profile')).toBeTruthy();
      // No symbolicate button is available.
      expect(screen.queryByText('Symbolicate profile')).toBeFalsy();
      expect(screen.queryByText('Re-symbolicate profile')).toBeFalsy();

      // After a while, we get a result
      expect(await screen.findByText('Profile is symbolicated')).toBeTruthy();
      expect(screen.getByText('Re-symbolicate profile')).toBeTruthy();
    });
  });

  describe('Full View Button', function() {
    function setup() {
      const { profile } = getProfileFromTextSamples('A');
      const store = storeWithProfile(profile);

      store.dispatch(
        updateUrlState(
          stateFromLocation({
            pathname: '/from-addon',
            search: '',
            hash: '',
          })
        )
      );

      const renderResults = render(
        <Provider store={store}>
          <MenuButtons />
        </Provider>
      );

      return {
        profile,
        ...store,
        ...renderResults,
      };
    }

    it('is not present when we are in the full view already', () => {
      const { getState, queryByText } = setup();

      // Make sure that we are in the full view and the button is not there.
      expect(getTimelineTrackOrganization(getState()).type).toBe('full');
      expect(queryByText('Full View')).toBeFalsy();
    });

    it('is present when we are in the active tab view', () => {
      const { dispatch, getState, getByText, container } = setup();

      dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          browsingContextID: null,
        })
      );

      // Make sure that we are in the active tab view and the button is there.
      expect(getTimelineTrackOrganization(getState()).type).toBe('active-tab');
      expect(getByText('Full View')).toBeTruthy();
      expect(container).toMatchSnapshot();
    });

    it('switches to full view when clicked', () => {
      const { dispatch, getState, getByText, queryByText } = setup();

      dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          browsingContextID: null,
        })
      );

      // Make sure that we are in the active tab view already.
      expect(getTimelineTrackOrganization(getState()).type).toBe('active-tab');
      expect(getByText('Full View')).toBeTruthy();

      // Switch to the full view by clicking on the Full View button
      fireFullClick(getByText('Full View'));

      // Make sure that we are in the full view and the button is no longer there
      expect(getTimelineTrackOrganization(getState()).type).toBe('full');
      expect(queryByText('Full View')).toBeFalsy();
    });
  });
});
