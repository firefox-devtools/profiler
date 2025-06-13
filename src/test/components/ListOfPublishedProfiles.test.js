/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';
import {
  getByText as globalGetByText,
  waitForElementToBeRemoved,
  screen,
} from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { ListOfPublishedProfiles } from 'firefox-profiler/components/app/ListOfPublishedProfiles';
import {
  persistUploadedProfileInformationToDb,
  retrieveUploadedProfileInformationFromDb,
} from 'firefox-profiler/app-logic/uploaded-profiles-db';
import { changeProfileName } from 'firefox-profiler/actions/profile-view';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';
import { ensureExists } from 'firefox-profiler/utils/flow';

import { blankStore } from 'firefox-profiler/test/fixtures/stores';
import { mockDate } from 'firefox-profiler/test/fixtures/mocks/date';
import { fireFullClick } from 'firefox-profiler/test/fixtures/utils';

import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

const listOfProfileInformations = [
  {
    profileToken: '0123456789',
    jwtToken: 'FAKE_TOKEN',
    publishedDate: new Date('4 Jul 2020 14:00'), // "today" earlier
    name: '',
    preset: null,
    meta: {
      product: 'Fennec',
      // Not more meta information, to test that we can handle profiles that
      // don't have this information.
    },
    urlPath: '/public/0123456789/',
    publishedRange: { start: 1000, end: 3000 },
  },
  {
    profileToken: 'ABCDEFGHI',
    jwtToken: null,
    publishedDate: new Date('3 Jul 2020 08:00'), // yesterday
    name: 'Layout profile',
    preset: 'web',
    meta: {
      product: 'Firefox',
      platform: 'X11',
      toolkit: 'gtk',
      oscpu: 'Linux x86_64',
      misc: 'rv:68.0',
    },
    urlPath: '/public/ABCDEFGHI/',
    publishedRange: { start: 1000, end: 1005 },
  },
  {
    profileToken: '123abc456',
    jwtToken: null,
    publishedDate: new Date('20 May 2018'), // ancient date
    name: '',
    preset: null,
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
    await persistUploadedProfileInformationToDb(profileInfo);
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

    function getAllRecordingsLink() {
      // This regexp should match all possible flavor of this link.
      return screen.getByText(/manage.*recording/i);
    }

    function getDeleteButtonForProfile(
      profileName: string
    ): HTMLInputElement | HTMLButtonElement {
      const workingButton = screen.getByTitle(
        new RegExp(`delete.*${profileName}`)
      );
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
        document.querySelector('.arrowPanelContent'),
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
        document.querySelector('.arrowPanelContent'),
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

    async function waitForConfirmationPanel() {
      await screen.findByText(/Are you sure you want to delete uploaded data/);
      return ensureExists(document.querySelector('.arrowPanelContent'));
    }

    return {
      ...renderResult,
      getAllRecordingsLink,
      getDeleteButtonForProfile,
      getConfirmDeleteButton,
      getCancelDeleteButton,
      waitForConfirmationPanel,
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
    const { container, findByText, getAllByText, getDeleteButtonForProfile } =
      setup({
        withActionButtons: true,
      });

    // Wait for the full rendering with a find* operation.
    await findByText(/macOS/);

    // Only this button isn't disabled, because it's the only one with the JWT information.
    const workingButton = getDeleteButtonForProfile('#012345');
    expect(workingButton).toBeEnabled();

    // All others are disabled.
    const allButtons = getAllByText('Delete');
    for (const button of allButtons) {
      if (button !== workingButton) {
        expect(button).toBeDisabled(); // eslint-disable-line jest/no-conditional-expect
      }
    }

    // Note: we're testing on `container` instead of `container.firstChild`
    // because this component renders a fragment with several HTML elements.
    expect(container).toMatchSnapshot();
  });

  describe('profile deletion', () => {
    function mockFetchForDeleteProfile({
      endpointUrl,
      jwtToken,
    }: {
      endpointUrl: string,
      jwtToken: string,
    }) {
      window.fetchMock
        .catch(404) // Catchall
        .route(endpointUrl, ({ options }) => {
          const { method, headers } = options;
          if (method !== 'delete') {
            return new Response(null, {
              status: 405,
              statusText: 'Method not allowed',
            });
          }

          if (
            headers['content-type'] !== 'application/json' ||
            headers.accept !==
              'application/vnd.firefox-profiler+json;version=1.0'
          ) {
            return new Response(null, {
              status: 406,
              statusText: 'Not acceptable',
            });
          }

          if (headers.authorization !== `Bearer ${jwtToken}`) {
            return new Response(null, {
              status: 401,
              statusText: 'Forbidden',
            });
          }

          return new Response('Profile successfully deleted.', {
            status: 200,
          });
        });
    }

    it('can delete profiles', async () => {
      const { profileToken, jwtToken } = listOfProfileInformations[0];
      const endpointUrl = `https://api.profiler.firefox.com/profile/${profileToken}`;
      mockFetchForDeleteProfile({ endpointUrl, jwtToken });

      await storeProfileInformations(listOfProfileInformations);
      const {
        getDeleteButtonForProfile,
        getConfirmDeleteButton,
        waitForConfirmationPanel,
      } = setup({
        withActionButtons: true,
      });

      // Wait for the full rendering with a find* operation.
      await screen.findByText(/macOS/);
      const workingButton = getDeleteButtonForProfile('#012345');

      // Click on the delete button
      fireFullClick(workingButton);
      const confirmationPanel = await waitForConfirmationPanel();
      expect(confirmationPanel).toMatchSnapshot();

      // Click on the confirm button
      fireFullClick(getConfirmDeleteButton());
      await screen.findByText(/successfully/i);
      expect(await retrieveUploadedProfileInformationFromDb(profileToken)).toBe(
        null
      );

      // Clicking elsewhere should make the successful message disappear.
      fireFullClick((window: any));
      await waitForElementToBeRemoved(screen.queryByText(/successfully/i));
    });

    it('can cancel the deletion', async () => {
      const { profileToken } = listOfProfileInformations[0];

      await storeProfileInformations(listOfProfileInformations);
      const {
        getDeleteButtonForProfile,
        getCancelDeleteButton,
        waitForConfirmationPanel,
      } = setup({
        withActionButtons: true,
      });

      // Wait for the full rendering with a find* operation.
      await screen.findByText(/macOS/);
      const workingButton = getDeleteButtonForProfile('#012345');

      // Click on the delete button
      fireFullClick(workingButton);
      const confirmationPanel = await waitForConfirmationPanel();

      // Click on the cancel button
      fireFullClick(getCancelDeleteButton());
      await waitForElementToBeRemoved(confirmationPanel);
      expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
      expect(
        await retrieveUploadedProfileInformationFromDb(profileToken)
      ).toEqual(listOfProfileInformations[0]);
    });

    it('renders a generic message when the final profile on the list has been deleted', async () => {
      const { profileToken, jwtToken } = listOfProfileInformations[0];
      const endpointUrl = `https://api.profiler.firefox.com/profile/${profileToken}`;
      mockFetchForDeleteProfile({ endpointUrl, jwtToken });

      await storeProfileInformations(listOfProfileInformations.slice(0, 1));
      const {
        getDeleteButtonForProfile,
        getConfirmDeleteButton,
        waitForConfirmationPanel,
      } = setup({
        withActionButtons: true,
      });

      // Wait for the full rendering with a find* operation.
      await screen.findByText(/Fennec/);
      const workingButton = getDeleteButtonForProfile('#012345');

      // Click on the delete button
      fireFullClick(workingButton);
      const confirmationPanel = await waitForConfirmationPanel();
      expect(confirmationPanel).toMatchSnapshot();

      // Click on the confirm button
      fireFullClick(getConfirmDeleteButton());
      await screen.findByText(/successfully/i);

      // Clicking elsewhere should make the successful message disappear and a generic message appear.
      fireFullClick((window: any));
      await screen.findByText(/no profile/i);
      expect(screen.getByText(/no profile/i)).toBeInTheDocument();
    });

    it('can handle errors', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { profileToken } = listOfProfileInformations[0];
      const endpointUrl = `https://api.profiler.firefox.com/profile/${profileToken}`;
      mockFetchForDeleteProfile({
        endpointUrl,
        jwtToken: 'THIS_TOKEN_IS_UNKNOWN',
      });

      await storeProfileInformations(listOfProfileInformations);
      const {
        getDeleteButtonForProfile,
        findByText,
        getByText,
        getConfirmDeleteButton,
        waitForConfirmationPanel,
      } = setup({
        withActionButtons: true,
      });

      // Wait for the full rendering with a find* operation.
      await findByText(/macOS/);
      const workingButton = getDeleteButtonForProfile('#012345');

      fireFullClick(workingButton);
      await waitForConfirmationPanel();

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
      expect(
        await retrieveUploadedProfileInformationFromDb(profileToken)
      ).toEqual(listOfProfileInformations[0]);
    });
  });

  describe('The uploaded recordings list should update on window focus', () => {
    it('will update the stored profiles on window focus', async function () {
      // Add 3 examples, all with the same name.
      // mockDate('4 Jul 2020 15:00'); // Now is 4th of July, at 3pm local timezone.

      const exampleUploadedProfileInformation = {
        profileToken: 'MACOSX',
        jwtToken: null,
        publishedDate: new Date('4 Jul 2020 13:00'),
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

      await persistUploadedProfileInformationToDb({
        ...exampleUploadedProfileInformation,
        profileToken: 'PROFILE-1',
      });
      await persistUploadedProfileInformationToDb({
        ...exampleUploadedProfileInformation,
        profileToken: 'PROFILE-2',
      });
      await persistUploadedProfileInformationToDb({
        ...exampleUploadedProfileInformation,
        profileToken: 'PROFILE-3',
      });

      const { findAllByText } = setup();
      expect(await findAllByText(/PROFILE/)).toHaveLength(3);

      // Add one more.
      await persistUploadedProfileInformationToDb({
        ...exampleUploadedProfileInformation,
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

  describe('renaming profiles', () => {
    async function setup(initialName: string) {
      mockDate('4 Jul 2020 15:00');
      const templateData = listOfProfileInformations[0];
      const uploadedProfileInformation = {
        ...templateData,
        name: initialName,
        urlPath: `${templateData.urlPath}?profileName=${encodeURIComponent(
          initialName
        )}`,
      };
      await persistUploadedProfileInformationToDb(uploadedProfileInformation);

      // We use 2 different stores to simulate 2 different pages.
      const storeWithListOfProfiles = blankStore();
      const storeWithProfileViewer = blankStore();
      storeWithProfileViewer.dispatch(
        updateUrlState(
          stateFromLocation({
            pathname: `/public/${uploadedProfileInformation.profileToken}/marker-chart/`,
            search: '',
            hash: '',
          })
        )
      );

      render(
        <Provider store={storeWithListOfProfiles}>
          <ListOfPublishedProfiles withActionButtons={false} />
        </Provider>
      );

      async function findLinkByText(strOrRegexp): Promise<HTMLLinkElement> {
        const element = await screen.findByRole('link', { name: strOrRegexp });
        return element;
      }

      return {
        storeWithListOfProfiles,
        storeWithProfileViewer,
        findLinkByText,
        uploadedProfileInformation,
      };
    }

    function profileNameFromLinkElement(
      profileLink: HTMLLinkElement
    ): string | null {
      const searchParams = new URL(profileLink.href).searchParams;
      return searchParams.get('profileName');
    }

    it('can rename stored profiles', async () => {
      const { storeWithProfileViewer, findLinkByText } = await setup(
        'Initial Profile Name'
      );
      let profileLink = await findLinkByText(/Initial Profile Name/);
      expect(profileNameFromLinkElement(profileLink)).toBe(
        'Initial Profile Name'
      );

      await storeWithProfileViewer.dispatch(
        changeProfileName('My Profile Name')
      );

      // The list will update with a focus event.
      window.dispatchEvent(new Event('focus'));
      profileLink = await findLinkByText(/My Profile Name/);
      expect(profileNameFromLinkElement(profileLink)).toBe('My Profile Name');

      // Now let's remove the name altogether -> the displayed information
      // should now use the profile token prefixed with #.
      await storeWithProfileViewer.dispatch(changeProfileName(null));

      // The list will update with a focus event.
      window.dispatchEvent(new Event('focus'));
      // Fluent adds invisible isolate character so the '.?' is to support that
      profileLink = await findLinkByText(/Profile .?#\w/i);
      expect(profileNameFromLinkElement(profileLink)).toBe(null);
    });
  });
});
