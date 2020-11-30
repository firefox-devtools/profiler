/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { processGeckoProfile } from '../../profile-logic/process-profile';
import { sanitizePII } from '../../profile-logic/sanitize';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/flow';
import type { RemoveProfileInformation } from 'firefox-profiler/types';
import { storeWithProfile } from '../fixtures/stores';
import { getHasPreferenceMarkers } from '../../selectors/profile';
import {
  getCheckedSharingOptions,
  getRemoveProfileInformation,
} from '../../selectors/publish';
import { toggleCheckedSharingOptions } from '../../actions/publish';
import {
  correlateIPCMarkers,
  deriveMarkersFromRawMarkerTable,
} from '../../profile-logic/marker-data';
import { getTimeRangeForThread } from '../../profile-logic/profile-data';

describe('sanitizePII', function() {
  function setup(
    piiConfig,
    originalProfile = processGeckoProfile(createGeckoProfile())
  ) {
    const PIIToRemove: RemoveProfileInformation = {
      shouldRemoveThreads: new Set(),
      shouldRemoveThreadsWithScreenshots: new Set(),
      shouldRemoveUrls: false,
      shouldFilterToCommittedRange: null,
      shouldRemoveExtensions: false,
      shouldRemovePreferenceValues: false,
      ...piiConfig,
    };

    const derivedMarkerInfoForAllThreads = originalProfile.threads.map(
      thread => {
        const ipcCorrelations = correlateIPCMarkers(originalProfile.threads);
        const timeRangeForThread = getTimeRangeForThread(
          thread,
          originalProfile.meta.interval
        );
        return deriveMarkersFromRawMarkerTable(
          thread.markers,
          thread.stringTable,
          thread.tid || 0,
          timeRangeForThread,
          ipcCorrelations
        );
      }
    );

    const sanitizedProfile = sanitizePII(
      originalProfile,
      derivedMarkerInfoForAllThreads,
      PIIToRemove
    ).profile;

    return {
      sanitizedProfile,
      originalProfile,
    };
  }

  it('should sanitize the threads if they are provided', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreads: new Set([0, 2]),
    });
    // There are 3 threads in the beginning.
    expect(originalProfile.threads.length).toEqual(3);
    // First and last threads are removed and now there are only 1 thread.
    expect(sanitizedProfile.threads.length).toEqual(1);
  });

  it('should sanitize counters if its thread is deleted', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreads: new Set([0]),
    });

    if (ensureExists(originalProfile.counters)[0].mainThreadIndex !== 0) {
      throw new Error(
        'This test assumes the the counters mainThreadIndex is 0'
      );
    }

    expect(ensureExists(originalProfile.counters).length).toEqual(1);
    // The counter was for the first thread, it should be deleted now.
    expect(ensureExists(sanitizedProfile.counters).length).toEqual(0);
  });

  it('should not sanitize counters if its thread is not deleted', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreads: new Set([1, 2]),
    });

    if (ensureExists(originalProfile.counters)[0].mainThreadIndex !== 0) {
      throw new Error(
        'This test assumes the the counters mainThreadIndex is 0'
      );
    }

    expect(ensureExists(originalProfile.counters).length).toEqual(1);
    // The counter was for the first thread, it should not be deleted now.
    expect(ensureExists(sanitizedProfile.counters).length).toEqual(1);
  });

  it('should sanitize profiler overhead if its thread is deleted', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreads: new Set([0]),
    });
    expect(ensureExists(originalProfile.profilerOverhead).length).toEqual(1);
    // The counter was for the first thread, it should be deleted now.
    expect(ensureExists(sanitizedProfile.profilerOverhead).length).toEqual(0);
  });

  it('should not sanitize profiler overhead if its thread is not deleted', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreads: new Set([1, 2]),
    });

    expect(ensureExists(originalProfile.profilerOverhead).length).toEqual(1);
    expect(ensureExists(sanitizedProfile.profilerOverhead).length).toEqual(1);
  });

  it('should sanitize the screenshots if they are provided', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreadsWithScreenshots: new Set([0, 1, 2]),
    });

    // Checking if we have screenshot markers just in case.
    {
      let screenshotMarkerFound = false;
      for (const thread of originalProfile.threads) {
        for (const data of thread.markers.data) {
          if (data && data.type === 'CompositorScreenshot') {
            screenshotMarkerFound = true;
            break;
          }
        }
      }
      expect(screenshotMarkerFound).toEqual(true);
    }

    {
      let screenshotMarkerFound = false;
      for (const thread of sanitizedProfile.threads) {
        for (const data of thread.markers.data) {
          if (data && data.type === 'CompositorScreenshot') {
            screenshotMarkerFound = true;
            break;
          }
        }
      }
      expect(screenshotMarkerFound).toEqual(false);
    }
  });

  it('should sanitize the pages information', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveUrls: true,
    });

    // Checking to make sure that we have a http{,s} URI in the pages array.
    const pageUrl = ensureExists(originalProfile.pages).find(page =>
      page.url.includes('http')
    );
    if (pageUrl === undefined) {
      throw new Error(
        "There should be an http URL in the 'pages' array in this profile."
      );
    }

    for (const page of ensureExists(sanitizedProfile.pages)) {
      expect(page.url.includes(pageUrl.url)).toBe(false);
    }
  });

  it('should keep the chrome URIs inside the pages array', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveUrls: true,
    });

    // Checking to make sure that we have a chrome URI in the pages array.
    const chromePageUrl = ensureExists(originalProfile.pages).find(page =>
      page.url.includes('chrome://')
    );
    if (chromePageUrl === undefined) {
      throw new Error(
        "There should be a chrome URL in the 'pages' array in this profile."
      );
    }

    let includesChromeUrl = false;
    for (const page of ensureExists(sanitizedProfile.pages)) {
      if (page.url.includes(chromePageUrl.url)) {
        includesChromeUrl = true;
        break;
      }
    }
    expect(includesChromeUrl).toBe(true);
  });

  it('should sanitize all the URLs inside network markers', function() {
    const { sanitizedProfile } = setup({
      shouldRemoveUrls: true,
    });

    for (const thread of sanitizedProfile.threads) {
      const stringArray = thread.stringTable.serializeToArray();
      for (let i = 0; i < thread.markers.length; i++) {
        const currentMarker = thread.markers.data[i];
        if (
          currentMarker &&
          currentMarker.type &&
          currentMarker.type === 'Network'
        ) {
          /* eslint-disable jest/no-conditional-expect */
          expect(currentMarker.URI).toBeFalsy();
          expect(currentMarker.RedirectURI).toBeFalsy();
          const stringIndex = thread.markers.name[i];
          expect(stringArray[stringIndex].includes('http')).toBe(false);
          /* eslint-enable */
        }
      }
    }
  });

  it('should sanitize the URLs inside text markers', function() {
    const unsanitizedNameField =
      'onBeforeRequest https://profiler.firefox.com/ by extension';
    const sanitizedNameField = 'onBeforeRequest https://<URL> by extension';
    const { sanitizedProfile } = setup(
      {
        shouldRemoveUrls: true,
      },
      getProfileWithMarkers([
        [
          'Extension Suspend',
          0,
          1,
          {
            type: 'Text',
            name: unsanitizedNameField,
          },
        ],
      ])
    );

    const marker = sanitizedProfile.threads[0].markers.data[0];
    if (!marker || marker.type !== 'Text') {
      throw new Error('Expected a Text marker');
    }
    expect(marker.name).toBe(sanitizedNameField);
  });

  it('should sanitize all the URLs inside string table', function() {
    const { sanitizedProfile } = setup({
      shouldRemoveUrls: true,
    });

    for (const thread of sanitizedProfile.threads) {
      const stringArray = thread.stringTable.serializeToArray();
      for (const string of stringArray) {
        // We are keeping the http(s) and removing the rest.
        // That's why we can't test it with `includes('http')`.
        // Tested `.com` here since all of the test urls have .com in it
        expect(string.includes('.com')).toBe(false);
      }
    }
  });

  it('should sanitize extensions', function() {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveExtensions: true,
    });
    {
      const extensions = ensureExists(originalProfile.meta.extensions);
      expect(extensions.length).toEqual(3);
      expect(extensions.id.length).toEqual(3);
      expect(extensions.name.length).toEqual(3);
      expect(extensions.baseURL.length).toEqual(3);
    }
    {
      const extensions = ensureExists(sanitizedProfile.meta.extensions);
      expect(extensions.length).toEqual(0);
      expect(extensions.id.length).toEqual(0);
      expect(extensions.name.length).toEqual(0);
      expect(extensions.baseURL.length).toEqual(0);
    }
  });

  it('should not sanitize all the preference values inside preference read markers', function() {
    const { sanitizedProfile } = setup(
      {
        shouldRemovePreferenceValues: false,
      },
      getProfileWithMarkers([
        [
          'PreferenceRead',
          0,
          1,
          {
            type: 'PreferenceRead',
            prefAccessTime: 0,
            prefName: 'preferenceName',
            prefKind: 'preferenceKind',
            prefType: 'preferenceType',
            prefValue: 'preferenceValue',
          },
        ],
      ])
    );

    expect(sanitizedProfile.threads.length).toEqual(1);

    const thread = sanitizedProfile.threads[0];
    expect(thread.markers.length).toEqual(1);

    const marker = thread.markers.data[0];
    // All the conditions have to be checked to make Flow happy.
    expect(
      marker &&
        marker.type &&
        marker.type === 'PreferenceRead' &&
        marker.prefValue === 'preferenceValue'
    ).toBeTruthy();
  });

  it('should sanitize all the preference values inside preference read markers', function() {
    const { sanitizedProfile } = setup(
      {
        shouldRemovePreferenceValues: true,
      },
      getProfileWithMarkers([
        [
          'PreferenceRead',
          0,
          1,
          {
            type: 'PreferenceRead',
            prefAccessTime: 0,
            prefName: 'preferenceName',
            prefKind: 'preferenceKind',
            prefType: 'preferenceType',
            prefValue: 'preferenceValue',
          },
        ],
      ])
    );

    expect(sanitizedProfile.threads.length).toEqual(1);

    const thread = sanitizedProfile.threads[0];
    expect(thread.markers.length).toEqual(1);

    const marker = thread.markers.data[0];
    // All the conditions have to be checked to make Flow happy.
    expect(
      marker &&
        marker.type &&
        marker.type === 'PreferenceRead' &&
        marker.prefValue === ''
    ).toBeTruthy();
  });

  it('should not push any null values to marker values by mistake while filtering', function() {
    const { sanitizedProfile } = setup({
      shouldRemoveThreadsWithScreenshots: new Set([0, 1, 2]),
    });

    for (const thread of sanitizedProfile.threads) {
      const markersTable = thread.markers;
      for (let i = 0; i < markersTable.length; i++) {
        // `toBeTruthy` doesn't work here because there are marker categories with `0` value.
        // expect.anything() means anything other than null or undefined.
        expect(markersTable.name[i]).toEqual(expect.anything());
        expect(markersTable.phase[i]).toEqual(expect.anything());
        expect(markersTable.data[i]).toEqual(expect.anything());
        expect(markersTable.category[i]).toEqual(expect.anything());
        // Do not perform this check on startTime or endTime as these may be null.

        expect(markersTable.name).toHaveLength(markersTable.length);
        expect(markersTable.phase).toHaveLength(markersTable.length);
        expect(markersTable.data).toHaveLength(markersTable.length);
        expect(markersTable.category).toHaveLength(markersTable.length);
        expect(markersTable.startTime).toHaveLength(markersTable.length);
        expect(markersTable.endTime).toHaveLength(markersTable.length);
      }
    }
  });

  it('should sanitize the FileIO marker paths', function() {
    const marker1File = 'permissions.sqlite-journal';
    const marker2File = 'CustomizableUI.jsm';
    const { sanitizedProfile } = setup(
      {
        shouldRemoveUrls: true,
      },
      getProfileWithMarkers([
        [
          'FileIO',
          1,
          2,
          {
            type: 'FileIO',
            source: 'PoisonIOInterposer',
            filename:
              '/Users/username/Library/Application Support/Firefox/Profiles/profile-id.default/' +
              marker1File,
            operation: 'create/open',
            cause: {
              tid: 1112,
              time: 1.0,
              stack: 0,
            },
          },
        ],
        [
          'FileIO',
          3,
          4,
          {
            type: 'FileIO',
            source: 'PoisonIOInterposer',
            filename:
              'C:\\Users\\username\\mozilla-central\\obj-mc-dbg\\dist\\bin\\browser\\modules\\' +
              marker2File,
            operation: 'create/open',
            cause: {
              tid: 1113,
              time: 1.0,
              stack: 0,
            },
          },
        ],
      ])
    );
    expect(sanitizedProfile.threads.length).toEqual(1);
    const thread = sanitizedProfile.threads[0];
    expect(thread.markers.length).toEqual(2);

    const marker1 = thread.markers.data[0];
    const marker2 = thread.markers.data[1];

    // Marker filename fields should be there.
    if (!marker1 || !marker1.filename || !marker2 || !marker2.filename) {
      throw new Error('Failed to find filename property in the payload');
    }

    // Now check the filename fields and make sure they are sanitized.
    expect(marker1.filename).toBe('<PATH>/' + marker1File);
    expect(marker2.filename).toBe('<PATH>\\' + marker2File);
  });
});

describe('getRemoveProfileInformation', function() {
  it('should bail out early when there is no preference marker in the profile', function() {
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
});
