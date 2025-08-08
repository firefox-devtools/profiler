/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  attemptToPublish,
  resetUploadState,
  toggleCheckedSharingOptions,
  revertToPrePublishedState,
} from '../../actions/publish';
import { changeSelectedTab } from '../../actions/app';
import {
  viewProfileFromPathInZipFile,
  returnToZipFileList,
} from '../../actions/zipped-profiles';
import {
  getAbortFunction,
  getCheckedSharingOptions,
  getRemoveProfileInformation,
  getUploadPhase,
  getUploadError,
  getUploadProgress,
  getUploadProgressString,
  getUploadGeneration,
} from '../../selectors/publish';
import {
  getUrlState,
  getAllCommittedRanges,
  getSelectedTab,
  getDataSource,
  getProfileNameWithDefault,
  getPathInZipFileFromUrl,
  getHash,
  getTransformStack,
} from '../../selectors/url-state';
import { getHasPreferenceMarkers } from '../../selectors/profile';
import { urlFromState } from '../../app-logic/url-handling';
import { getHasZipFile } from '../../selectors/zipped-profiles';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  getProfileWithFakeGlobalTrack,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import { storeWithProfile } from '../fixtures/stores';
import { ensureExists } from '../../utils/flow';
import { waitUntilData, waitUntilState, formatTree } from '../fixtures/utils';
import { storeWithZipFile } from '../fixtures/profiles/zip-file';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  addTransformToStack,
  hideGlobalTrack,
  commitRange,
} from '../../actions/profile-view';

import {
  retrieveUploadedProfileInformationFromDb,
  listAllUploadedProfileInformationFromDb,
} from 'firefox-profiler/app-logic/uploaded-profiles-db';

import type { Store, UploadPhase } from 'firefox-profiler/types';

import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

// We mock profile-store but we want the real error, so that we can simulate it.
import { uploadBinaryProfileData } from '../../profile-logic/profile-store';
jest.mock('../../profile-logic/profile-store');
const { UploadAbortedError } = jest.requireActual(
  '../../profile-logic/profile-store'
);

describe('getCheckedSharingOptions', function () {
  describe('default filtering by channel', function () {
    const isFiltering = {
      includeExtension: false,
      includeFullTimeRange: false,
      includeHiddenThreads: false,
      includeAllTabs: false,
      includeScreenshots: false,
      includeUrls: false,
      includePreferenceValues: false,
      includePrivateBrowsingData: false,
    };
    const isNotFiltering = {
      includeExtension: true,
      includeFullTimeRange: true,
      includeHiddenThreads: true,
      includeAllTabs: true,
      includeScreenshots: true,
      includeUrls: true,
      includePreferenceValues: true,
      includePrivateBrowsingData: false,
    };
    function getDefaultsWith(updateChannel: string) {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.updateChannel = updateChannel;
      const { getState } = storeWithProfile(profile);
      return getCheckedSharingOptions(getState());
    }

    it('does not filter with nightly', function () {
      expect(getDefaultsWith('nightly')).toEqual(isNotFiltering);
    });

    it('does not filter with nightly-try', function () {
      expect(getDefaultsWith('nightly-try')).toEqual(isNotFiltering);
    });

    it('does not filter with default', function () {
      expect(getDefaultsWith('default')).toEqual(isNotFiltering);
    });

    it('does not filter local builds', function () {
      expect(getDefaultsWith('nightly-autoland')).toEqual(isNotFiltering);
    });

    it('does filter with beta', function () {
      expect(getDefaultsWith('beta')).toEqual(isFiltering);
    });

    it('does filter with release', function () {
      expect(getDefaultsWith('release')).toEqual(isFiltering);
    });

    it('does filter with esr', function () {
      expect(getDefaultsWith('esr')).toEqual(isFiltering);
    });
  });

  describe('toggleCheckedSharingOptions', function () {
    it('can toggle options', function () {
      const { profile } = getProfileFromTextSamples('A');
      // This will cause the profile to be sanitized by default when uploading.
      profile.meta.updateChannel = 'release';

      const { getState, dispatch } = storeWithProfile(profile);
      expect(getCheckedSharingOptions(getState())).toMatchObject({
        includeHiddenThreads: false,
      });

      dispatch(toggleCheckedSharingOptions('includeHiddenThreads'));

      expect(getCheckedSharingOptions(getState())).toMatchObject({
        includeHiddenThreads: true,
      });

      dispatch(toggleCheckedSharingOptions('includeHiddenThreads'));

      expect(getCheckedSharingOptions(getState())).toMatchObject({
        includeHiddenThreads: false,
      });
    });
  });
});

