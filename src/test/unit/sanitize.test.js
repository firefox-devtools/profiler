/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { processGeckoProfile } from '../../profile-logic/process-profile';
import { sanitizePII } from '../../profile-logic/sanitize';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import {
  getProfileWithMarkers,
  getProfileFromTextSamples,
  addActiveTabInformationToProfile,
  markTabIdsAsPrivateBrowsing,
  addMarkersToThreadWithCorrespondingSamples,
  addInnerWindowIdToStacks,
  getNetworkMarkers,
} from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/flow';
import {
  correlateIPCMarkers,
  deriveMarkersFromRawMarkerTable,
} from '../../profile-logic/marker-data';
import {
  getTimeRangeForThread,
  computeTimeColumnForRawSamplesTable,
} from '../../profile-logic/profile-data';
import {
  callTreeFromProfile,
  formatTree,
} from 'firefox-profiler/test/fixtures/utils';
import type { RemoveProfileInformation } from 'firefox-profiler/types';

describe('sanitizePII', function () {
  function setup(
    piiConfig: $Shape<RemoveProfileInformation>,
    originalProfile = processGeckoProfile(createGeckoProfile())
  ) {
    const defaultsPii = {
      shouldRemoveThreads: new Set(),
      shouldRemoveCounters: new Set(),
      shouldRemoveThreadsWithScreenshots: new Set(),
      shouldRemoveUrls: false,
      shouldFilterToCommittedRange: null,
      shouldRemoveExtensions: false,
      shouldRemovePreferenceValues: false,
      shouldRemovePrivateBrowsingData: false,
      shouldRemoveTabsExceptTabID: null,
    };

    const PIIToRemove = {
      ...defaultsPii,
      ...piiConfig,
    };

    const derivedMarkerInfoForAllThreads = originalProfile.threads.map(
      (thread) => {
        const ipcCorrelations = correlateIPCMarkers(originalProfile.threads);
        const timeRangeForThread = getTimeRangeForThread(
          thread,
          originalProfile.meta.interval
        );
        return deriveMarkersFromRawMarkerTable(
          thread.markers,
          thread.stringArray,
          thread.tid || 0,
          timeRangeForThread,
          ipcCorrelations
        );
      }
    );

    const markerSchemaByName = {
      FileIO: {
        name: 'FileIO',
        display: ['marker-chart', 'marker-table', 'timeline-fileio'],
        fields: [
          {
            key: 'operation',
            label: 'Operation',
            format: 'string',
            searchable: true,
          },
          {
            key: 'source',
            label: 'Source',
            format: 'string',
            searchable: true,
          },
          {
            key: 'filename',
            label: 'Filename',
            format: 'file-path',
            searchable: true,
          },
          {
            key: 'threadId',
            label: 'Thread ID',
            format: 'string',
            searchable: true,
          },
        ],
      },
      Url: {
        name: 'Url',
        tableLabel: '{marker.name} - {marker.data.url}',
        display: ['marker-chart', 'marker-table'],
        fields: [
          {
            key: 'url',
            format: 'url',
          },
        ],
      },
      HostResolver: {
        name: 'HostResolver',
        tableLabel: '{marker.name} - {marker.data.host}',
        display: ['marker-chart', 'marker-table'],
        fields: [
          {
            key: 'host',
            format: 'sanitized-string',
            searchable: true,
          },
          {
            key: 'originSuffix',
            format: 'sanitized-string',
            searchable: true,
          },
          {
            key: 'flags',
            format: 'string',
          },
        ],
      },
    };

    const sanitizedProfile = sanitizePII(
      originalProfile,
      derivedMarkerInfoForAllThreads,
      PIIToRemove,
      markerSchemaByName
    ).profile;

    return {
      sanitizedProfile,
      originalProfile,
    };
  }

  it('should sanitize the threads if they are provided', function () {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreads: new Set([0, 2]),
    });
    // There are 3 threads in the beginning.
    expect(originalProfile.threads.length).toEqual(3);
    // First and last threads are removed and now there are only 1 thread.
    expect(sanitizedProfile.threads.length).toEqual(1);
  });

  it('should sanitize counters if they are provided', function () {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveCounters: new Set([0]),
    });

    expect(ensureExists(originalProfile.counters).length).toEqual(1);
    // The counter should be deleted now.
    expect(ensureExists(sanitizedProfile.counters).length).toEqual(0);
  });

  it('should not sanitize counters if shouldRemoveCounters is not provided', function () {
    const { originalProfile, sanitizedProfile } = setup({});

    expect(ensureExists(originalProfile.counters).length).toEqual(1);
    // The counter should still be there.
    expect(ensureExists(sanitizedProfile.counters).length).toEqual(1);
  });

  it('should sanitize counters if its thread is deleted', function () {
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

  it('should not sanitize counters if its thread is not deleted', function () {
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

  it('should sanitize the counter range if range is filtered', function () {
    const originalProfile = processGeckoProfile(createGeckoProfile());
    const timeRangeForThread = getTimeRangeForThread(
      originalProfile.threads[0],
      originalProfile.meta.interval
    );
    // Make sure that the original time range is 0-7.
    expect(timeRangeForThread).toEqual({ start: 0, end: 7 });
    const sanitizedRange = { start: 3, end: 5 };
    const { sanitizedProfile } = setup(
      {
        shouldFilterToCommittedRange: sanitizedRange,
      },
      originalProfile
    );

    if (ensureExists(originalProfile.counters)[0].mainThreadIndex !== 0) {
      throw new Error(
        'This test assumes the the counters mainThreadIndex is 0'
      );
    }

    // Make sure the meta data contains the new profile range
    expect(sanitizedProfile.meta.profilingStartTime).toEqual(
      sanitizedRange.start
    );
    expect(sanitizedProfile.meta.profilingEndTime).toEqual(sanitizedRange.end);

    // Make sure that we still have the same number of counters.
    expect(ensureExists(originalProfile.counters).length).toEqual(1);
    expect(ensureExists(sanitizedProfile.counters).length).toEqual(1);
    const counterSamples = ensureExists(sanitizedProfile.counters)[0].samples;

    // Make sure that all the table fields are consistent.
    const counterSampleTimes =
      computeTimeColumnForRawSamplesTable(counterSamples);
    expect(counterSampleTimes).toHaveLength(counterSamples.length);
    expect(counterSamples.count).toHaveLength(counterSamples.length);
    expect(counterSamples.number).toHaveLength(counterSamples.length);

    // Make sure that all the samples are between the sanitized time range.
    for (
      let sampleIndex = 0;
      sampleIndex < counterSamples.length;
      sampleIndex++
    ) {
      // We are using inclusive range, so we need to add 1 and subtract 1 to the
      // start and end ranges.
      expect(counterSampleTimes[sampleIndex]).toBeGreaterThanOrEqual(
        sanitizedRange.start - 1
      );
      expect(counterSampleTimes[sampleIndex]).toBeLessThanOrEqual(
        sanitizedRange.end + 1
      );
    }
  });

  it('should remove threads starting after the range if range is filtered', function () {
    const originalProfile = processGeckoProfile(createGeckoProfile());
    const timeRangeForFirstThread = getTimeRangeForThread(
      originalProfile.threads[0],
      originalProfile.meta.interval
    );

    // Make sure that the original time range is 0-7.
    expect(timeRangeForFirstThread).toEqual({ start: 0, end: 7 });

    const { sanitizedProfile } = setup(
      {
        shouldFilterToCommittedRange: timeRangeForFirstThread,
      },
      originalProfile
    );

    function isInTimeRange(thread) {
      return (
        thread.registerTime < timeRangeForFirstThread.end &&
        (!thread.unregisterTime ||
          thread.unregisterTime > timeRangeForFirstThread.start)
      );
    }
    const expectedThreadCount =
      originalProfile.threads.filter(isInTimeRange).length;
    expect(expectedThreadCount).toEqual(2);
    expect(sanitizedProfile.threads.length).toEqual(expectedThreadCount);
    expect(sanitizedProfile.threads.every(isInTimeRange)).toBeTruthy();
  });

  it('should remove threads ending before the range if range is filtered', function () {
    const originalProfile = processGeckoProfile(createGeckoProfile());
    const timeRangeForLastThread = getTimeRangeForThread(
      originalProfile.threads[2],
      originalProfile.meta.interval
    );

    // Make sure that the original time range is 0-7.
    expect(timeRangeForLastThread).toEqual({ start: 1000, end: 1007 });

    const { sanitizedProfile } = setup(
      {
        shouldFilterToCommittedRange: timeRangeForLastThread,
      },
      originalProfile
    );

    function isInTimeRange(thread) {
      return (
        thread.registerTime < timeRangeForLastThread.end &&
        (!thread.unregisterTime ||
          thread.unregisterTime > timeRangeForLastThread.start)
      );
    }
    const expectedThreadCount =
      originalProfile.threads.filter(isInTimeRange).length;
    expect(expectedThreadCount).toEqual(1);
    expect(sanitizedProfile.threads.length).toEqual(expectedThreadCount);
    expect(sanitizedProfile.threads.every(isInTimeRange)).toBeTruthy();
  });

  it('should keep empty threads that were already empty', function () {
    const originalProfile = processGeckoProfile(createGeckoProfile());

    // Remove all the markers and samples from one thread of the original profile.
    const { markers, samples } = originalProfile.threads[1];
    markers.data = [];
    markers.name = [];
    markers.startTime = [];
    markers.endTime = [];
    markers.phase = [];
    markers.category = [];
    markers.length = 0;
    samples.stack = [];
    samples.time = [];
    samples.threadCPUDelta = [];
    samples.eventDelay = [];
    samples.length = 0;

    const { sanitizedProfile } = setup(
      {
        shouldRemoveUrls: true,
      },
      originalProfile
    );

    // Verify that the empty thread has not been sanitized out.
    expect(sanitizedProfile.threads.length).toEqual(
      originalProfile.threads.length
    );
  });

  it('should sanitize profiler overhead if its thread is deleted', function () {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreads: new Set([0]),
    });
    expect(ensureExists(originalProfile.profilerOverhead).length).toEqual(1);
    // The counter was for the first thread, it should be deleted now.
    expect(ensureExists(sanitizedProfile.profilerOverhead).length).toEqual(0);
  });

  it('should not sanitize profiler overhead if its thread is not deleted', function () {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveThreads: new Set([1, 2]),
    });

    expect(ensureExists(originalProfile.profilerOverhead).length).toEqual(1);
    expect(ensureExists(sanitizedProfile.profilerOverhead).length).toEqual(1);
  });

  it('should sanitize the screenshots if they are provided', function () {
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

  it('should sanitize the pages information', function () {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveUrls: true,
    });

    // Checking to make sure that we have a http{,s} URI in the pages array.
    const pageUrl = ensureExists(originalProfile.pages).find((page) =>
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

  it('should keep the chrome URIs inside the pages array', function () {
    const { originalProfile, sanitizedProfile } = setup({
      shouldRemoveUrls: true,
    });

    // Checking to make sure that we have a chrome URI in the pages array.
    const chromePageUrl = ensureExists(originalProfile.pages).find((page) =>
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

  it('should sanitize the favicons in the pages information', function () {
    const profile = processGeckoProfile(createGeckoProfile());
    // Add some favicons to check later
    ensureExists(profile.pages)[1].favicon =
      'data:image/png;base64,mock-base64-image-data';

    const { originalProfile, sanitizedProfile } = setup(
      { shouldRemoveUrls: true },
      profile
    );

    // Checking to make sure that we have favicons in the original profile pages array.
    const pageUrl = ensureExists(originalProfile.pages).find(
      (page) => page.favicon
    );
    if (pageUrl === undefined) {
      throw new Error(
        "There should be a favicon in the 'pages' array in this profile."
      );
    }

    for (const page of ensureExists(sanitizedProfile.pages)) {
      expect(page.favicon).toBe(null);
    }
  });

  it('should sanitize all the URLs inside network markers', function () {
    const { sanitizedProfile } = setup({
      shouldRemoveUrls: true,
    });

    for (const thread of sanitizedProfile.threads) {
      const stringArray = thread.stringArray;
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

  it('should sanitize the URLs inside text markers', function () {
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

  it('should sanitize all the URLs inside string table', function () {
    const { sanitizedProfile } = setup({
      shouldRemoveUrls: true,
    });

    for (const thread of sanitizedProfile.threads) {
      for (const string of thread.stringArray) {
        // We are keeping the http(s) and removing the rest.
        // That's why we can't test it with `includes('http')`.
        // Tested `.com` here since all of the test urls have .com in it
        expect(string.includes('.com')).toBe(false);
      }
    }
  });

  it('should sanitize extensions', function () {
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

  it('should sanitize extension ids inside text markers', function () {
    const unsanitizedNameField =
      'formautofill@mozilla.org, api_call: runtime.onUpdateAvailable.addListener';
    const sanitizedNameField =
      'api_call: runtime.onUpdateAvailable.addListener';
    const { sanitizedProfile } = setup(
      {
        shouldRemoveExtensions: true,
      },
      getProfileWithMarkers([
        [
          'ExtensionParent',
          0,
          1,
          {
            type: 'Text',
            name: unsanitizedNameField,
          },
        ],
        [
          'ExtensionChild',
          0,
          1,
          {
            type: 'Text',
            name: unsanitizedNameField,
          },
        ],
      ])
    );

    const markers = sanitizedProfile.threads[0].markers;
    for (const marker of [markers.data[0], markers.data[1]]) {
      if (!marker || marker.type !== 'Text') {
        throw new Error('Expected a Text marker');
      }
      expect(marker.name).toBe(sanitizedNameField);
    }
  });

  it('should sanitize both URLs and extension ids inside Extension Suspend markers', function () {
    const unsanitizedNameField =
      'onBeforeRequest https://profiler.firefox.com/ by extension';
    const sanitizedNameField = 'onBeforeRequest https://<URL>';
    const { sanitizedProfile } = setup(
      {
        shouldRemoveUrls: true,
        shouldRemoveExtensions: true,
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

  it('should not sanitize all the preference values inside preference read markers', function () {
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

  it('should sanitize all the preference values inside preference read markers', function () {
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

  it('should not push any null values to marker values by mistake while filtering', function () {
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

  it('should sanitize the FileIO marker paths', function () {
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
        [
          'FileIO',
          5,
          6,
          {
            type: 'FileIO',
            source: 'PoisonIOInterposer',
            operation: 'fsync',
          },
        ],
      ])
    );
    expect(sanitizedProfile.threads.length).toEqual(1);
    const thread = sanitizedProfile.threads[0];
    expect(thread.markers.length).toEqual(3);

    const marker1 = thread.markers.data[0];
    const marker2 = thread.markers.data[1];
    // Note: the 3rd marker has no filename property, to check that we know how
    // to handle this case, but otherwise we do no check on it.

    // Marker filename fields should be there in the 2 first markers.
    if (!marker1 || !marker1.filename || !marker2 || !marker2.filename) {
      throw new Error('Failed to find filename property in the payload');
    }

    // Now check the filename fields and make sure they are sanitized.
    expect(marker1.filename).toBe('<PATH>/' + marker1File);
    expect(marker2.filename).toBe('<PATH>\\' + marker2File);
  });

  it('should sanitize the URL properties in markers', function () {
    const { sanitizedProfile } = setup(
      {
        shouldRemoveUrls: true,
      },
      getProfileWithMarkers([
        [
          'SpeculativeConnect',
          1,
          2,
          {
            type: 'Url',
            url: 'https://img-getpocket.cdn.mozilla.net',
          },
        ],
      ])
    );
    expect(sanitizedProfile.threads.length).toEqual(1);
    const thread = sanitizedProfile.threads[0];
    expect(thread.markers.length).toEqual(1);

    const marker = thread.markers.data[0];

    // The url fields should still be there
    if (!marker || !marker.url) {
      throw new Error('Failed to find url property in the payload');
    }

    // Now check the url fields and make sure they are sanitized.
    expect(marker.url).toBe('https://<URL>');
  });

  it('should sanitize the sanitized-string markers', function () {
    const { sanitizedProfile } = setup(
      {
        shouldRemoveUrls: true,
      },
      getProfileWithMarkers([
        [
          'nsHostResolver::ResolveHost',
          0,
          1,
          {
            type: 'HostResolver',
            host: 'domain.name',
            originSuffix: '^other.domain',
            flags: '0xf00ba4',
          },
        ],
      ])
    );
    expect(sanitizedProfile.threads.length).toEqual(1);
    const thread = sanitizedProfile.threads[0];
    expect(thread.markers.length).toEqual(1);

    const marker = thread.markers.data[0];

    // The host fields should still be there
    if (!marker || !marker.host) {
      throw new Error('Failed to find host property in the payload');
    }

    // Now check the host fields and make sure they are sanitized.
    expect(marker.host).toBe('<sanitized>');
    expect(marker.originSuffix).toBe('<sanitized>');
    expect(marker.flags).toBe('0xf00ba4');
  });

  it('should sanitize the eTLD+1 field if urls are supposed to be sanitized', function () {
    // Create a simple profile with eTLD+1 field in its thread.
    const { profile } = getProfileFromTextSamples('A');
    profile.threads[0]['eTLD+1'] = 'https://profiler.firefox.com/';

    const { sanitizedProfile } = setup(
      {
        shouldRemoveUrls: true,
      },
      profile
    );

    expect(sanitizedProfile.threads[0]['eTLD+1']).toBeFalsy();
  });

  it('should not sanitize the eTLD+1 field if urls are not supposed to be sanitized', function () {
    // Create a simple profile with eTLD+1 field in its thread.
    const { profile } = getProfileFromTextSamples('A');
    const eTLDPlus1 = 'https://profiler.firefox.com/';
    profile.threads[0]['eTLD+1'] = eTLDPlus1;

    const { sanitizedProfile } = setup(
      {
        shouldRemoveUrls: false,
      },
      profile
    );

    expect(sanitizedProfile.threads[0]['eTLD+1']).toBe(eTLDPlus1);
  });

  describe('when sanitizing private browsing data', function () {
    it('removes pages information coming from private browsing', function () {
      const { profile: originalProfile } = getProfileFromTextSamples(`A`);
      const {
        firstTabTabID: privateTabTabID,
        secondTabTabID: nonPrivateTabTabID,
      } = addActiveTabInformationToProfile(originalProfile);
      markTabIdsAsPrivateBrowsing(originalProfile, [privateTabTabID]);

      // We run the sanitizing function with the sanitize private browsing flag.
      const { sanitizedProfile } = setup(
        { shouldRemovePrivateBrowsingData: true },
        originalProfile
      );

      // We also run the sanitizing function without sanitizing anything, as we want
      // to make sure we don't remove anything in this case.
      const { sanitizedProfile: unsanitizedProfile } = setup(
        {},
        originalProfile
      );

      // before sanitization
      expect(originalProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: privateTabTabID,
        })
      );
      expect(originalProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: nonPrivateTabTabID,
        })
      );

      // no sanitization
      expect(unsanitizedProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: privateTabTabID,
        })
      );
      expect(unsanitizedProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: nonPrivateTabTabID,
        })
      );

      // after sanitization
      expect(sanitizedProfile.pages).not.toContainEqual(
        expect.objectContaining({
          tabID: privateTabTabID,
        })
      );
      expect(sanitizedProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: nonPrivateTabTabID,
        })
      );
    });

    it('removes markers coming from private browsing', function () {
      // 0. Create a profile with markers containing both private and non
      // private innerWindowIDs, as well as network markers with the
      // isPrivateBrowsing information but no innerWindowIDs information
      // otherwise.

      const { profile: originalProfile } = getProfileFromTextSamples(`A`);
      const {
        firstTabTabID: privateTabTabID,
        firstTabInnerWindowIDs: privateTabInnerWindowIDs,
        secondTabInnerWindowIDs: nonPrivateTabInnerWindowIDs,
      } = addActiveTabInformationToProfile(originalProfile);
      markTabIdsAsPrivateBrowsing(originalProfile, [privateTabTabID]);
      addMarkersToThreadWithCorrespondingSamples(originalProfile.threads[0], [
        ...getNetworkMarkers({
          id: 1235,
          startTime: 19000,
          fetchStart: 19200.2,
          endTime: 20433.8,
          uri: 'https://example.org/index.html',
          payload: {
            cache: 'Hit',
            pri: 8,
            count: 47027,
            contentType: 'text/html',
            isPrivateBrowsing: true,
          },
        }),
        ...getNetworkMarkers({
          id: 1236,
          startTime: 19000,
          fetchStart: 19200.2,
          endTime: 20433.8,
          uri: 'https://duckduckgo.com',
          payload: {
            cache: 'Hit',
            pri: 8,
            count: 47027,
            contentType: 'text/html',
          },
        }),
        [
          'DOMEvent',
          10.6,
          11.1,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: privateTabInnerWindowIDs[0],
          },
        ],
        [
          'DOMEvent',
          10.6,
          11.1,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: nonPrivateTabInnerWindowIDs[0],
          },
        ],
      ]);

      const { sanitizedProfile } = setup(
        { shouldRemovePrivateBrowsingData: true },
        originalProfile
      );

      const { sanitizedProfile: unsanitizedProfile } = setup(
        {},
        originalProfile
      );

      // Network markers have the isPrivateBrowsing property.
      // But other markers have the innerWindowID property.
      // In this test we're testing both cases.

      // 1. Let's make sure the original profile has all the initial markers.
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({ isPrivateBrowsing: true })
      );
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(privateTabInnerWindowIDs),
        })
      );
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(nonPrivateTabInnerWindowIDs),
        })
      );

      // 2. Everything is still present in the unsanitized profile
      expect(unsanitizedProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({ isPrivateBrowsing: true })
      );
      expect(unsanitizedProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(privateTabInnerWindowIDs),
        })
      );
      expect(unsanitizedProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(nonPrivateTabInnerWindowIDs),
        })
      );

      // 3. Then let's see if any isPrivateBrowsing markers are present in the
      // sanitized profile.
      expect(sanitizedProfile.threads[0].markers.data).not.toContainEqual(
        expect.objectContaining({ isPrivateBrowsing: true })
      );

      // 4. Finally check the innerWindowID property of remaining markers in the
      // sanitized profile.
      // We don't have the markers coming from private browsing windows.
      expect(sanitizedProfile.threads[0].markers.data).not.toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(privateTabInnerWindowIDs),
        })
      );
      // But we still have the others.
      expect(sanitizedProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(nonPrivateTabInnerWindowIDs),
        })
      );
    });

    it('removes threads that are for private browsing exclusively, when using Fission', () => {
      const { profile: originalProfile } = getProfileFromTextSamples(`A`, `B`);

      // In fission, threads can have the isPrivateBrowsing boolean property set
      // to true. In that case the sanitization process will remove them right
      // away.
      // Let's name the 2 threads so that we find them more easily.
      originalProfile.threads[0].name = 'Private thread';
      originalProfile.threads[1].name = 'Non-private thread';

      // And flip the flag on the first thread
      originalProfile.threads[0].isPrivateBrowsing = true;

      const { sanitizedProfile } = setup(
        { shouldRemovePrivateBrowsingData: true },
        originalProfile
      );

      // Before sanitization
      expect(originalProfile.threads).toHaveLength(2);

      // After sanitization
      expect(sanitizedProfile.threads).toHaveLength(1);
      expect(sanitizedProfile.threads[0].name).toBe('Non-private thread');
    });

    it('removes samples coming from private browsing windows', () => {
      // This profile has 4 samples:
      // - [A, B, Cjs] <= will be added a non-private browsing innerWindowID
      // - [A, B, Djs] <= will be added a private browsing innerWindowID
      // - [A, B, Ejs] <= will stay non-private but be duped to a sample with the same stack with a private browsing innerWindowID
      // - [A, B, Djs, F] <= only [A, B, Djs] will be changed to the private browsing innerWindowID , but F being native it won't have the flag
      const {
        profile: originalProfile,
        funcNamesDictPerThread: [{ A, B, Cjs, Djs, Ejs }],
      } = getProfileFromTextSamples(`
        A    A    A    A
        B    B    B    B
        Cjs  Djs  Ejs  Djs
                       F
      `);

      const {
        firstTabTabID: privateTabTabID,
        firstTabInnerWindowIDs: privateTabInnerWindowIDs,
        secondTabInnerWindowIDs: nonPrivateTabInnerWindowIDs,
      } = addActiveTabInformationToProfile(originalProfile);
      markTabIdsAsPrivateBrowsing(originalProfile, [privateTabTabID]);
      addInnerWindowIdToStacks(
        originalProfile.threads[0],
        /* listOfOperations */
        [
          {
            innerWindowID: nonPrivateTabInnerWindowIDs[0],
            callNodes: [[A, B, Cjs]],
          },
          {
            innerWindowID: privateTabInnerWindowIDs[0],
            callNodes: [[A, B, Djs]],
          },
        ],
        /* callNodesToDupe */
        [[A, B, Ejs]]
      );

      // We're running the sanitize function both with and without the
      // sanitizing options, to make sure we don't remove some data unwillingly.
      const { sanitizedProfile } = setup(
        { shouldRemovePrivateBrowsingData: true },
        originalProfile
      );
      const { sanitizedProfile: unsanitizedProfile } = setup(
        {},
        originalProfile
      );

      expect(formatTree(callTreeFromProfile(originalProfile))).toEqual([
        '- A (total: 5, self: —)',
        '  - B (total: 5, self: —)',
        '    - Djs (total: 2, self: 1)',
        '      - F (total: 1, self: 1)',
        '    - Ejs (total: 2, self: 2)',
        '    - Cjs (total: 1, self: 1)',
      ]);
      expect(formatTree(callTreeFromProfile(unsanitizedProfile))).toEqual([
        '- A (total: 5, self: —)',
        '  - B (total: 5, self: —)',
        '    - Djs (total: 2, self: 1)',
        '      - F (total: 1, self: 1)',
        '    - Ejs (total: 2, self: 2)',
        '    - Cjs (total: 1, self: 1)',
      ]);
      expect(formatTree(callTreeFromProfile(sanitizedProfile))).toEqual([
        '- A (total: 2, self: —)',
        '  - B (total: 2, self: —)',
        '    - Cjs (total: 1, self: 1)',
        '    - Ejs (total: 1, self: 1)',
      ]);
    });
  });

  describe('in active-tab view', () => {
    it('removes pages information coming from other tabs', function () {
      const { profile: originalProfile } = getProfileFromTextSamples(`A`);
      const { firstTabTabID, secondTabTabID } =
        addActiveTabInformationToProfile(originalProfile);

      const { sanitizedProfile: unsanitizedProfile } = setup(
        {},
        originalProfile
      );

      const { sanitizedProfile } = setup(
        { shouldRemoveTabsExceptTabID: secondTabTabID },
        originalProfile
      );

      // before sanitization
      expect(originalProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: firstTabTabID,
        })
      );
      expect(originalProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: secondTabTabID,
        })
      );

      // Without sanitization
      expect(unsanitizedProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: firstTabTabID,
        })
      );
      expect(unsanitizedProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: secondTabTabID,
        })
      );

      // after sanitization
      expect(sanitizedProfile.pages).not.toContainEqual(
        expect.objectContaining({
          tabID: firstTabTabID,
        })
      );
      expect(sanitizedProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: secondTabTabID,
        })
      );
    });

    it('removes markers coming from other tabs', function () {
      // 0. Create a profile with markers containing both private and non
      // private innerWindowIDs, as well as network markers with the
      // isPrivateBrowsing information but no innerWindowIDs information
      // otherwise.

      const { profile: originalProfile } = getProfileFromTextSamples(`A`);
      const {
        secondTabTabID,
        firstTabInnerWindowIDs,
        secondTabInnerWindowIDs,
      } = addActiveTabInformationToProfile(originalProfile);
      const unknownInnerWindowID = 555;

      addMarkersToThreadWithCorrespondingSamples(originalProfile.threads[0], [
        [
          'DOMEvent',
          10.6,
          11.1,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: firstTabInnerWindowIDs[0],
          },
        ],
        [
          'DOMEvent',
          10.6,
          11.1,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: secondTabInnerWindowIDs[0],
          },
        ],
        [
          'DOMEvent',
          10.6,
          11.1,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: unknownInnerWindowID,
          },
        ],
        [
          'GCMinor',
          10.7,
          11.2,
          {
            type: 'GCMinor',
            nursery: {
              status: 'nursery empty',
            },
          },
        ],
        [
          'CompositorScreenshot',
          20,
          21,
          {
            type: 'CompositorScreenshot',
            url: 0,
            windowID: 'XXX',
            windowWidth: 300,
            windowHeight: 600,
          },
        ],
        ['TextOnlyMarker', 22, 23, null],
      ]);

      const { sanitizedProfile: unsanitizedProfile } = setup(
        {},
        originalProfile
      );
      const { sanitizedProfile } = setup(
        { shouldRemoveTabsExceptTabID: secondTabTabID },
        originalProfile
      );

      // 1. Let's make sure the original profile has all the initial markers.
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(firstTabInnerWindowIDs),
        })
      );
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(secondTabInnerWindowIDs),
        })
      );
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: unknownInnerWindowID,
        })
      );

      const originalMarkerNames = originalProfile.threads[0].markers.name.map(
        (stringIndex) => originalProfile.threads[0].stringArray[stringIndex]
      );

      expect(originalMarkerNames).toContain('GCMinor');
      expect(originalMarkerNames).toContain('CompositorScreenshot');
      expect(originalMarkerNames).toContain('TextOnlyMarker');

      // 2. An unsanitized profile also has all the initial markers.
      expect(unsanitizedProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(firstTabInnerWindowIDs),
        })
      );
      expect(unsanitizedProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(secondTabInnerWindowIDs),
        })
      );
      expect(unsanitizedProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: unknownInnerWindowID,
        })
      );

      const unsanitizedMarkerNames =
        unsanitizedProfile.threads[0].markers.name.map(
          (stringIndex) =>
            unsanitizedProfile.threads[0].stringArray[stringIndex]
        );
      expect(unsanitizedMarkerNames).toContain('GCMinor');
      expect(unsanitizedMarkerNames).toContain('CompositorScreenshot');
      expect(unsanitizedMarkerNames).toContain('TextOnlyMarker');

      // 3. Finally check the innerWindowID property of remaining markers in the
      // sanitized profile.

      const sanitizedMarkerNames = sanitizedProfile.threads[0].markers.name.map(
        (stringIndex) => sanitizedProfile.threads[0].stringArray[stringIndex]
      );

      // We don't have the markers coming from the first tab.
      expect(sanitizedProfile.threads[0].markers.data).not.toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(firstTabInnerWindowIDs),
        })
      );
      expect(sanitizedProfile.threads[0].markers.data).not.toContainEqual(
        expect.objectContaining({
          innerWindowID: unknownInnerWindowID,
        })
      );

      // Nor the markers that aren't tied to a tab
      expect(sanitizedMarkerNames).not.toContain('GCMinor');
      expect(sanitizedMarkerNames).not.toContain('TextOnlyMarker');

      // But we still have the others.
      expect(sanitizedProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(secondTabInnerWindowIDs),
        })
      );

      // Including the screenshots
      expect(sanitizedMarkerNames).toContain('CompositorScreenshot');
    });

    it('removes samples coming from other tabs', () => {
      // This profile has 6 samples:
      // - [A, B, Cjs] <= will be added a innerWindowID for the tab that will be kept
      // - [A, B, Djs] <= will be added a innerWindowID for the tab that will be removed
      // - [A, B, Ejs] <= will be duped to 1 sample for each tab
      // - [A, B, Djs, F] <= only [A, B, Djs] will be changed to removed innerWindowID , but F being native it won't have the flag
      // - [A, B]      <= has no innerWindowID, therefore it will be removed as well.
      // - [A, Gjs]    <= has an unknown innerWindowID, therefore it will be removed as well.
      const {
        profile: originalProfile,
        funcNamesDictPerThread: [{ A, B, Cjs, Djs, Ejs, Gjs }],
      } = getProfileFromTextSamples(`
        A    A    A    A    A  A
        B    B    B    B    B  Gjs
        Cjs  Djs  Ejs  Djs
                       F
      `);

      const {
        secondTabTabID,
        firstTabInnerWindowIDs,
        secondTabInnerWindowIDs,
      } = addActiveTabInformationToProfile(originalProfile);
      const unknownInnerWindowID = 555;

      addInnerWindowIdToStacks(
        originalProfile.threads[0],
        /* listOfOperations */
        [
          // First tab will be removed, second tab will be kept
          {
            innerWindowID: firstTabInnerWindowIDs[0],
            callNodes: [[A, B, Djs]],
          },
          {
            innerWindowID: secondTabInnerWindowIDs[0],
            callNodes: [[A, B, Cjs]],
          },
        ],
        /* callNodesToDupe */
        [[A, B, Ejs]]
      );

      addInnerWindowIdToStacks(originalProfile.threads[0], [
        { innerWindowID: unknownInnerWindowID, callNodes: [[A, Gjs]] },
      ]);

      const { sanitizedProfile: unsanitizedProfile } = setup(
        {},
        originalProfile
      );
      const { sanitizedProfile } = setup(
        { shouldRemoveTabsExceptTabID: secondTabTabID },
        originalProfile
      );

      expect(formatTree(callTreeFromProfile(originalProfile))).toEqual([
        '- A (total: 7, self: —)',
        '  - B (total: 6, self: 1)',
        '    - Djs (total: 2, self: 1)',
        '      - F (total: 1, self: 1)',
        '    - Ejs (total: 2, self: 2)',
        '    - Cjs (total: 1, self: 1)',
        '  - Gjs (total: 1, self: 1)',
      ]);
      expect(formatTree(callTreeFromProfile(unsanitizedProfile))).toEqual([
        '- A (total: 7, self: —)',
        '  - B (total: 6, self: 1)',
        '    - Djs (total: 2, self: 1)',
        '      - F (total: 1, self: 1)',
        '    - Ejs (total: 2, self: 2)',
        '    - Cjs (total: 1, self: 1)',
        '  - Gjs (total: 1, self: 1)',
      ]);
      expect(formatTree(callTreeFromProfile(sanitizedProfile))).toEqual([
        '- A (total: 2, self: —)',
        '  - B (total: 2, self: —)',
        '    - Cjs (total: 1, self: 1)',
        '    - Ejs (total: 1, self: 1)',
      ]);
    });
  });

  describe('when removing both active tab and private browsing information', () => {
    it('sanitizes properly the pages information', () => {
      const { profile: originalProfile } = getProfileFromTextSamples(`A`);
      const {
        firstTabTabID: privateTabTabID,
        secondTabTabID: nonPrivateTabTabID,
      } = addActiveTabInformationToProfile(originalProfile);
      markTabIdsAsPrivateBrowsing(originalProfile, [privateTabTabID]);

      // We're asking the sanitizing function to remove both the private
      // browsing tab _and_ keep it as the active tab id. As a result it should
      // be removed because private browsing data has precedence.
      // In this case the other tab id should be removed as well, because
      // they're not the active tab id.
      const { sanitizedProfile } = setup(
        {
          shouldRemovePrivateBrowsingData: true,
          shouldRemoveTabsExceptTabID: privateTabTabID,
        },
        originalProfile
      );

      // before sanitization
      expect(originalProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: privateTabTabID,
        })
      );
      expect(originalProfile.pages).toContainEqual(
        expect.objectContaining({
          tabID: nonPrivateTabTabID,
        })
      );

      // after sanitization
      expect(sanitizedProfile.pages).not.toContainEqual(
        expect.objectContaining({
          tabID: privateTabTabID,
        })
      );
      expect(sanitizedProfile.pages).not.toContainEqual(
        expect.objectContaining({
          tabID: nonPrivateTabTabID,
        })
      );

      // And now we're trying this again but this time using the second tab id
      // as the active tab id.
      const { sanitizedProfile: sanitizedProfile2 } = setup(
        {
          shouldRemovePrivateBrowsingData: true,
          shouldRemoveTabsExceptTabID: nonPrivateTabTabID,
        },
        originalProfile
      );

      expect(sanitizedProfile2.pages).not.toContainEqual(
        expect.objectContaining({
          tabID: privateTabTabID,
        })
      );
      expect(sanitizedProfile2.pages).toContainEqual(
        expect.objectContaining({
          tabID: nonPrivateTabTabID,
        })
      );
    });

    it('sanitizes properly the marker information', () => {
      // 0. Create a profile with markers containing both private and non
      // private innerWindowIDs, as well as network markers with the
      // isPrivateBrowsing information but no innerWindowIDs information
      // otherwise.

      const { profile: originalProfile } = getProfileFromTextSamples(`A`);
      const {
        firstTabTabID: privateTabTabID,
        secondTabTabID: nonPrivateTabTabID,
        firstTabInnerWindowIDs: privateTabInnerWindowIDs,
        secondTabInnerWindowIDs: nonPrivateTabInnerWindowIDs,
      } = addActiveTabInformationToProfile(originalProfile);
      markTabIdsAsPrivateBrowsing(originalProfile, [privateTabTabID]);
      addMarkersToThreadWithCorrespondingSamples(originalProfile.threads[0], [
        ...getNetworkMarkers({
          id: 1235,
          startTime: 19000,
          fetchStart: 19200.2,
          endTime: 20433.8,
          uri: 'https://example.org/index.html',
          payload: {
            cache: 'Hit',
            pri: 8,
            count: 47027,
            contentType: 'text/html',
            isPrivateBrowsing: true,
          },
        }),
        ...getNetworkMarkers({
          id: 1236,
          startTime: 19000,
          fetchStart: 19200.2,
          endTime: 20433.8,
          uri: 'https://duckduckgo.com',
          payload: {
            cache: 'Hit',
            pri: 8,
            count: 47027,
            contentType: 'text/html',
          },
        }),
        [
          'DOMEvent',
          10.6,
          11.1,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: privateTabInnerWindowIDs[0],
          },
        ],
        [
          'DOMEvent',
          10.6,
          11.1,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: nonPrivateTabInnerWindowIDs[0],
          },
        ],
      ]);

      const { sanitizedProfile } = setup(
        {
          shouldRemovePrivateBrowsingData: true,
          shouldRemoveTabsExceptTabID: privateTabTabID,
        },
        originalProfile
      );

      // Network markers have the isPrivateBrowsing property.
      // But other markers have the innerWindowID property.
      // In this test we're testing both cases.

      // 1. Let's make sure the original profile has all the initial markers.
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({ isPrivateBrowsing: true })
      );
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(privateTabInnerWindowIDs),
        })
      );
      expect(originalProfile.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(nonPrivateTabInnerWindowIDs),
        })
      );

      // 2. The thread has been removed because all data has been removed.
      expect(sanitizedProfile.threads).toHaveLength(0);

      // Now let's test this again but using the second tab ID as the active tab ID.
      const { sanitizedProfile: sanitizedProfile2 } = setup(
        {
          shouldRemovePrivateBrowsingData: true,
          shouldRemoveTabsExceptTabID: nonPrivateTabTabID,
        },
        originalProfile
      );

      // Then let's see if any isPrivateBrowsing markers are present in the
      // sanitized profile.
      expect(sanitizedProfile2.threads[0].markers.data).not.toContainEqual(
        expect.objectContaining({ isPrivateBrowsing: true })
      );

      // Finally check the innerWindowID property of remaining markers in the
      // sanitized profile.
      // We don't have the markers coming from private browsing windows.
      expect(sanitizedProfile2.threads[0].markers.data).not.toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(privateTabInnerWindowIDs),
        })
      );
      // But we still have the others.
      expect(sanitizedProfile2.threads[0].markers.data).toContainEqual(
        expect.objectContaining({
          innerWindowID: expect.toBeOneOf(nonPrivateTabInnerWindowIDs),
        })
      );
    });

    it('sanitizes properly the samples information', () => {
      // This profile has 5 samples:
      // - [A, B, Cjs] <= will be added a non-private browsing innerWindowID
      // - [A, B, Djs] <= will be added a private browsing innerWindowID
      // - [A, B, Ejs] <= will stay non-private but be duped to a sample with the same stack with a private browsing innerWindowID
      // - [A, B, Djs, F] <= only [A, B, Djs] will be changed to the private browsing innerWindowID , but F being native it won't have the flag
      // - [A, B, G]   <= This has no innerWindowID.
      // The private window is also the active tab id.
      const {
        profile: originalProfile,
        funcNamesDictPerThread: [{ A, B, Cjs, Djs, Ejs }],
      } = getProfileFromTextSamples(`
        A    A    A    A    A
        B    B    B    B    B
        Cjs  Djs  Ejs  Djs  G
                       F
      `);

      const {
        firstTabTabID: privateTabTabID,
        secondTabTabID: nonPrivateTabTabID,
        firstTabInnerWindowIDs: privateTabInnerWindowIDs,
        secondTabInnerWindowIDs: nonPrivateTabInnerWindowIDs,
      } = addActiveTabInformationToProfile(originalProfile);
      markTabIdsAsPrivateBrowsing(originalProfile, [privateTabTabID]);
      addInnerWindowIdToStacks(
        originalProfile.threads[0],
        /* listOfOperations */
        [
          {
            innerWindowID: nonPrivateTabInnerWindowIDs[0],
            callNodes: [[A, B, Cjs]],
          },
          {
            innerWindowID: privateTabInnerWindowIDs[0],
            callNodes: [[A, B, Djs]],
          },
        ],
        /* callNodesToDupe */
        [[A, B, Ejs]]
      );

      // We're sanitizing with both options to remove private browsing data and
      // the non-active tab data. In this case all active tab data is also
      // private browsing so it should be removed.
      const { sanitizedProfile } = setup(
        {
          shouldRemovePrivateBrowsingData: true,
          shouldRemoveTabsExceptTabID: privateTabTabID,
        },
        originalProfile
      );

      expect(formatTree(callTreeFromProfile(originalProfile))).toEqual([
        '- A (total: 6, self: —)',
        '  - B (total: 6, self: —)',
        '    - Djs (total: 2, self: 1)',
        '      - F (total: 1, self: 1)',
        '    - Ejs (total: 2, self: 2)',
        '    - Cjs (total: 1, self: 1)',
        '    - G (total: 1, self: 1)',
      ]);

      // Everything has been removed.
      expect(formatTree(callTreeFromProfile(sanitizedProfile))).toEqual([]);

      // Now let's try this again, this time using the non private tab id as the
      // active tab id.
      const { sanitizedProfile: sanitizedProfile2 } = setup(
        {
          shouldRemovePrivateBrowsingData: true,
          shouldRemoveTabsExceptTabID: nonPrivateTabTabID,
        },
        originalProfile
      );

      expect(formatTree(callTreeFromProfile(sanitizedProfile2))).toEqual([
        '- A (total: 2, self: —)',
        '  - B (total: 2, self: —)',
        '    - Cjs (total: 1, self: 1)',
        '    - Ejs (total: 1, self: 1)',
      ]);
    });
  });
});
