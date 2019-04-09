/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import MenuButtons from '../../components/app/MenuButtons';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { TextEncoder } from 'util';
import { stateFromLocation } from '../../app-logic/url-handling';
import { ensureExists } from '../../utils/flow';
import { getProfile } from '../../selectors/profile';

// Mocking SymbolStoreDB
import { uploadBinaryProfileData } from '../../profile-logic/profile-store';
jest.mock('../../profile-logic/profile-store');

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

    // Flow doesn't know uploadBinaryProfileData is a jest mock.
    (uploadBinaryProfileData: any).mockImplementation(
      (() => ({
        abortFunction: () => {},
        startUpload: () => promise,
      }): typeof uploadBinaryProfileData)
    );

    return { resolveUpload, rejectUpload };
  }

  function setup(updateChannel = 'release') {
    const store = storeWithProfile();
    const profile = getProfile(store.getState());
    profile.meta.updateChannel = updateChannel;
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

    const { container, getByTestId, getByText } = renderResult;
    const getPublishButton = () => getByText('Publish…');
    const getPanelForm = () =>
      ensureExists(
        container.querySelector('form'),
        'Could not find the form in the panel'
      );
    const getPanel = () => getByTestId('MenuButtonsPublish-container');

    return {
      store,
      ...renderResult,
      getPanel,
      getPublishButton,
      getPanelForm,
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
      const { container } = setup();
      expect(container).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a nightly profile', () => {
      const { getPanel, getPublishButton } = setup('nightly');
      fireEvent.click(getPublishButton());
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a release profile', () => {
      const { getPanel, getPublishButton } = setup('release');
      fireEvent.click(getPublishButton());
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the uploading panel', () => {
      const { getPanel, getPublishButton, getPanelForm } = setup();
      fireEvent.click(getPublishButton());
      fireEvent.submit(getPanelForm());
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the completed upload panel', () => {
      const {
        getPanel,
        getPublishButton,
        getPanelForm,
        resolveUpload,
      } = setup();
      fireEvent.click(getPublishButton());
      fireEvent.submit(getPanelForm());
      resolveUpload();
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for an error', () => {
      const {
        getPanel,
        getPublishButton,
        getPanelForm,
        rejectUpload,
      } = setup();
      fireEvent.click(getPublishButton());
      fireEvent.submit(getPanelForm());
      rejectUpload('This is a mock error');
      expect(getPanel()).toMatchSnapshot();
    });
  });
});
