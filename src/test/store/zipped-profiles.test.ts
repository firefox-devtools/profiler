/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  formatZipFileTable,
  storeWithZipFile,
} from '../fixtures/profiles/zip-file';
import * as ProfileViewSelectors from '../../selectors/profile';
import * as ZippedProfilesSelectors from '../../selectors/zipped-profiles';
import * as UrlStateSelectors from '../../selectors/url-state';
import createStore from '../../app-logic/create-store';
import { ensureExists } from '../../utils/flow';
import JSZip from 'jszip';

import * as ZippedProfilesActions from '../../actions/zipped-profiles';
import * as ReceiveProfileActions from '../../actions/receive-profile';
import * as ProfileViewActions from '../../actions/profile-view';
import type { PreviewSelection } from 'firefox-profiler/types';

describe('reducer zipFileState', function () {
  it('can store the zip file in the reducer', async function () {
    const { zippedProfiles } = await storeWithZipFile();
    expect(zippedProfiles).toBe(zippedProfiles);
  });

  it('can load a profile from the zip file', async function () {
    const { dispatch, getState } = await storeWithZipFile([
      'foo/bar/profile1.json',
      'foo/profile2.json',
      'baz/profile3.json',
    ]);
    expect(ProfileViewSelectors.getProfileOrNull(getState())).toEqual(null);

    await dispatch(
      ZippedProfilesActions.viewProfileFromPathInZipFile(
        'foo/bar/profile1.json'
      )
    );

    expect(ZippedProfilesSelectors.getZipFileState(getState()).phase).toBe(
      'VIEW_PROFILE_IN_ZIP_FILE'
    );
    const profile1 = ProfileViewSelectors.getProfile(getState());

    expect(profile1).toBeTruthy();
  });

  describe('profileName handling', function () {
    async function setup() {
      const { dispatch, getState } = await storeWithZipFile([
        'foo/bar/profile1.json',
        'foo/profile2.json',
        'baz/profile3.json',
        'profile4.json',
      ]);

      await dispatch(
        ZippedProfilesActions.viewProfileFromPathInZipFile(
          'foo/bar/profile1.json'
        )
      );

      return { getState, dispatch };
    }

    it('computes a profile name from the loaded file', async function () {
      const { getState } = await setup();

      const expectedName = 'bar/profile1.json';
      expect(UrlStateSelectors.getProfileNameWithDefault(getState())).toBe(
        expectedName
      );
    });

    it('computes a profile when no folder present', async function () {
      const { dispatch, getState } = await storeWithZipFile([
        'foo/bar/profile1.json',
        'foo/profile2.json',
        'baz/profile3.json',
        'profile4.json',
      ]);

      await dispatch(
        ZippedProfilesActions.viewProfileFromPathInZipFile('profile4.json')
      );

      const expectedName = 'profile4.json';
      expect(UrlStateSelectors.getProfileNameWithDefault(getState())).toBe(
        expectedName
      );
    });

    it('prefers ProfileName if it is given in the URL', async function () {
      const { getState, dispatch } = await setup();
      const profileNameFromURL = 'good profile';

      dispatch(ProfileViewActions.changeProfileName(profileNameFromURL));
      expect(UrlStateSelectors.getProfileNameWithDefault(getState())).toBe(
        profileNameFromURL
      );
    });
  });

  it('will fail when trying to load an invalid profile', async function () {
    const store = createStore();
    const { getState, dispatch } = store;
    const zip = new JSZip();
    zip.file('not-a-profile.json', 'not a profile');
    dispatch(ReceiveProfileActions.receiveZipFile(zip));

    jest.spyOn(console, 'error').mockImplementation(() => {});

    await dispatch(
      ZippedProfilesActions.viewProfileFromPathInZipFile('not-a-profile.json')
    );

    expect(ZippedProfilesSelectors.getZipFileState(getState()).phase).toEqual(
      'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE'
    );
    // console error was called.
    // @ts-expect-error - 'mock does not exist on type'
    expect(console.error.mock.calls.length >= 1).toEqual(true);
    // @ts-expect-error - 'mock does not exist on type'
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will fail when not finding a profile', async function () {
    const store = createStore();
    const { getState, dispatch } = store;
    dispatch(ReceiveProfileActions.receiveZipFile(new JSZip()));
    dispatch(
      ZippedProfilesActions.viewProfileFromPathInZipFile('nothing-here.json')
    );

    expect(ZippedProfilesSelectors.getZipFileState(getState()).phase).toEqual(
      'FILE_NOT_FOUND_IN_ZIP_FILE'
    );
  });

  it('can compute a ZipFileTable', async function () {
    const { getState } = await storeWithZipFile([
      'foo/bar/profile1.json',
      'foo/profile2.json',
      'foo/profile3.json',
      'foo/profile4.json',
      'baz/profile5.json',
    ]);

    const zipFileTable = ZippedProfilesSelectors.getZipFileTable(getState());
    expect(formatZipFileTable(zipFileTable)).toEqual([
      'foo (dir)',
      '  bar (dir)',
      '    profile1.json (file)',
      '  profile2.json (file)',
      '  profile3.json (file)',
      '  profile4.json (file)',
      'baz (dir)',
      '  profile5.json (file)',
    ]);
  });

  it('computes the zip file max depth', async function () {
    const { getState } = await storeWithZipFile([
      'foo/bar/profile1.json',
      'foo/profile2.json',
      'foo/profile3.json',
      'foo/profile4.json',
      'baz/profile5.json',
    ]);
    expect(ZippedProfilesSelectors.getZipFileMaxDepth(getState())).toEqual(2);
  });
});

