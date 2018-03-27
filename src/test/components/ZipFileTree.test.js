/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ZipFileViewer from '../../components/app/ZipFileViewer';
import ProfileViewer from '../../components/app/ProfileViewer';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';
import { storeWithZipFile } from '../fixtures/profiles/zip-file';
import * as UrlStateSelectors from '../../reducers/url-state';
import * as ZippedProfileSelectors from '../../reducers/zipped-profiles';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { waitUntilState } from '../fixtures/utils';

describe('calltree/ZipFileTree', function() {
  async function setup() {
    const { store } = await storeWithZipFile([
      'foo/bar/profile1.json',
      'foo/profile2.json',
      'baz/profile3.json',
    ]);
    const component = mount(
      <Provider store={store}>
        <ZipFileViewer />
      </Provider>
    );
    const { getState, dispatch } = store;
    return { store, component, getState, dispatch };
  }
  it('renders a zip file tree', async () => {
    const { component } = await setup();
    expect(component).toMatchSnapshot();
  });

  it('contains a list of all the files', async () => {
    const { component } = await setup();

    const rowNames = component
      .find('.treeViewRow')
      .map(component => component.text())
      .filter(text => text);

    expect(rowNames).toEqual([
      'foo',
      'bar',
      'profile1.json',
      'profile2.json',
      'baz',
      'profile3.json',
    ]);
  });

  describe('clicking on a profile link', function() {
    const setupClickingTest = async () => {
      const { component, store, getState, dispatch } = await setup();

      const profile1OpenLink = component
        .find('a')
        .filterWhere(component => component.text() === 'profile1.json');

      const waitUntilDoneProcessingZip = () =>
        waitUntilState(
          store,
          state =>
            ZippedProfileSelectors.getZipFileState(state).phase ===
            'VIEW_PROFILE_IN_ZIP_FILE'
        );

      return {
        component,
        store,
        getState,
        dispatch,
        profile1OpenLink,
        waitUntilDoneProcessingZip,
      };
    };

    it('starts out without any path in the zip file', async () => {
      const { getState, component } = await setupClickingTest();
      expect(UrlStateSelectors.getPathInZipFileFromUrl(getState())).toBe(null);
      expect(component.find(ProfileViewer).length).toBe(0);
    });

    it('kicks off the profile loading process when clicked', async () => {
      const {
        component,
        getState,
        profile1OpenLink,
        waitUntilDoneProcessingZip,
      } = await setupClickingTest();
      profile1OpenLink.simulate('click');
      component.update();
      expect(UrlStateSelectors.getPathInZipFileFromUrl(getState())).toBe(
        'foo/bar/profile1.json'
      );

      // The profile isn't actually viewed yet.
      expect(component.find(ProfileViewer).length).toBe(0);
      expect(component.find('.zipFileViewerMessage').text()).toMatchSnapshot();

      // There is async behavior going on. Wait until it is done or else
      // redux-react will throw an error.
      await waitUntilDoneProcessingZip();
    });

    it('will show the ProfileViewer component when done processing', async () => {
      // The full ProfileViewer component renders to a Canvas, which the jsdom API
      // doesn't fully mock out.
      jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation(() => {
          return mockCanvasContext();
        });

      const {
        component,
        profile1OpenLink,
        waitUntilDoneProcessingZip,
      } = await setupClickingTest();

      profile1OpenLink.simulate('click');
      await waitUntilDoneProcessingZip();

      component.update();
      expect(component.find(ProfileViewer).length).toBe(1);
    });
  });
});
