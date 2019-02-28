/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import MenuButtons from '../../components/app/MenuButtons';
import { render, fireEvent, waitForDomChange } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import {
  startSymbolicating,
  doneSymbolicating,
} from '../../actions/receive-profile';
import { TextEncoder } from 'util';
import * as ProfileViewSelectors from '../../selectors/profile';

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

describe('app/MenuButtons', function() {
  function setup(profile) {
    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <MenuButtons />
      </Provider>
    );

    const { getByTestId, getByValue } = renderResult;
    const getShareButton = () => getByValue('Share...');
    const getInnerShareButton = () => getByValue('Share');
    const getShareWithUrlsButton = () => getByValue('Share with URLs');
    const getInnerShareWithUrlsButton = (): null | HTMLElement => {
      const shareWithUrlsButton = getShareWithUrlsButton();
      if (
        shareWithUrlsButton.parentElement !== undefined &&
        shareWithUrlsButton.parentElement !== null &&
        shareWithUrlsButton.parentElement.nextElementSibling !== undefined &&
        shareWithUrlsButton.parentElement.nextElementSibling !== null
      ) {
        return shareWithUrlsButton.parentElement.nextElementSibling.getElementsByClassName(
          'arrowPanelOkButton'
        )[0];
      }
      return null;
    };

    const getMenuButtonsContainer = () =>
      getByTestId('menuButtonsCompositeButtonContainer');
    const getPermalinkButton = () => getByValue('Permalink');

    return {
      store,
      ...renderResult,
      getShareButton,
      getInnerShareButton,
      getShareWithUrlsButton,
      getInnerShareWithUrlsButton,
      getMenuButtonsContainer,
      getPermalinkButton,
    };
  }

  describe('share and save buttons', function() {
    // Mock hash
    const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';

    beforeAll(function() {
      if ((window: any).TextEncoder) {
        throw new Error('A TextEncoder was already on the window object.');
      }
      (window: any).TextEncoder = TextEncoder;
    });

    afterAll(async function() {
      delete (window: any).TextEncoder;
    });

    beforeEach(function() {
      // Flow doesn't know uploadBinaryProfileData is a jest mock.
      (uploadBinaryProfileData: any).mockImplementation(() =>
        Promise.resolve(hash)
      );
      // Flow doesn't know sha1 is a jest mock.
      (sha1: any).mockImplementation((_data: Uint8Array) =>
        Promise.resolve(hash)
      );
      // Flow doesn't know shortenUrl is a jest mock.
      (shortenUrl: any).mockImplementation(() =>
        Promise.resolve('https://profiler.firefox.com/')
      );
    });

    it('matches the snapshot when starting to symbolicate', () => {
      const { store, container } = setup();
      store.dispatch(startSymbolicating());

      // MenuButtons is rendering a fragment with several children. We need to
      // check all children to assess that the component renders properly.
      expect(Array.from(container.children)).toMatchSnapshot();
    });

    it('matches the snapshot when done symbolicating', () => {
      const { store, container } = setup();
      store.dispatch(startSymbolicating());
      store.dispatch(doneSymbolicating());
      expect(Array.from(container.children)).toMatchSnapshot();
    });

    it('should share the profile when Share button is clicked', async () => {
      const {
        store,
        getShareButton,
        getShareWithUrlsButton,
        getInnerShareButton,
        getInnerShareWithUrlsButton,
        getMenuButtonsContainer,
      } = setup();
      // Sharing without URLs
      fireEvent.click(getShareButton());
      fireEvent.click(getInnerShareButton());

      // This part touches the implementation logic by getting the menu buttons
      // container and checking its class list. The ideal way is not to touch
      // the implementation logic of component and test the things user can see
      // and interract with `waitForElement`. But since sharing is async and we
      // can't catch other visual DOM changes here, we had to do this.
      await waitForDomChange({
        container: getMenuButtonsContainer(),
        mutationObserverOptions: { attributes: true },
      }).then(mutationsList => {
        const mutation = mutationsList[0];
        expect(
          mutation.target.classList.contains('currentButtonIsPermalinkButton')
        ).toEqual(true);
        expect(
          mutation.target.classList.contains('currentButtonIsShareButton')
        ).toEqual(false);
        expect(
          mutation.target.classList.contains(
            'currentButtonIsSecondaryShareButton'
          )
        ).toEqual(true);
      });

      const profileSharingStatus = ProfileViewSelectors.getProfileSharingStatus(
        store.getState()
      );
      expect(profileSharingStatus).toEqual({
        sharedWithUrls: false,
        sharedWithoutUrls: true,
      });

      // Sharing with URLs this time
      const innerShareButton = getInnerShareWithUrlsButton();
      if (innerShareButton !== null) {
        fireEvent.click(getShareWithUrlsButton());
        fireEvent.click(innerShareButton);
      }

      await waitForDomChange({
        container: getMenuButtonsContainer(),
        mutationObserverOptions: { attributes: true },
      }).then(mutationsList => {
        const mutation = mutationsList[0];
        expect(
          mutation.target.classList.contains('currentButtonIsPermalinkButton')
        ).toEqual(true);
        expect(
          mutation.target.classList.contains('currentButtonIsShareButton')
        ).toEqual(false);
        expect(
          mutation.target.classList.contains(
            'currentButtonIsSecondaryShareButton'
          )
        ).toEqual(false);
      });

      const newProfileSharingStatus = ProfileViewSelectors.getProfileSharingStatus(
        store.getState()
      );
      expect(newProfileSharingStatus).toEqual({
        sharedWithUrls: true,
        sharedWithoutUrls: true,
      });
    });
  });
});