describe('getRemoveProfileInformation', function () {
  it('should bail out early when there is no preference marker in the profile', function () {
    const { getState, dispatch } = storeWithProfile();
    // Checking to see that we don't have Preference markers.
    expect(getHasPreferenceMarkers(getState())).toEqual(false);

    // Setting includePreferenceValues option to false
    dispatch(toggleCheckedSharingOptions('includePreferenceValues'));
    expect(
      getCheckedSharingOptions(getState()).includePreferenceValues
    ).toEqual(false);

    const removeProfileInformation = getRemoveProfileInformation(getState());
    // It should return early with null value.
    expect(removeProfileInformation).toEqual(null);
  });

  it('should remove child threads of fake main threads', function () {
    const profile = getProfileWithFakeGlobalTrack();
    const { getState, dispatch } = storeWithProfile(profile);

    // Check the initial state
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [process]',
      '  - show [thread Thread <0>] SELECTED',
      '  - show [thread Thread <1>]',
      'show [process]',
      '  - show [thread Thread <2>]',
      '  - show [thread Thread <3>]',
    ]);

    expect(getRemoveProfileInformation(getState())).toBe(null);

    // Hide the second process
    dispatch(hideGlobalTrack(1));

    // Is it the right state?
    // The second global track is hidden but not its children -- note that
    // they're still hidden in the UI but not in the state: they still need to
    // be sanitized out!
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [process]',
      '  - show [thread Thread <0>] SELECTED',
      '  - show [thread Thread <1>]',
      'hide [process]',
      '  - show [thread Thread <2>]',
      '  - show [thread Thread <3>]',
    ]);

    // Toggle the preference to remove hidden tracks
    dispatch(toggleCheckedSharingOptions('includeHiddenThreads'));
    // Note: Jest doesn't check Set values with toMatchObject, so we're checking the
    // properties individually. See https://github.com/facebook/jest/issues/11250
    expect(
      ensureExists(getRemoveProfileInformation(getState())).shouldRemoveThreads
    ).toEqual(new Set([2, 3]));
  });
});