describe('selected and expanded zip files', function () {
  it('can expand selections in the zip file', function () {
    const { dispatch, getState } = createStore();

    expect(
      ZippedProfilesSelectors.getExpandedZipFileIndexes(getState())
    ).toEqual([]);

    // The indexes don't check that they are valid when you add them.
    dispatch(ZippedProfilesActions.changeExpandedZipFile([123, 456, 789]));
    expect(
      ZippedProfilesSelectors.getExpandedZipFileIndexes(getState())
    ).toEqual([123, 456, 789]);
  });

  it('can procure an interesting selection', async function () {
    const { getState, dispatch } = await storeWithZipFile([
      'a/profile1.json',
      'a/profile2.json',
      'b/profile3.json',
      'b/profile4.json',
      'c/profile5.json',
      'c/profile6.json',
      'd/profile7.json',
      'd/profile8.json',
    ]);

    const zipFileTree = ZippedProfilesSelectors.getZipFileTree(getState());
    const zipFileTable = ZippedProfilesSelectors.getZipFileTable(getState());
    dispatch(
      ZippedProfilesActions.changeExpandedZipFile([
        ...zipFileTree.getAllDescendants(null),
      ])
    );
    const expanded =
      ZippedProfilesSelectors.getExpandedZipFileIndexes(getState());
    const expandedNames = expanded.map(
      (index) => zipFileTable.path[ensureExists(index)]
    );
    expect(expandedNames).toEqual([
      'a',
      'a/profile1.json',
      'a/profile2.json',
      'b',
      'b/profile3.json',
      'b/profile4.json',
      'c',
      'c/profile5.json',
      'c/profile6.json',
      'd',
      'd/profile7.json',
      'd/profile8.json',
    ]);
  });

  it('can select a zip file', function () {
    const { dispatch, getState } = createStore();

    expect(ZippedProfilesSelectors.getSelectedZipFileIndex(getState())).toEqual(
      null
    );

    // The indexes don't check that they are valid when you add them.
    dispatch(ZippedProfilesActions.changeSelectedZipFile(123));

    expect(ZippedProfilesSelectors.getSelectedZipFileIndex(getState())).toEqual(
      123
    );
  });
});

describe('profile state invalidation when switching between profiles', function () {
  const getStoreViewingProfile = async () => {
    const { dispatch, getState } = await storeWithZipFile([
      'profile1.json',
      'profile2.json',
    ]);

    const viewProfile = (path: string) =>
      dispatch(ZippedProfilesActions.viewProfileFromPathInZipFile(path));

    return { dispatch, getState, viewProfile };
  };

  it('invalidates profile-specific url state', async function () {
    const { dispatch, getState, viewProfile } = await getStoreViewingProfile();
    viewProfile('profile1.json');

    // It starts out empty.
    expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([]);

    // Add a url-encoded bit of state.
    dispatch(ProfileViewActions.commitRange(0, 10));
    expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([
      { start: 0, end: 10 },
    ]);

    // It switches to another profile and invalidates.
    dispatch(ZippedProfilesActions.returnToZipFileList());
    viewProfile('profile2.json');
    expect(UrlStateSelectors.getAllCommittedRanges(getState())).toEqual([]);
  });

  it('invalidates profile view state', async function () {
    const { dispatch, getState, viewProfile } = await getStoreViewingProfile();
    viewProfile('profile1.json');

    // Create new copies of the selection on each assertion and change, so
    // that we are not relying on strict equality.
    const getNoSelection = () => ({ hasSelection: false, isModifying: false });
    const getSomeSelection = () =>
      ({
        hasSelection: true,
        isModifying: true,
        selectionStart: 0,
        selectionEnd: 10,
      }) as PreviewSelection;

    // It starts with no selection.
    expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual(
      getNoSelection()
    );

    // Add a selection.
    dispatch(ProfileViewActions.updatePreviewSelection(getSomeSelection()));
    expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual(
      getSomeSelection()
    );
    dispatch(ZippedProfilesActions.returnToZipFileList());
    viewProfile('profile2.json');

    // It no longer has a selection when viewing another profile.
    expect(ProfileViewSelectors.getPreviewSelection(getState())).toEqual(
      getNoSelection()
    );
  });
});
