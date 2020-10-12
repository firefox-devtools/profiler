/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { render, getByText as globalGetByText } from '@testing-library/react';

import { ListOfPublishedProfiles } from 'firefox-profiler/components/app/ListOfPublishedProfiles';
import {
  storeProfileData,
  retrieveProfileData,
} from 'firefox-profiler/app-logic/published-profiles-store';
import { ensureExists } from 'firefox-profiler/utils/flow';
import { blankStore } from 'firefox-profiler/test/fixtures/stores';
import { mockDate } from 'firefox-profiler/test/fixtures/mocks/date';
import { fireFullClick } from 'firefox-profiler/test/fixtures/utils';
import { Response } from 'firefox-profiler/test/fixtures/mocks/response';

import 'fake-indexeddb/auto';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';

function resetIndexedDb() {
  // This is the recommended way to reset the IDB state between test runs, but
  // neither flow nor eslint like that we assign to indexedDB directly, for
  // different reasons.
  /* $FlowExpectError */ /* eslint-disable-next-line no-global-assign */
  indexedDB = new FDBFactory();
}
beforeEach(resetIndexedDb);
afterEach(resetIndexedDb);

const listOfProfileInformations = [
  {
    profileToken: '0123456789',
    jwtToken: 'FAKE_TOKEN',
    publishedDate: new Date('4 Jul 2020 14:00'), // "today" earlier
    name: '',
    preset: null,
    originHostname: null,
    meta: {
      product: 'Fennec',
      // Not more meta information, to test that we can handle profiles that
      // don't have this information.
    },
    urlPath: '/',
    publishedRange: { start: 1000, end: 3000 },
  },
  {
    profileToken: 'ABCDEFGHI',
    jwtToken: null,
    publishedDate: new Date('3 Jul 2020 08:00'), // yesterday
    name: 'Layout profile',
    preset: 'web',
    originHostname: null,
    meta: {
      product: 'Firefox',
      platform: 'X11',
      toolkit: 'gtk',
      oscpu: 'Linux x86_64',
      misc: 'rv:68.0',
    },
    urlPath: '/',
    publishedRange: { start: 1000, end: 1005 },
  },
  {
    profileToken: '123abc456',
    jwtToken: null,
    publishedDate: new Date('20 May 2018'), // ancient date
    name: '',
    preset: null,
    originHostname: 'https://www.cnn.com',
    meta: {
      product: 'Firefox Preview',
      platform: 'Android 7.0',
      toolkit: 'android',
      misc: 'rv:80.0',
      oscpu: 'Linux armv7l',
    },
    urlPath:
      '/public/123abc456/calltree/?globalTrackOrder=0-1-2-3-4-5-6-7-8-9-10&hiddenGlobalTracks=1-2-3-4-5-6-7-8-9&localTrackOrderByPid=32027-1-2-0~12629-0~12149-0~11755-0~11945-0~12533-0~11798-0~11862-0~12083-0~12118-0~12298-0-1~&search=bla&thread=11&v=5',
    // This tests ranges that should show up as µs
    publishedRange: { start: 40000, end: 40000.1 },
  },
  {
    profileToken: 'WINDOWS',
    jwtToken: null,
    publishedDate: new Date('4 Jul 2020 13:00'),
    name: 'Another good profile',
    preset: null,
    originHostname: 'https://profiler.firefox.com',
    meta: {
      product: 'Firefox',
      platform: 'Windows',
      toolkit: 'windows',
      misc: 'rv:77.0',
      oscpu: 'Windows NT 10.0; Win64; x64',
    },
    urlPath: '/public/WINDOWS/marker-chart/',
    publishedRange: { start: 2000, end: 40000 },
  },
  {
    profileToken: 'MACOSX',
    jwtToken: null,
    publishedDate: new Date('5 Jul 2020 11:00'), // This is the future!
    name: 'MacOS X profile',
    preset: null,
    originHostname: 'https://mozilla.org',
    meta: {
      product: 'Firefox',
      platform: 'Macintosh',
      toolkit: 'cocoa',
      misc: 'rv:62.0',
      oscpu: 'Intel Mac OS X 10.12',
    },
    urlPath: '/public/MACOSX/marker-chart/',
    publishedRange: { start: 2000, end: 40000 },
  },
];

async function storeProfileInformations(listOfProfileInformations) {
  for (const profileInfo of listOfProfileInformations) {
    await storeProfileData(profileInfo);
  }
}