describe('attemptToPublish', function () {
  // This token was built from jwt.io by setting a payload:
  // { "profileToken": "FAKEHASH" }.
  const JWT_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9maWxlVG9rZW4iOiJGQUtFSEFTSCJ9.lrpqj6L1qu-vlV48Xp-3om2Lf3M7eztXuC8UlkePnKg`;
  const BARE_PROFILE_TOKEN = 'FAKEHASH';

  function setupFakeUpload() {
    let updateUploadProgress: ((progress: number) => void) | undefined;

    // Create a promise with the resolve function outside of it.
    // const { promise, resolve: resolveUpload, reject: rejectUpload } = Promise.withResolvers();
    let resolveUpload: (param: any) => void,
      rejectUpload: (reason?: any) => void;
    const promise = new Promise<string>((resolve, reject) => {
      resolveUpload = resolve;
      rejectUpload = reject;
    });

    promise.catch(() => {
      // Node complains if we don't handle a promise/catch, and this one rejects
      // before it's properly handled. Catch it here so that Node doesn't complain.
      // This won't hide problems in our code because the app code "awaits" the
      // result of startUpload, so any rejection will be handled there.
    });

    const abortFunction = jest.fn();
    const initUploadProcess: typeof uploadBinaryProfileData = () => ({
      abortUpload() {
        // In the real implementation, we call xhr.abort, hwich in turn
        // triggers an "abort" event on the XHR object, which in turn rejects
        // the promise with the error UploadAbortedError. So we do just that
        // here directly, to simulate this.
        rejectUpload(new UploadAbortedError());
        abortFunction();
      },
      startUpload: (_data, callback) => {
        updateUploadProgress = callback;
        return promise;
      },
    });
    (uploadBinaryProfileData as any).mockImplementationOnce(initUploadProcess);

    function getUpdateUploadProgress() {
      return ensureExists(
        updateUploadProgress,
        'Expected to get a reference to the callback to update the upload progress.'
      );
    }

    return {
      // @ts-expect-error - TS2454: Variable 'resolveUpload' is used before being assigned.
      // This is incorrect; new Promise runs its callback synchronously so these variables
      // are already assigned. Anyway, once we can use Promise.withResolvers, that'll be
      // the more straightforward solution.
      resolveUpload,
      // @ts-expect-error - same as above
      rejectUpload,
      abortFunction,
      getUpdateUploadProgress,
    };
  }

  function setupFakeUploadsWithStore(store: Store) {
    jest.spyOn(window, 'open').mockImplementation(() => null);
    const fakeUploadResult = setupFakeUpload();

    function waitUntilPhase(phase: UploadPhase) {
      return waitUntilState(store, (state) => getUploadPhase(state) === phase);
    }

    async function assertUploadSuccess(publishAttempt: Promise<boolean>) {
      const publishResult = await publishAttempt;
      // To find stupid mistakes more easily, check that we didn't get an upload
      // error here. If we got one, let's rethrow the error.
      const error = getUploadError(store.getState());
      if (error) {
        throw error;
      }
      expect(publishResult).toBe(true);
    }

    return {
      ...store,
      ...fakeUploadResult,
      waitUntilPhase,
      assertUploadSuccess,
    };
  }

  function setup() {
    const { profile } = getProfileFromTextSamples('A');
    const store = storeWithProfile(profile);
    return setupFakeUploadsWithStore(store);
  }

  it('cycles through the upload phases on a successful upload', async function () {
    const { dispatch, getState, resolveUpload, assertUploadSuccess } = setup();
    expect(getUploadPhase(getState())).toEqual('local');
    const publishAttempt = dispatch(attemptToPublish());
    expect(getUploadPhase(getState())).toEqual('compressing');
    resolveUpload(JWT_TOKEN);

    await assertUploadSuccess(publishAttempt);

    expect(getUploadPhase(getState())).toEqual('uploaded');
    expect(getHash(getState())).toEqual(BARE_PROFILE_TOKEN);
    expect(getDataSource(getState())).toEqual('public');

    const storedUploadedProfileInformation =
      await retrieveUploadedProfileInformationFromDb(BARE_PROFILE_TOKEN);
    expect(storedUploadedProfileInformation).toMatchObject({
      jwtToken: JWT_TOKEN,
      profileToken: BARE_PROFILE_TOKEN,
      publishedRange: { start: 0, end: 1 },
      urlPath: urlFromState(getUrlState(getState())),
    });
  });

  it('works when the server returns a bare hash instead of a JWT token', async function () {
    const { dispatch, getState, resolveUpload, assertUploadSuccess } = setup();
    expect(getUploadPhase(getState())).toEqual('local');
    const publishAttempt = dispatch(attemptToPublish());
    expect(getUploadPhase(getState())).toEqual('compressing');
    resolveUpload(BARE_PROFILE_TOKEN);

    await assertUploadSuccess(publishAttempt);

    expect(getUploadPhase(getState())).toEqual('uploaded');
    expect(getHash(getState())).toEqual(BARE_PROFILE_TOKEN);
    expect(getDataSource(getState())).toEqual('public');

    const storedUploadedProfileInformation =
      await retrieveUploadedProfileInformationFromDb(BARE_PROFILE_TOKEN);
    expect(storedUploadedProfileInformation).toMatchObject({
      jwtToken: null,
      profileToken: BARE_PROFILE_TOKEN,
    });
  });

  it('can handle upload errors', async function () {
    const { dispatch, getState, rejectUpload } = setup();
    const publishAttempt = dispatch(attemptToPublish());
    const error = new Error('fake error');
    rejectUpload(error);

    expect(await publishAttempt).toEqual(false);

    expect(getUploadPhase(getState())).toBe('error');
    expect(getUploadError(getState())).toBe(error);
  });

  it('updates with upload progress', async function () {
    const {
      waitUntilPhase,
      dispatch,
      getState,
      resolveUpload,
      getUpdateUploadProgress,
      assertUploadSuccess,
    } = setup();
    const publishAttempt = dispatch(attemptToPublish());
    await waitUntilPhase('uploading');
    const updateUploadProgress = getUpdateUploadProgress();

    // We clamp the value at 0.1 as a minimum.
    expect(getUploadProgress(getState())).toEqual(0.1);
    // Note: it's fairly sure that this will fail on Windows environments in
    // some locale (eg: French) because we don't know how to force a locale in
    // these environments.
    expect(getUploadProgressString(getState())).toEqual('10%');

    updateUploadProgress(0.2);
    expect(getUploadProgress(getState())).toEqual(0.2);
    expect(getUploadProgressString(getState())).toEqual('20%');

    updateUploadProgress(0.5);
    expect(getUploadProgress(getState())).toEqual(0.5);
    expect(getUploadProgressString(getState())).toEqual('50%');

    updateUploadProgress(1);
    // We clamp the value at 0.95 as a maximum.
    expect(getUploadProgress(getState())).toEqual(0.95);
    expect(getUploadProgressString(getState())).toEqual('95%');

    resolveUpload(JWT_TOKEN);

    await assertUploadSuccess(publishAttempt);

    // We still clamp :-)
    expect(getUploadProgress(getState())).toEqual(0.1);
    expect(getUploadProgressString(getState())).toEqual('10%');
  });

  it('can reset after a successful upload', async function () {
    const { dispatch, getState, resolveUpload, assertUploadSuccess } = setup();
    const publishAttempt = dispatch(attemptToPublish());
    resolveUpload(JWT_TOKEN);
    expect(getUploadGeneration(getState())).toEqual(0);

    await assertUploadSuccess(publishAttempt);

    expect(getUploadPhase(getState())).toEqual('uploaded');
    // The generation is incremented twice because of some asynchronous code in
    // the uploader function.
    expect(getUploadGeneration(getState())).toBeGreaterThan(0);
    dispatch(resetUploadState());
    expect(getUploadPhase(getState())).toEqual('local');
  });

  it('can abort an upload', async function () {
    const { dispatch, getState } = setup();
    const publishAttempt = dispatch(attemptToPublish());
    expect(getUploadGeneration(getState())).toEqual(0);
    const abortFunction = getAbortFunction(getState());
    abortFunction();

    expect(await publishAttempt).toEqual(false);
    expect(getUploadGeneration(getState())).toEqual(1);
    expect(getUploadPhase(getState())).toEqual('local');
  });

  it('obeys the generational value, and ignores stale uploads', async function () {
    const { dispatch, getState, resolveUpload, waitUntilPhase, abortFunction } =
      setup();
    // Kick off a download.
    const publishPromise = dispatch(attemptToPublish());
    expect(getUploadGeneration(getState())).toEqual(0);

    // Wait until it finishes compressing, and starts uploading.
    await waitUntilPhase('uploading');

    // Abort the download.
    const abortFunctionFromState = getAbortFunction(getState());
    abortFunctionFromState();

    // Make sure the abort function was called. This means that the abort
    // function in the state has been properly set up.
    expect(abortFunction).toHaveBeenCalled();
    expect(getUploadGeneration(getState())).toEqual(1);

    // Resolve the previous upload.
    resolveUpload(JWT_TOKEN);
    expect(await publishPromise).toBe(false);

    // Make sure that the attemptToPublish workflow doesn't continue to the
    // uploaded state.
    expect(getUploadPhase(getState())).toEqual('local');
  });

  it('can revert back to the original state', async function () {
    // This function tests the original state with the trivial operation of
    // testing on the current tab.
    const { dispatch, getState, resolveUpload, assertUploadSuccess } = setup();

    const originalTab = 'flame-graph';
    const changedTab = 'stack-chart';

    // Check which tab we start on.
    dispatch(changeSelectedTab(originalTab));
    expect(getSelectedTab(getState())).toEqual(originalTab);

    // Ensure we are sanitizing something.
    const sharingOptions = getCheckedSharingOptions(getState());
    if (sharingOptions.includeUrls) {
      dispatch(toggleCheckedSharingOptions('includeUrls'));
    }

    // Now upload.
    const publishAttempt = dispatch(attemptToPublish());
    resolveUpload(JWT_TOKEN);
    await assertUploadSuccess(publishAttempt);

    // Check that we are still on this tab.
    expect(getSelectedTab(getState())).toEqual(originalTab);

    // Now change it to another tab
    dispatch(changeSelectedTab(changedTab));
    expect(getSelectedTab(getState())).toEqual(changedTab);

    // Revert the profile.
    await dispatch(revertToPrePublishedState());

    // The original state should be restored.
    expect(getSelectedTab(getState())).toEqual(originalTab);
  });

  it('should preserve the transforms after sanitization', async function () {
    const {
      profile,
      funcNamesPerThread: [, funcNames],
    } = getProfileFromTextSamples('A', 'B  C  D');

    // This will cause the profile to be sanitized by default when uploading.
    profile.meta.updateChannel = 'release';

    // Setting those to make sure we are creating two global tracks.
    profile.threads[0].name = 'GeckoMain';
    profile.threads[0].isMainThread = true;
    profile.threads[1].name = 'GeckoMain';
    profile.threads[1].isMainThread = true;
    profile.threads[1].pid = '1';

    const store = storeWithProfile(profile);
    const { dispatch, getState, resolveUpload, assertUploadSuccess } =
      setupFakeUploadsWithStore(store);

    // Add a committed range so that only samples C and D are in range.
    dispatch(commitRange(0.5, 2.5));

    // Add a focus-function transform for C.
    const C = funcNames.indexOf('C');
    dispatch(
      addTransformToStack(1, {
        type: 'focus-function',
        funcIndex: C,
      })
    );

    // Hide the first track.
    dispatch(hideGlobalTrack(0));

    // Verify that the call tree is as expected.
    const callTreeBefore = selectedThreadSelectors.getCallTree(getState());
    expect(formatTree(callTreeBefore)).toEqual(['- C (total: 1, self: 1)']);

    // Publish. This will remove thread 0 and filter out samples outside of
    // the committed range.
    // We rely on the fact that all sharing options start out as false,
    // specifically includeHiddenThreads and includeFullTimeRange.
    const publishAttempt = dispatch(attemptToPublish());
    resolveUpload(JWT_TOKEN);
    expect(getUploadGeneration(getState())).toEqual(0);
    await assertUploadSuccess(publishAttempt);

    // The transform still should be there.
    // Also, the remaining thread's index is now 0.
    const transforms = getTransformStack(getState(), 0);
    expect(transforms.length).toBe(1);

    // Verify that the call tree structure is preserved after sanitization.
    const callTreeAfter = selectedThreadSelectors.getCallTree(getState());
    expect(formatTree(callTreeAfter)).toEqual(['- C (total: 1, self: 1)']);
  });

  describe('with zip files', function () {
    const setupZipFileTests = async () => {
      const { store } = await storeWithZipFile([
        'profile1.json',
        'profile2.json',
      ]);
      return setupFakeUploadsWithStore(store);
    };

    it('removes the zip viewer and only shows the profiler after upload', async function () {
      const { dispatch, getState, resolveUpload, assertUploadSuccess } =
        await setupZipFileTests();

      // Load and view a ZIP file.
      await dispatch(viewProfileFromPathInZipFile('profile1.json'));

      // Check that the initial state makes sense for viewing a zip file.
      expect(getHasZipFile(getState())).toEqual(true);
      expect(getDataSource(getState())).toEqual('from-file');
      expect(getProfileNameWithDefault(getState())).toEqual('profile1.json');

      // Upload the profile.
      const publishAttempt = dispatch(attemptToPublish());
      resolveUpload(JWT_TOKEN);
      await assertUploadSuccess(publishAttempt);

      // Now check that we are reporting as being a public single profile.
      expect(getHasZipFile(getState())).toEqual(false);
      expect(getDataSource(getState())).toEqual('public');
    });

    it('can revert viewing the original zip file state after publishing', async function () {
      const { dispatch, getState, resolveUpload, assertUploadSuccess } =
        await setupZipFileTests();

      // Load and view a ZIP file.
      await dispatch(viewProfileFromPathInZipFile('profile1.json'));

      // Now upload.
      const publishAttempt = dispatch(attemptToPublish());
      resolveUpload(JWT_TOKEN);
      await assertUploadSuccess(publishAttempt);

      // Now check that we are reporting as being a public single profile.
      expect(getHasZipFile(getState())).toEqual(false);
      expect(getDataSource(getState())).toEqual('public');
      expect(getPathInZipFileFromUrl(getState())).toEqual(null);
      expect(getProfileNameWithDefault(getState())).toEqual('profile1.json');

      // Revert the profile.
      await dispatch(revertToPrePublishedState());

      // Now check that we have reverted to the original profile.
      expect(getHasZipFile(getState())).toEqual(true);
      expect(getDataSource(getState())).toEqual('from-file');

      // Repeat this test with the other profile in the ZIP file.
      dispatch(returnToZipFileList());
      await dispatch(viewProfileFromPathInZipFile('profile2.json'));

      // Now upload the SECOND profile.
      const { resolveUpload: resolveUpload2 } = setupFakeUpload();
      const publishAttempt2 = dispatch(attemptToPublish());
      resolveUpload2(JWT_TOKEN);
      await assertUploadSuccess(publishAttempt2);

      // For the second profile, check that we are reporting as being a public
      // single profile.
      expect(getHasZipFile(getState())).toEqual(false);
      expect(getDataSource(getState())).toEqual('public');
      expect(getProfileNameWithDefault(getState())).toEqual('profile2.json');
    });
  });

  describe('store profile information in indexeddb', () => {
    // Some other basic use cases are also covered in the tests above.
    it('stores unsanitized profiles just fine', async () => {
      const { profile } = getProfileFromTextSamples('A  B  C  D  E');
      // This will prevent the profile from being sanitized by default when uploading.
      profile.meta.updateChannel = 'nightly';

      const store = storeWithProfile(profile);
      const { dispatch, getState, resolveUpload, assertUploadSuccess } =
        setupFakeUploadsWithStore(store);

      // Only the last range will be saved in IDB, as an information to display
      // in the list of profiles.
      dispatch(commitRange(1, 4)); // This will keep samples 1, 2, 3.
      dispatch(commitRange(2, 4)); // This will keep samples 2, 3.

      // This shouldn't be sanitized, but let's double check.
      expect(getRemoveProfileInformation(getState())).toBe(null);

      const publishAttempt = dispatch(attemptToPublish());
      resolveUpload(JWT_TOKEN);
      await assertUploadSuccess(publishAttempt);

      // The upload function doesn't wait for the data store to finish, but this
      // should still be fairly quick.
      const storedUploadedProfileInformation = await waitUntilData(() =>
        retrieveUploadedProfileInformationFromDb(BARE_PROFILE_TOKEN)
      );
      expect(storedUploadedProfileInformation).toMatchObject({
        jwtToken: JWT_TOKEN,
        profileToken: BARE_PROFILE_TOKEN,
        publishedRange: { start: 2, end: 4 },
        // The url indeed contains the information about the 2 ranges.
        urlPath: urlFromState(getUrlState(getState())),
      });

      // Checking the state directly, we make sure we have the 2 ranges stored
      // in the URL path as checked above.
      expect(getAllCommittedRanges(getState())).toEqual([
        { start: 1, end: 4 },
        { start: 2, end: 4 },
      ]);

      // And now, checking that we can retrieve this data when retrieving the
      // full list.
      expect(await listAllUploadedProfileInformationFromDb()).toEqual([
        storedUploadedProfileInformation,
      ]);
    });

    it('stores properly sanitized profiles', async () => {
      // We create a 5-sample profile, to be able to assert ranges later.
      const { profile } = getProfileFromTextSamples('A  B  C  D  E');
      // This will cause the profile to be sanitized by default when uploading.
      profile.meta.updateChannel = 'release';

      const store = storeWithProfile(profile);
      const { dispatch, getState, resolveUpload, assertUploadSuccess } =
        setupFakeUploadsWithStore(store);

      dispatch(commitRange(1, 4)); // This will keep samples 1, 2, 3.
      dispatch(commitRange(2, 4)); // This will keep samples 2, 3.

      // We want to sanitize by removing the full time range, keeping only the
      // commited range.
      // Profiles with updateChannel == 'release' are sanitized by
      // default, but let's make sure of that so that we don't have surprises in
      // the future.
      expect(getCheckedSharingOptions(getState()).includeFullTimeRange).toEqual(
        false
      );
      expect(getRemoveProfileInformation(getState())).toMatchObject({
        shouldFilterToCommittedRange: {
          start: 2,
          end: 4,
        },
      });

      const publishAttempt = dispatch(attemptToPublish());
      resolveUpload(JWT_TOKEN);
      await assertUploadSuccess(publishAttempt);

      // The upload function doesn't wait for the data store to finish, but this
      // should still be fairly quick.
      const storedUploadedProfileInformation = await waitUntilData(() =>
        retrieveUploadedProfileInformationFromDb(BARE_PROFILE_TOKEN)
      );
      expect(storedUploadedProfileInformation).toMatchObject({
        jwtToken: JWT_TOKEN,
        profileToken: BARE_PROFILE_TOKEN,
        // The "old" range is still kept in IDB, because that's what we want to
        // display in the UI, as an information to the user. However the URL
        // below won't contain any range.
        publishedRange: { start: 2, end: 4 },
        urlPath: urlFromState(getUrlState(getState())),
      });
      // Checking the state directly, we make sure we have no range stored in
      // the url path as checked above.
      expect(getAllCommittedRanges(getState())).toEqual([]);

      // And now, checking that we can retrieve this data when retrieving the
      // full list.
      expect(await listAllUploadedProfileInformationFromDb()).toEqual([
        storedUploadedProfileInformation,
      ]);
    });

    it('stores the information for the right upload when the user aborts and uploads again', async () => {
      const { profile } = getProfileFromTextSamples('A  B  C  D  E');
      // This will prevent the profile from being sanitized by default when uploading.
      profile.meta.updateChannel = 'nightly';

      const store = storeWithProfile(profile);
      const { dispatch, getState, assertUploadSuccess, waitUntilPhase } =
        setupFakeUploadsWithStore(store);

      // This sets up a second upload.
      const { resolveUpload: resolveUpload2 } = setupFakeUpload();

      // We need a new set of profileToken/JWT for the second upload.
      const secondBareProfileToken = 'ANOTHERHASH';
      // This token was built from jwt.io by setting a payload:
      // { "profileToken": "ANOTHERHASH" }.
      const secondJwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9maWxlVG9rZW4iOiJBTk9USEVSSEFTSCJ9.YvJbxRzTYb9oWArgZ9pQUPS6-bLTSvIQLopuQmqv2u4';

      dispatch(commitRange(1, 4)); // This will keep samples 1, 2, 3.

      // This shouldn't be sanitized, but let's double check.
      expect(getRemoveProfileInformation(getState())).toBe(null);

      const publishAttempt1 = dispatch(attemptToPublish());

      // After all, the user wants to sanitize. So they abort first then attempt
      // to publish again.
      // This is a bit of a hack for tests, to make sure we'll resolve the right
      // call. Indeed we need to make sure that the first attempt is the first
      // to call uploadBinaryProfileData. Waiting for the 'uploading' phase
      // accomplishes that.
      await waitUntilPhase('uploading');

      // First, we abort.
      const abortFunction = getAbortFunction(getState());
      abortFunction();

      // Then we check new options to sanitize the profile, and attempt a new publish.
      dispatch(toggleCheckedSharingOptions('includeFullTimeRange'));
      expect(getRemoveProfileInformation(getState())).toMatchObject({
        shouldFilterToCommittedRange: { start: 1, end: 4 },
      });
      const publishAttempt2 = dispatch(attemptToPublish());

      resolveUpload2(secondJwtToken);
      await assertUploadSuccess(publishAttempt2);

      // Because the first upload was stopped, the result sould be false.
      expect(await publishAttempt1).toBe(false);

      // Now let's check the data stored in the IDB is correct.
      // The second request should have been stored just fine.
      const secondRequestData = await waitUntilData(() =>
        retrieveUploadedProfileInformationFromDb(secondBareProfileToken)
      );
      expect(secondRequestData).toMatchObject({
        jwtToken: secondJwtToken,
        profileToken: secondBareProfileToken,
        publishedRange: { start: 1, end: 4 },
        // This is the second request so this should have the final state no
        // matter what.
        urlPath: urlFromState(getUrlState(getState())),
      });

      // This is the first request, it hasn't been added because the request was
      // aborted before the end.
      const firstRequestData =
        await retrieveUploadedProfileInformationFromDb(BARE_PROFILE_TOKEN);
      expect(firstRequestData).toBe(null);

      // And now, checking that we can retrieve this data when retrieving the
      // full list. The second profile comes first because it was answered
      // first.
      expect(await listAllUploadedProfileInformationFromDb()).toEqual([
        secondRequestData,
      ]);
    });
  });
});
