/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ZipFileViewer } from '../../components/app/ZipFileViewer';
import { Provider } from 'react-redux';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import * as UrlStateSelectors from '../../selectors/url-state';
import * as ZippedProfileSelectors from '../../selectors/zipped-profiles';

import { storeWithZipFile } from '../fixtures/profiles/zip-file';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { waitUntilState, fireFullClick } from '../fixtures/utils';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

describe('calltree/ZipFileTree', function () {
  autoMockCanvasContext();
  autoMockIntersectionObserver();

  // This makes the bounding box large enough so that we don't trigger
  // VirtualList's virtualization.
  autoMockElementSize({ width: 1000, height: 2000 });

  async function setup() {
    const { store } = await storeWithZipFile([
      'foo/bar/profile1.json',
      'foo/profile2.json',
      'baz/profile3.json',
      // Use a file with a big depth to test the automatic expansion at load time.
      'boat/ship/new/anything/explore/yes/profile4.json',
      'not/a/profile.pdf',
    ]);

    const renderResult = render(
      <Provider store={store}>
        <ZipFileViewer />
      </Provider>
    );
    const { getState, dispatch } = store;
    return { ...renderResult, store, getState, dispatch };
  }

  it('renders a zip file tree', async () => {
    const { container } = await setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('contains a list of all the files', async () => {
    await setup();

    // We're looping through all expected files and check if we can find an
    // element with the file name as text content.
    [
      'foo',
      'bar',
      'profile1',
      'profile2',
      'baz',
      'profile3',
      'profile4',
    ].forEach((fileName) =>
      expect(screen.getByText(fileName)).toBeInTheDocument()
    );
  });

  it('removes .json extensions', async () => {
    await setup();

    ['profile1', 'profile2', 'profile3', 'profile4'].forEach((fileName) =>
      expect(screen.getByText(fileName)).toBeInTheDocument()
    );

    [
      'profile1.json',
      'profile2.json',
      'profile3.json',
      'profile4.json',
    ].forEach((fileName) =>
      expect(screen.queryByText(fileName)).not.toBeInTheDocument()
    );
  });

  it('preserves extensions other than .json', async () => {
    await setup();

    expect(screen.getByText('profile.pdf')).toBeInTheDocument();
  });

  describe('clicking on a profile link', function () {
    const setupClickingTest = async () => {
      const setupResult = await setup();
      const { store, container } = setupResult;

      const profile1OpenLink = screen.getByText('profile1');

      const waitUntilDoneProcessingZip = () =>
        act(() =>
          waitUntilState(
            store,
            (state) =>
              ZippedProfileSelectors.getZipFileState(state).phase ===
              'VIEW_PROFILE_IN_ZIP_FILE'
          )
        );

      function profileViewer() {
        return container.querySelector('.profileViewer');
      }

      return {
        ...setupResult,
        profile1OpenLink,
        waitUntilDoneProcessingZip,
        profileViewer,
      };
    };

    it('starts out without any path in the zip file', async () => {
      const { getState, profileViewer } = await setupClickingTest();
      expect(UrlStateSelectors.getPathInZipFileFromUrl(getState())).toBe(null);
      expect(profileViewer()).toBeFalsy();
    });

    it('kicks off the profile loading process when clicked', async () => {
      const {
        getState,
        profile1OpenLink,
        waitUntilDoneProcessingZip,
        profileViewer,
      } = await setupClickingTest();
      fireFullClick(profile1OpenLink);
      expect(UrlStateSelectors.getPathInZipFileFromUrl(getState())).toBe(
        'foo/bar/profile1.json'
      );

      // The profile isn't actually viewed yet.
      expect(profileViewer()).toBeFalsy();
      expect(
        screen.getByText(/Loading the profile/).textContent
      ).toMatchSnapshot();

      // There is async behavior going on. Wait until it is done or else
      // redux-react will throw an error.
      await waitUntilDoneProcessingZip();
    });

    it('will show the ProfileViewer component when done processing', async () => {
      const { profileViewer, profile1OpenLink, waitUntilDoneProcessingZip } =
        await setupClickingTest();

      fireFullClick(profile1OpenLink);
      await waitUntilDoneProcessingZip();
      expect(profileViewer()).toBeTruthy();
    });
  });
});
