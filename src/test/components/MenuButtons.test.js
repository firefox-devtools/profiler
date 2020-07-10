/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import MenuButtons from '../../components/app/MenuButtons';
import { MenuButtonsMetaInfo } from '../../components/app/MenuButtons/MetaInfo';
import { render, fireEvent, wait } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { TextEncoder } from 'util';
import { stateFromLocation } from '../../app-logic/url-handling';
import { ensureExists } from '../../utils/flow';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { processProfile } from '../../profile-logic/process-profile';
import type { Profile, SymbolicationStatus } from 'firefox-profiler/types';

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

// Mock hash
const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';

describe('app/MenuButtons', function() {
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
    });

    // Flow doesn't know uploadBinaryProfileData is a jest mock.
    (uploadBinaryProfileData: any).mockImplementation(
      (() => ({
        abortFunction: () => {
          // In the real implementation, we call xhr.abort, hwich in turn
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

  function createSimpleProfile(updateChannel = 'release') {
    const { profile } = getProfileFromTextSamples('A');
    profile.meta.updateChannel = updateChannel;
    return { profile };
  }

  function createPreferenceReadProfile(updateChannel = 'release') {
    const profile = getProfileWithMarkers([
      [
        'PreferenceRead',
        1,
        {
          type: 'PreferenceRead',
          startTime: 0,
          endTime: 1,
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
    const { resolveUpload, rejectUpload } = mockUpload();

    store.dispatch({
      type: 'UPDATE_URL_STATE',
      newUrlState: stateFromLocation({
        pathname: '/from-addon',
        search: '',
        hash: '',
      }),
    });

    const renderResult = render(
      <Provider store={store}>
        <MenuButtons />
      </Provider>
    );

    const { container, getByTestId, getByText, queryByText } = renderResult;
    const getPublishButton = () => getByText('Publish…');
    const getErrorButton = () => getByText('Error publishing…');
    const getCancelButton = () => getByText('Cancel Upload');
    const getPanelForm = () =>
      ensureExists(
        container.querySelector('form'),
        'Could not find the form in the panel'
      );
    const queryPreferenceCheckbox = () =>
      queryByText('Include preference values');
    const getPanel = () => getByTestId('MenuButtonsPublish-container');
    const clickAndRunTimers = where => {
      fireEvent.click(where);
      jest.runAllTimers();
    };

    return {
      store,
      ...renderResult,
      getPanel,
      getPublishButton,
      getErrorButton,
      getCancelButton,
      getPanelForm,
      queryPreferenceCheckbox,
      clickAndRunTimers,
      resolveUpload,
      rejectUpload,
    };
  }

  describe('<Publish>', function() {
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
      const { container } = setup(profile);
      expect(container).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a nightly profile', () => {
      const { profile } = createSimpleProfile('nightly');
      const { getPanel, getPublishButton, clickAndRunTimers } = setup(profile);
      clickAndRunTimers(getPublishButton());
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a release profile', () => {
      const { profile } = createSimpleProfile('release');
      const { getPanel, getPublishButton, clickAndRunTimers } = setup(profile);
      clickAndRunTimers(getPublishButton());
      expect(getPanel()).toMatchSnapshot();
    });

    it('shows the Include preference values checkbox when a PreferenceRead marker is in the profile', () => {
      const { profile } = createPreferenceReadProfile('release');
      const {
        getPublishButton,
        clickAndRunTimers,
        queryPreferenceCheckbox,
      } = setup(profile);
      clickAndRunTimers(getPublishButton());
      expect(queryPreferenceCheckbox()).toBeTruthy();
    });

    it('does not show the Include preference values checkbox when a PreferenceRead marker is in the profile', () => {
      const { profile } = createSimpleProfile('release');
      const {
        getPublishButton,
        clickAndRunTimers,
        queryPreferenceCheckbox,
      } = setup(profile);
      clickAndRunTimers(getPublishButton());
      expect(queryPreferenceCheckbox()).toBeFalsy();
    });

    it('can publish, cancel, and then publish again', async () => {
      const { profile } = createSimpleProfile();
      const {
        getPanel,
        getPublishButton,
        getCancelButton,
        getPanelForm,
        clickAndRunTimers,
      } = setup(profile);
      clickAndRunTimers(getPublishButton());
      fireEvent.submit(getPanelForm());

      // These shouldn't exist anymore.
      expect(() => getPanel()).toThrow();
      expect(() => getPublishButton()).toThrow();

      clickAndRunTimers(getCancelButton());

      // This might be asynchronous, depending on the underlying code.
      await wait(() => {
        getPublishButton();
      });
      expect(getPublishButton()).toBeTruthy();
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
      } = setup(profile);

      clickAndRunTimers(getPublishButton());
      fireEvent.submit(getPanelForm());
      rejectUpload('This is a mock error');

      // Wait until the error button is visible.
      await wait(() => {
        getErrorButton();
      });

      // Now click the error button, and get a snapshot of the panel.
      clickAndRunTimers(getErrorButton());
      expect(getPanel()).toMatchSnapshot();
    });
  });
});

describe('<MenuButtonsMetaInfo>', function() {
  function setup(profile: Profile, symbolicationStatus = 'DONE') {
    jest.useFakeTimers();
    jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function() {
      // eslint-disable-next-line babel/no-invalid-this
      return 'toLocaleString ' + this.toUTCString();
    });
    const store = storeWithProfile(profile);
    const resymbolicateProfile = jest.fn();

    const renderResults = render(
      <Provider store={store}>
        <MenuButtonsMetaInfo
          profile={profile}
          resymbolicateProfile={resymbolicateProfile}
          symbolicationStatus={symbolicationStatus}
        />
      </Provider>
    );

    return {
      store,
      resymbolicateProfile,
      renderResults,
      ...renderResults,
    };
  }

  it('matches the snapshot', async () => {
    // Using gecko profile because it has metadata and profilerOverhead data in it.
    const profile = processProfile(createGeckoProfile());
    profile.meta.configuration = {
      features: ['js', 'threads'],
      threads: ['GeckoMain', 'DOM Worker'],
      capacity: Math.pow(2, 14),
      duration: 20,
    };

    const { container, getByValue } = setup(profile);
    const metaInfoButton = getByValue('Firefox 48 – macOS 10.11');
    fireEvent.click(metaInfoButton);
    jest.runAllTimers();

    expect(container.firstChild).toMatchSnapshot();
  });

  it('with no statistics object should not make the app crash', async () => {
    // Using gecko profile because it has metadata and profilerOverhead data in it.
    const profile = processProfile(createGeckoProfile());
    // We are removing statistics objects from all overhead objects to test
    // the robustness of our handling code.
    if (profile.profilerOverhead) {
      for (const overhead of profile.profilerOverhead) {
        delete overhead.statistics;
      }
    }

    const { getByValue, container } = setup(profile);

    const metaInfoButton = getByValue('Firefox 48 – macOS 10.11');
    fireEvent.click(metaInfoButton);
    jest.runAllTimers();

    expect(container.firstChild).toMatchSnapshot();
  });

  describe('symbolication', function() {
    type SymbolicationTestConfig = {|
      symbolicated: boolean,
      symbolicationStatus: SymbolicationStatus,
    |};

    function setupSymbolicationTest(config: SymbolicationTestConfig) {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.symbolicated = config.symbolicated;

      const setupResult = setup(profile, config.symbolicationStatus);

      // Open up the arrow panel for the test.
      const { getByValue } = setupResult;
      fireEvent.click(getByValue('Firefox'));
      jest.runAllTimers();

      return setupResult;
    }

    it('handles successfully symbolicated profiles', () => {
      const { getByText, resymbolicateProfile } = setupSymbolicationTest({
        symbolicated: true,
        symbolicationStatus: 'DONE',
      });

      expect(getByText('Profile is symbolicated')).toBeTruthy();
      getByText('Re-symbolicate profile').click();
      expect(resymbolicateProfile).toHaveBeenCalled();
    });

    it('handles the contradictory state of non-symbolicated profiles that are done', () => {
      const { getByText, resymbolicateProfile } = setupSymbolicationTest({
        symbolicated: false,
        symbolicationStatus: 'DONE',
      });

      expect(getByText('Profile is not symbolicated')).toBeTruthy();
      getByText('Symbolicate profile').click();
      expect(resymbolicateProfile).toHaveBeenCalled();
    });

    it('handles in progress symbolication', () => {
      const { getByText, queryByText } = setupSymbolicationTest({
        symbolicated: false,
        symbolicationStatus: 'SYMBOLICATING',
      });

      expect(getByText('Currently symbolicating profile')).toBeTruthy();
      // No symbolicate button is available.
      expect(queryByText('Symbolicate profile')).toBeFalsy();
      expect(queryByText('Re-symbolicate profile')).toBeFalsy();
    });

    it('handles in progress re-symbolication', () => {
      const { getByText, queryByText } = setupSymbolicationTest({
        symbolicated: true,
        symbolicationStatus: 'SYMBOLICATING',
      });

      expect(getByText('Attempting to re-symbolicate profile')).toBeTruthy();
      // No symbolicate button is available.
      expect(queryByText('Symbolicate profile')).toBeFalsy();
      expect(queryByText('Re-symbolicate profile')).toBeFalsy();
    });
  });
});