describe('ListOfPublishedProfiles', () => {
  function setup(props) {
    // Because the rendering is dependent on the timezone, all dates in this
    // test are using a timezone-dependent format so that the rendering is the
    // same in all timezones.
    mockDate('4 Jul 2020 15:00'); // Now is 4th of July, at 3pm local timezone.

    const store = blankStore();
    const renderResult = render(
      <Provider store={store}>
        <ListOfPublishedProfiles withActionButtons={false} {...props} />
      </Provider>
    );

    const { getByText, getByTitle, container } = renderResult;

    function getAllRecordingsLink() {
      // This regexp should match all possible flavor of this link.
      return getByText(/manage.*recording/i);
    }

    function getDeleteButtonForProfile(
      profileName: string
    ): HTMLInputElement | HTMLButtonElement {
      const workingButton = getByTitle(new RegExp(`delete.*${profileName}`));
      if (
        !(workingButton instanceof HTMLInputElement) &&
        !(workingButton instanceof HTMLButtonElement)
      ) {
        throw new Error(
          "Oops, the delete button should be a HTMLInputElement or HTMLButtonElement, but it isn't!"
        );
      }

      return workingButton;
    }

    function getConfirmDeleteButton() {
      const panelContent = ensureExists(
        container.querySelector('.arrowPanelContent'),
        "Expected that an ArrowPanel was rendered, but it's not there."
      );
      const confirmButton = globalGetByText(panelContent, 'Delete');
      if (
        !(confirmButton instanceof HTMLInputElement) &&
        !(confirmButton instanceof HTMLButtonElement)
      ) {
        throw new Error(
          "Oops, the confirm button should be a HTMLInputElement or HTMLButtonElement, but it isn't!"
        );
      }

      return confirmButton;
    }

    function getCancelDeleteButton() {
      const panelContent = ensureExists(
        container.querySelector('.arrowPanelContent'),
        "Expected that an ArrowPanel was rendered, but it's not there."
      );
      const confirmButton = globalGetByText(panelContent, 'Cancel');
      if (
        !(confirmButton instanceof HTMLInputElement) &&
        !(confirmButton instanceof HTMLButtonElement)
      ) {
        throw new Error(
          "Oops, the confirm button should be a HTMLInputElement or HTMLButtonElement, but it isn't!"
        );
      }

      return confirmButton;
    }

    return {
      ...renderResult,
      getAllRecordingsLink,
      getDeleteButtonForProfile,
      getConfirmDeleteButton,
      getCancelDeleteButton,
    };
  }

  it('limits the number of rendered profiles with the limit prop', async () => {
    // 1. Add some profiles to the local indexeddb.
    await storeProfileInformations(listOfProfileInformations);

    // 2. Render the component and test.
    const { container, findByText, getAllRecordingsLink } = setup({ limit: 3 });
    await findByText(/macOS/);
    expect(container.querySelectorAll('li')).toHaveLength(3);
    getAllRecordingsLink(); // This shouldn't throw.
    // Note: we're testing on `container` instead of `container.firstChild`
    // because this component renders a fragment with several HTML elements.
    expect(container).toMatchSnapshot();
  });

  it('still displays the link to all recordings when there is 3 profiles or less', async () => {
    await storeProfileInformations(listOfProfileInformations.slice(0, 3));
    const { container, findByText, getAllRecordingsLink } = setup({ limit: 3 });
    await findByText(/Layout profile/);
    getAllRecordingsLink(); // This shouldn't throw.
    // Note: we're testing on `container` instead of `container.firstChild`
    // because this component renders a fragment with several HTML elements.
    expect(container).toMatchSnapshot();
  });

  it('still displays the link to all recordings when there is only 1 profile', async () => {
    await storeProfileInformations(listOfProfileInformations.slice(0, 1));
    const { container, findByText, getAllRecordingsLink } = setup({ limit: 3 });
    await findByText(/Fennec/);
    getAllRecordingsLink(); // This shouldn't throw.
    // Note: we're testing on `container` instead of `container.firstChild`
    // because this component renders a fragment with several HTML elements.
    expect(container).toMatchSnapshot();
  });

  it('renders a generic message when there is no profiles', async () => {
    const { container, findByText, getAllRecordingsLink } = setup({ limit: 3 });
    await findByText(/no profile/i);
    expect(() => getAllRecordingsLink()).toThrow('Unable to find an element');
    // Note: we're testing on `container` instead of `container.firstChild`
    // because this component renders a fragment with several HTML elements.
    expect(container).toMatchSnapshot();
  });

  it('renders action buttons when appropriate', async () => {
    await storeProfileInformations(listOfProfileInformations);
    const {
      container,
      findByText,
      getAllByText,
      getDeleteButtonForProfile,
    } = setup({
      withActionButtons: true,
    });

    // Wait for the full rendering with a find* operation.
    await findByText(/macOS/);

    // Only this button isn't disabled, because it's the only one with the JWT information.
    const workingButton = getDeleteButtonForProfile('#012345');
    expect(workingButton.disabled).toBe(false);

    // All others are disabled.
    const allButtons = getAllByText('Delete');
    for (const button of allButtons) {
      if (button !== workingButton) {
        // $FlowExpectError findAllByText returns HTMLElement, but we know these are buttons.
        expect(button.disabled).toBe(true); // eslint-disable-line jest/no-conditional-expect
      }
    }

    // Note: we're testing on `container` instead of `container.firstChild`
    // because this component renders a fragment with several HTML elements.
    expect(container).toMatchSnapshot();
  });

  describe('profile deletion', () => {
    beforeEach(() => {
      window.fetch = jest.fn();
    });

    afterEach(() => {
      delete window.fetch;
    });

    function mockFetchForDeleteProfile({
      endpointUrl,
      jwtToken,
    }: {
      endpointUrl: string,
      jwtToken: string,
    }) {
      window.fetch.mockImplementation(async (urlString, options) => {
        if (urlString !== endpointUrl) {
          return new Response(null, { status: 404, statusText: 'Not found' });
        }

        const { method, headers } = options;

        if (method !== 'DELETE') {
          return new Response(null, {
            status: 405,
            statusText: 'Method not allowed',
          });
        }

        if (
          headers['Content-Type'] !== 'application/json' ||
          headers.Accept !== 'application/vnd.firefox-profiler+json;version=1.0'
        ) {
          return new Response(null, {
            status: 406,
            statusText: 'Not acceptable',
          });
        }

        if (headers.Authorization !== `Bearer ${jwtToken}`) {
          return new Response(null, {
            status: 401,
            statusText: 'Forbidden',
          });
        }

        return new Response('Profile successfully deleted.', { status: 200 });
      });
    }

    it('can delete profiles', async () => {
      const { profileToken, jwtToken } = listOfProfileInformations[0];
      const endpointUrl = `https://api.profiler.firefox.com/profile/${profileToken}`;
      mockFetchForDeleteProfile({ endpointUrl, jwtToken });

      jest.useFakeTimers(); // ButtonWithPanel has some asynchronous behavior.
      await storeProfileInformations(listOfProfileInformations);
      const {
        container,
        getDeleteButtonForProfile,
        findByText,
        queryByText,
        getConfirmDeleteButton,
      } = setup({
        withActionButtons: true,
      });

      // Wait for the full rendering with a find* operation.
      await findByText(/macOS/);
      const workingButton = getDeleteButtonForProfile('#012345');

      // Click on the delete button
      fireFullClick(workingButton);
      jest.runAllTimers(); // Opening the panel involves a timeout.
      expect(container.querySelector('.arrowPanelContent')).toMatchSnapshot();

      // Click on the confirm button
      fireFullClick(getConfirmDeleteButton());
      await findByText(/successfully/i);
      expect(await retrieveProfileData(profileToken)).toBe(undefined);

      // Clicking elsewhere should make the successful message disappear.
      fireFullClick((window: any));
      expect(queryByText(/successfully/i)).toBe(null);
    });

    it('can cancel the deletion', async () => {
      const { profileToken } = listOfProfileInformations[0];

      jest.useFakeTimers(); // ButtonWithPanel has some asynchronous behavior.
      await storeProfileInformations(listOfProfileInformations);
      const {
        getDeleteButtonForProfile,
        findByText,
        queryByText,
        getCancelDeleteButton,
      } = setup({
        withActionButtons: true,
      });

      // Wait for the full rendering with a find* operation.
      await findByText(/macOS/);
      const workingButton = getDeleteButtonForProfile('#012345');

      // Click on the delete button
      fireFullClick(workingButton);
      jest.runAllTimers(); // Opening the panel involves a timeout.

      // Click on the cancel button
      fireFullClick(getCancelDeleteButton());
      jest.runAllTimers(); // Closing the panel involves a timeout too.
      expect(queryByText(/are you sure/i)).toBe(null);
      expect(await retrieveProfileData(profileToken)).toEqual(
        listOfProfileInformations[0]
      );
    });

    it('renders a generic message when the final profile on the list has been deleted', async () => {
      const { profileToken, jwtToken } = listOfProfileInformations[0];
      const endpointUrl = `https://api.profiler.firefox.com/profile/${profileToken}`;
      mockFetchForDeleteProfile({ endpointUrl, jwtToken });

      jest.useFakeTimers(); // ButtonWithPanel has some asynchronous behavior.
      await storeProfileInformations(listOfProfileInformations.slice(0, 1));
      const {
        container,
        getDeleteButtonForProfile,
        findByText,
        queryByText,
        getConfirmDeleteButton,
      } = setup({
        withActionButtons: true,
      });

      // Wait for the full rendering with a find* operation.
      await findByText(/Fennec/);
      const workingButton = getDeleteButtonForProfile('#012345');

      // Click on the delete button
      fireFullClick(workingButton);
      jest.runAllTimers(); // Opening the panel involves a timeout.
      expect(container.querySelector('.arrowPanelContent')).toMatchSnapshot();

      // Click on the confirm button
      fireFullClick(getConfirmDeleteButton());
      await findByText(/successfully/i);

      // Clicking elsewhere should make the successful message disappear and a generic message appear.
      fireFullClick((window: any));
      await findByText(/no profile/i);
      expect(queryByText(/no profile/i)).toBeTruthy();
    });

    it('can handle errors', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { profileToken } = listOfProfileInformations[0];
      const endpointUrl = `https://api.profiler.firefox.com/profile/${profileToken}`;
      mockFetchForDeleteProfile({
        endpointUrl,
        jwtToken: 'THIS_TOKEN_IS_UNKNOWN',
      });

      jest.useFakeTimers(); // ButtonWithPanel has some asynchronous behavior.
      await storeProfileInformations(listOfProfileInformations);
      const {
        getDeleteButtonForProfile,
        findByText,
        getByText,
        getConfirmDeleteButton,
      } = setup({
        withActionButtons: true,
      });

      // Wait for the full rendering with a find* operation.
      await findByText(/macOS/);
      const workingButton = getDeleteButtonForProfile('#012345');

      fireFullClick(workingButton);
      jest.runAllTimers(); // Opening the panel involves a timeout.

      fireFullClick(getConfirmDeleteButton());
      await findByText(/An error happened/i);
      const hoverLink = getByText(/Hover to know more/);
      expect(hoverLink.title).toEqual(
        'An error happened while deleting the profile with the token "0123456789": Forbidden (401)'
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringMatching(/when we tried to delete a profile/),
        expect.any(Error)
      );
      expect(await retrieveProfileData(profileToken)).toEqual(
        listOfProfileInformations[0]
      );
    });
  });

  describe('The uploaded recordings list should update on window focus', () => {
    it('will update the stored profiles on window focus', async function() {
      // Add 3 examples, all with the same name.
      // mockDate('4 Jul 2020 15:00'); // Now is 4th of July, at 3pm local timezone.

      const exampleProfileData = {
        profileToken: 'MACOSX',
        jwtToken: null,
        publishedDate: new Date('4 Jul 2020 13:00'),
        name: 'PROFILE',
        preset: null,
        originHostname: 'https://mozilla.org',
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

      await storeProfileData({
        ...exampleProfileData,
        profileToken: 'PROFILE-1',
      });
      await storeProfileData({
        ...exampleProfileData,
        profileToken: 'PROFILE-2',
      });
      await storeProfileData({
        ...exampleProfileData,
        profileToken: 'PROFILE-3',
      });

      const { findAllByText } = setup();
      expect(await findAllByText(/PROFILE/)).toHaveLength(3);

      // Add one more.
      await storeProfileData({
        ...exampleProfileData,
        profileToken: 'PROFILE-4',
        name: 'NEW-PROFILE', // Adding with a new name so that we can look it up.
      });

      // Nothing is updated yet: looking for the new profile name will throw.
      await expect(() => findAllByText(/NEW-PROFILE/)).rejects.toThrow(
        /Unable to find an element with the text/
      );
      expect(await findAllByText(/PROFILE/)).toHaveLength(3);

      // The new profile is now listed.
      window.dispatchEvent(new Event('focus'));
      await findAllByText(/NEW-PROFILE/);
      expect(await findAllByText(/PROFILE/)).toHaveLength(4);
    });
  });
});
