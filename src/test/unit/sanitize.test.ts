/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { processGeckoProfile } from '../../profile-logic/process-profile';
import { sanitizePII } from '../../profile-logic/sanitize';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import {
  getProfileWithMarkers,
  getProfileFromTextSamples,
  addTabInformationToProfile,
  markTabIdsAsPrivateBrowsing,
  addMarkersToThreadWithCorrespondingSamples,
  addInnerWindowIdToStacks,
  getNetworkMarkers,
} from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/types';
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
import type {
  MarkerSchemaByName,
  RawThread,
  RemoveProfileInformation,
} from 'firefox-profiler/types';

describe('sanitizePII', function () {
  function setup(
    piiConfig: Partial<RemoveProfileInformation>,
    originalProfile = processGeckoProfile(createGeckoProfile())
  ) {
    const defaultsPii: RemoveProfileInformation = {
      shouldRemoveThreads: new Set(),
      shouldRemoveCounters: new Set(),
      shouldRemoveThreadsWithScreenshots: new Set(),
      shouldRemoveUrls: false,
      shouldFilterToCommittedRange: null,
      shouldRemoveExtensions: false,
      shouldRemovePreferenceValues: false,
      shouldRemovePrivateBrowsingData: false,
      shouldRemoveJSSources: false,
    };

    const PIIToRemove: RemoveProfileInformation = {
      ...defaultsPii,
      ...piiConfig,
    };

    const derivedMarkerInfoForAllThreads = originalProfile.threads.map(
      (thread) => {
        const ipcCorrelations = correlateIPCMarkers(
          originalProfile.threads,
          originalProfile.shared
        );
        const timeRangeForThread = getTimeRangeForThread(
          thread,
          originalProfile.meta.interval
        );
        return deriveMarkersFromRawMarkerTable(
          thread.markers,
          originalProfile.shared.stringArray,
          thread.tid || 0,
          timeRangeForThread,
          ipcCorrelations
        );
      }
    );

    const markerSchemaByName: MarkerSchemaByName = {
      FileIO: {
        name: 'FileIO',
        display: ['marker-chart', 'marker-table', 'timeline-fileio'],
        fields: [
          {
            key: 'operation',
            label: 'Operation',
            format: 'string',
          },
          {
            key: 'source',
            label: 'Source',
            format: 'string',
          },
          {
            key: 'filename',
            label: 'Filename',
            format: 'file-path',
          },
          {
            key: 'threadId',
            label: 'Thread ID',
            format: 'string',
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
          },
          {
            key: 'originSuffix',
            format: 'sanitized-string',
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

    function isInTimeRange(thread: RawThread) {
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

    function isInTimeRange(thread: RawThread) {
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

    const stringArray = sanitizedProfile.shared.stringArray;
    for (const thread of sanitizedProfile.threads) {
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

    const stringArray = sanitizedProfile.shared.stringArray;
    for (const string of stringArray) {
      // We are keeping the http(s) and removing the rest.
      // That's why we can't test it with `includes('http')`.
      // Tested `.com` here since all of the test urls have .com in it
      expect(string.includes('.com')).toBe(false);
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
    if (
      !marker1 ||
      !('filename' in marker1) ||
      !marker1.filename ||
      !marker2 ||
      !('filename' in marker2) ||
      !marker2.filename
    ) {
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
    if (!marker || !('url' in marker) || !marker.url) {
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
    if (!marker || !('host' in marker) || !marker.host) {
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
      } = addTabInformationToProfile(originalProfile);
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
      } = addTabInformationToProfile(originalProfile);
      markTabIdsAsPrivateBrowsing(originalProfile, [privateTabTabID]);
      addMarkersToThreadWithCorrespondingSamples(
        originalProfile.threads[0],
        originalProfile.shared,
        [
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
        ]
      );

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
      } = addTabInformationToProfile(originalProfile);
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

  it('should compact the source table when threads are removed', function () {
    // Create a profile with multiple threads that reference different sources
    const { profile } = getProfileFromTextSamples(
      `A[file:file1.js]`,
      `B[file:file2.js]`,
      `C[file:file3.js]`
    );

    const originalSourcesLength = profile.shared.sources.length;

    // Verify we have sources for each thread
    expect(originalSourcesLength).toEqual(3);

    // Verify that different threads reference different sources
    const thread0SourceIndex = profile.threads[0].funcTable.source[0];
    const thread1SourceIndex = profile.threads[1].funcTable.source[0];
    const thread2SourceIndex = profile.threads[2].funcTable.source[0];

    expect(thread0SourceIndex).not.toBe(thread1SourceIndex);
    expect(thread1SourceIndex).not.toBe(thread2SourceIndex);

    // Remove threads 0 and 2, keeping only thread 1.
    const { sanitizedProfile } = setup(
      {
        shouldRemoveThreads: new Set([0, 2]),
      },
      profile
    );

    // The source table should be compacted to only contain sources referenced
    // by remaining threads
    expect(sanitizedProfile.shared.sources.length).toBeLessThan(
      originalSourcesLength
    );
    expect(sanitizedProfile.shared.sources.length).toEqual(1);

    // The remaining thread should still have a valid source reference
    const remainingSourceIndex =
      sanitizedProfile.threads[0].funcTable.source[0];
    expect(remainingSourceIndex).not.toBeNull();
    expect(remainingSourceIndex).toBeLessThan(
      sanitizedProfile.shared.sources.length
    );

    // Verify that the filename string is still accessible
    expect(remainingSourceIndex).not.toBeNull();
    const filenameStringIndex =
      sanitizedProfile.shared.sources.filename[remainingSourceIndex!];
    expect(sanitizedProfile.shared.stringArray[filenameStringIndex]).toContain(
      'file2.js'
    );
  });
});
