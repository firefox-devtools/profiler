/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { oneLineTrim } from 'common-tags';
import * as urlStateReducers from '../selectors/url-state';
import {
  changeCallTreeSearchString,
  changeMarkersSearchString,
  changeNetworkSearchString,
  changeProfileName,
  commitRange,
  setDataSource,
} from '../actions/profile-view';
import { changeSelectedTab, changeProfilesToCompare } from '../actions/app';
import {
  stateFromLocation,
  getQueryStringFromUrlState,
  urlFromState,
  CURRENT_URL_VERSION,
  upgradeLocationToCurrentVersion,
  UrlUpgradeError,
} from '../app-logic/url-handling';
import { blankStore } from './fixtures/stores';
import {
  viewProfile,
  changeTimelineTrackOrganization,
} from '../actions/receive-profile';
import type { Profile, StartEndRange } from 'firefox-profiler/types';
import getProfile from './fixtures/profiles/call-nodes';
import queryString from 'query-string';
import {
  getHumanReadableTracks,
  getProfileWithNiceTracks,
} from './fixtures/profiles/tracks';
import {
  getProfileFromTextSamples,
  addActiveTabInformationToProfile,
} from './fixtures/profiles/processed-profile';
import { selectedThreadSelectors } from '../selectors/per-thread';
import { uintArrayToString } from '../utils/uintarray-encoding';
import {
  getActiveTabGlobalTracks,
  getActiveTabResourceTracks,
} from '../selectors/profile';
import { getView } from '../selectors/app';

function _getStoreWithURL(
  settings: {
    pathname?: string,
    search?: string,
    hash?: string,
    v?: number | false, // If v is false, do not add a v parameter to the search string.
  } = {},
  profile: Profile | null = getProfile()
) {
  const { pathname, hash, search, v } = Object.assign(
    {
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree/',
      hash: '',
      search: '',
      v: CURRENT_URL_VERSION,
    },
    settings
  );

  // Provide some defaults to the search string as needed.
  const query = Object.assign(
    {
      // Ensure that the URL has a version.
      v,
      // Ensure there is a thread index.
      thread: 0,
    },
    queryString.parse(search.substr(1), { arrayFormat: 'bracket' })
  );

  const newUrlState = stateFromLocation({
    pathname,
    search: '?' + queryString.stringify(query, { arrayFormat: 'bracket' }),
    hash,
  });

  const store = blankStore();
  store.dispatch({
    type: 'UPDATE_URL_STATE',
    newUrlState,
  });

  if (profile) {
    store.dispatch(viewProfile(profile));
  }
  return store;
}

describe('selectedThread', function() {
  function dispatchUrlWithThread(store, threadIndex) {
    const newUrlState = stateFromLocation({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree/',
      search: `?thread=${threadIndex}`,
      hash: '',
    });
    store.dispatch({
      type: 'UPDATE_URL_STATE',
      newUrlState,
    });
  }

  function setup(threadIndex) {
    const store = blankStore();
    dispatchUrlWithThread(store, threadIndex);

    const { profile } = getProfileFromTextSamples('A', 'B', 'C', 'D');
    Object.assign(profile.threads[0], {
      name: 'GeckoMain',
      processType: 'default',
    });
    Object.assign(profile.threads[1], {
      name: 'Compositor',
      processType: 'default',
    });
    Object.assign(profile.threads[2], {
      name: 'GeckoMain',
      processType: 'tab',
    });

    store.dispatch(viewProfile(profile));

    return store;
  }

  it('selects the right thread when receiving a profile from web', function() {
    const { getState } = setup(1);
    expect(urlStateReducers.getSelectedThreadIndexes(getState())).toEqual(
      new Set([1])
    );
  });

  it('selects a default thread when a wrong thread has been requested', function() {
    const { getState } = setup(100);

    // "2" is the content process' main tab
    expect(urlStateReducers.getSelectedThreadIndexes(getState())).toEqual(
      new Set([2])
    );
  });
});

describe('url handling tracks', function() {
  function initWithSearchParams(search: string) {
    return _getStoreWithURL({ search }, getProfileWithNiceTracks());
  }

  describe('global tracks', function() {
    it('creates tracks without any set search parameters', function() {
      const { getState } = initWithSearchParams('');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can reorder global tracks', function() {
      const { getState } = initWithSearchParams('?globalTrackOrder=1-0');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain process] SELECTED',
      ]);
    });

    it('can hide tracks', function() {
      const { getState } = initWithSearchParams('?hiddenGlobalTracks=1');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('will not accept invalid tracks in the thread order', function() {
      const { getState } = initWithSearchParams('?globalTrackOrder=1-0');
      expect(urlStateReducers.getGlobalTrackOrder(getState())).toEqual([1, 0]);
    });

    it('will not accept invalid hidden threads', function() {
      const { getState } = initWithSearchParams(
        '?hiddenGlobalTracks=0-8-2-a&thread=1'
      );
      expect(urlStateReducers.getHiddenGlobalTracks(getState())).toEqual(
        new Set([0])
      );
    });
  });

  describe('local tracks', function() {
    it('can reorder local tracks', function() {
      const { getState } = initWithSearchParams(
        '?localTrackOrderByPid=222-1-0'
      );
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread Style]',
        '  - show [thread DOM Worker]',
      ]);
    });

    it('can hide local tracks', function() {
      const { getState } = initWithSearchParams(
        '?hiddenLocalTracksByPid=222-1'
      );
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    // This is a test for issue https://github.com/firefox-devtools/profiler/issues/1389
    it('can select a local track without mixing track and thread indexes', function() {
      // We're building a very specific profile, where local track indexes and
      // thread indexes could be confused. This is easier if we have local
      // tracks for the first process, because then the thread indexes and the
      // local track indexes are off by one.
      const { profile } = getProfileFromTextSamples('A', 'B', 'C');
      const [thread1, thread2, thread3] = profile.threads;
      thread1.name = 'GeckoMain';
      thread1.processType = 'process';
      thread1.pid = 111;

      thread2.name = 'DOM Worker';
      thread2.processType = 'tab';
      thread2.pid = 111;

      thread3.name = 'Style';
      thread3.processType = 'tab';
      thread3.pid = 111;

      const { getState } = _getStoreWithURL(
        // In this search query, we want to hide the second local track of the
        // process with PID 111 (`111-1`), that is the "Style" thread, and
        // select the second thread (`thread=1`), that is the "DOM Worker"
        // thread, which is the local track `111-0`.
        // This ensures that we don't confuse local track and thread indexes
        // when selecting threads (see issue #1389).
        { search: '?hiddenLocalTracksByPid=111-1&thread=1' },
        profile
      );

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });
  });

  describe('legacy thread information', function() {
    it('handles legacy thread ordering', function() {
      // Flip the threads around
      const { getState } = initWithSearchParams('?threadOrder=3-2-1-0');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain tab]',
        '  - show [thread Style]',
        '  - show [thread DOM Worker]',
        'show [thread GeckoMain process] SELECTED',
      ]);
    });

    it('handles legacy thread hiding', function() {
      // Flip the threads around
      const { getState } = initWithSearchParams('?hiddenThreads=0-2');
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });
  });
});

describe('search strings', function() {
  it('properly handles the call tree search string stacks with 1 item', function() {
    const { getState } = _getStoreWithURL({ search: '?search=string' });
    expect(urlStateReducers.getCurrentSearchString(getState())).toBe('string');
    expect(urlStateReducers.getSearchStrings(getState())).toEqual(['string']);
  });

  it('properly handles the call tree search string stacks with several items', function() {
    const { getState } = _getStoreWithURL({
      search: '?search=string,foo,%20bar',
    });
    expect(urlStateReducers.getCurrentSearchString(getState())).toBe(
      'string,foo, bar'
    );
    expect(urlStateReducers.getSearchStrings(getState())).toEqual([
      'string',
      'foo',
      'bar',
    ]);
  });

  it('properly handles marker search strings', function() {
    const { getState } = _getStoreWithURL({
      search: '?markerSearch=otherString',
    });
    expect(urlStateReducers.getMarkersSearchString(getState())).toBe(
      'otherString'
    );
  });

  it('properly handles showUserTimings strings', function() {
    const { getState } = _getStoreWithURL({ search: '' });
    expect(urlStateReducers.getShowUserTimings(getState())).toBe(false);
  });

  it('defaults to not showing user timings', function() {
    const { getState } = _getStoreWithURL();
    expect(urlStateReducers.getShowUserTimings(getState())).toBe(false);
  });

  it('serializes the call tree search strings in the URL', function() {
    const { getState, dispatch } = _getStoreWithURL();

    const callTreeSearchString = 'some, search, string';

    dispatch(changeCallTreeSearchString(callTreeSearchString));

    ['calltree', 'stack-chart', 'flame-graph'].forEach(tabSlug => {
      dispatch(changeSelectedTab(tabSlug));
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(
        `search=${encodeURIComponent(callTreeSearchString)}`
      );
    });
  });

  it('serializes the marker search string in the URL', function() {
    const { getState, dispatch } = _getStoreWithURL();

    const markerSearchString = 'abc';

    dispatch(changeMarkersSearchString(markerSearchString));

    ['marker-chart', 'marker-table'].forEach(tabSlug => {
      dispatch(changeSelectedTab(tabSlug));
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`markerSearch=${markerSearchString}`);
    });
  });

  it('serializes the network search string in the URL', function() {
    const { getState, dispatch } = _getStoreWithURL();

    const networkSearchString = 'abc';

    dispatch(changeNetworkSearchString(networkSearchString));
    dispatch(changeSelectedTab('network-chart'));
    const urlState = urlStateReducers.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);
    expect(queryString).toContain(`networkSearch=${networkSearchString}`);
  });
});

describe('profileName', function() {
  it('serializes the profileName in the URL', function() {
    const { getState, dispatch } = _getStoreWithURL();
    const profileName = 'Good Profile';

    dispatch(changeProfileName(profileName));
    const urlState = urlStateReducers.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);
    expect(queryString).toContain(
      `profileName=${encodeURIComponent(profileName)}`
    );
  });

  it('reflects in the state from URL', function() {
    const { getState } = _getStoreWithURL({
      search: '?profileName=XXX',
    });
    expect(urlStateReducers.getProfileNameFromUrl(getState())).toBe('XXX');
    expect(urlStateReducers.getProfileNameWithDefault(getState())).toBe('XXX');
  });

  it('provides default values for when no profile name is given', function() {
    const { getState } = _getStoreWithURL();
    expect(urlStateReducers.getProfileNameFromUrl(getState())).toBe(null);
    expect(urlStateReducers.getProfileNameWithDefault(getState())).toBe(
      'Firefox'
    );
  });
});

describe('ctxId', function() {
  it('serializes the ctxId in the URL', function() {
    const { getState, dispatch } = _getStoreWithURL();
    const browsingContextID = 123;

    dispatch(
      changeTimelineTrackOrganization({ type: 'active-tab', browsingContextID })
    );
    const urlState = urlStateReducers.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);
    expect(queryString).toContain(`ctxId=${browsingContextID}`);
  });

  it('reflects in the state from URL', function() {
    const { getState } = _getStoreWithURL({
      search: '?ctxId=123&view=active-tab',
    });
    expect(urlStateReducers.getTimelineTrackOrganization(getState())).toEqual({
      type: 'active-tab',
      browsingContextID: 123,
    });
  });

  it('returns the full view when ctxId is not specified', function() {
    const { getState } = _getStoreWithURL();
    expect(urlStateReducers.getTimelineTrackOrganization(getState())).toEqual({
      type: 'full',
    });
  });

  it('should use the finalizeActiveTabProfileView path and initialize active tab profile view state', function() {
    const {
      profile,
      parentInnerWindowIDsWithChildren,
      iframeInnerWindowIDsWithChild,
    } = addActiveTabInformationToProfile(getProfileWithNiceTracks());
    profile.threads[0].frameTable.innerWindowID[0] = parentInnerWindowIDsWithChildren;
    profile.threads[1].frameTable.innerWindowID[0] = iframeInnerWindowIDsWithChild;
    const { getState } = _getStoreWithURL(
      {
        search: '?view=active-tab&ctxId=123',
      },
      profile
    );
    const globalTracks = getActiveTabGlobalTracks(getState());
    expect(globalTracks.length).toBe(1);
    expect(globalTracks).toEqual([
      {
        type: 'tab',
        threadIndexes: new Set([0]),
        threadsKey: 0,
      },
    ]);
    // TODO: Resource track type will be changed soon.
    const resourceTracks = getActiveTabResourceTracks(getState());
    expect(resourceTracks).toEqual([
      {
        name: 'Page #2',
        type: 'sub-frame',
        threadIndex: 1,
      },
    ]);
  });

  it('should remove other full view url states if present', function() {
    const { getState } = _getStoreWithURL({
      search:
        '?ctxId=123&view=active-tab&globalTrackOrder=3-2-1-0&hiddenGlobalTracks=4-5&hiddenLocalTracksByPid=111-1&thread=0',
    });

    const newUrl = new URL(
      urlFromState(urlStateReducers.getUrlState(getState())),
      'https://profiler.firefox.com'
    );
    // The url states that are relevant to full view should be stripped out.
    expect(newUrl.search).toEqual(
      `?ctxId=123&thread=0&v=${CURRENT_URL_VERSION}&view=active-tab`
    );
  });

  it('if not present in the URL, still manages to load the active tab view', function() {
    const { getState } = _getStoreWithURL({
      search: '?view=active-tab',
    });

    expect(getView(getState()).phase).toEqual('DATA_LOADED');
    expect(urlStateReducers.getTimelineTrackOrganization(getState())).toEqual({
      type: 'active-tab',
      browsingContextID: null,
    });
  });
});

describe('committed ranges', function() {
  describe('serialization', () => {
    it('serializes when there is no range', () => {
      const { getState } = _getStoreWithURL();
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).not.toContain(`range=`);
    });

    it('serializes when there is 1 range', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1514.587845, 25300));
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`range=1514m23786`); // 1.514s + 23786ms
    });

    it('serializes when rounding down the start', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1510.58, 1519.59));
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`range=1510m10`); // 1.510s + 10ms
    });

    it('serializes when the duration is 0', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1514, 1514));
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      // In the following regexp we want to especially assert that the duration
      // isn't 0. That's why there's this negative look-ahead assertion.
      // Therefore here we're matching a start at 1.514s, and a non-zero
      // duration.
      expect(queryString).toMatch(/range=1514000000n(?!0)/);
    });

    it('serializes when there are several ranges', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1514.587845, 25300));
      dispatch(commitRange(1800, 1800.1));
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);

      // 1- 1.5145s + 23786ms
      // 2- 1.8s + 100µs
      expect(queryString).toContain(`range=1514m23786~1800000u100`);
    });

    it('serializes when there is a small range', () => {
      const { getState, dispatch } = _getStoreWithURL();
      dispatch(commitRange(1000.08, 1000.09));
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`range=1000080u10`); // 1s and 80µs + 10µs
    });

    it('serializes when there is a very small range', () => {
      const { getState, dispatch } = _getStoreWithURL();
      dispatch(commitRange(1000.00008, 1000.0001));
      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`range=1000000080n20`); // 1s and 80ns + 20ns
    });
  });

  describe('parsing', () => {
    it('deserializes when there is no range', () => {
      const { getState } = _getStoreWithURL();
      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([]);
    });

    it('deserializes when there is 1 range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1600m5000',
      });
      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([
        { start: 1600, end: 6600 },
      ]);
    });

    it('deserializes when there are several ranges', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1600m5000~2245m24',
      });
      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([
        { start: 1600, end: 6600 },
        { start: 2245, end: 2269 },
      ]);
    });

    it('deserializes when there is a small range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1678900u100',
      });
      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([
        { start: 1678.9, end: 1679 },
      ]);
    });

    it('deserializes when there is a very small range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1678123900n100',
      });

      const [committedRange] = urlStateReducers.getAllCommittedRanges(
        getState()
      );
      expect(committedRange.start).toBeCloseTo(1678.1239);
      expect(committedRange.end).toBeCloseTo(1678.124);
    });

    it('is permissive with invalid input', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getState } = _getStoreWithURL({
        search: '?range=invalid~2245m24',
      });
      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([
        { start: 2245, end: 2269 },
      ]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('serializing and parsing', () => {
    function getQueryStringForRanges(
      ranges: $ReadOnlyArray<StartEndRange>
    ): string {
      const { getState, dispatch } = _getStoreWithURL();

      ranges.forEach(({ start, end }) => dispatch(commitRange(start, end)));

      const urlState = urlStateReducers.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      return queryString;
    }

    function setup(ranges: $ReadOnlyArray<StartEndRange>) {
      const queryString = getQueryStringForRanges(ranges);

      return _getStoreWithURL({
        search: '?' + queryString,
      });
    }

    it('can parse the serialized values', () => {
      const { getState } = setup([
        { start: 1514.587845, end: 25300 },
        { start: 1800, end: 1800.1 },
        { start: 1800.00008, end: 1800.0001 },
      ]);

      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([
        { start: 1514, end: 25300 },
        { start: 1800, end: 1800.1 },
        { start: 1800.00008, end: 1800.0001 },
      ]);
    });

    it('will round values near the threshold', () => {
      const { getState } = setup([{ start: 50000, end: 50009.9 }]);

      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([
        { start: 50000, end: 50010 },
      ]);
    });

    it('supports negative start values', () => {
      const { getState } = setup([{ start: -1000, end: 1000 }]);

      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([
        { start: -1000, end: 1000 },
      ]);
    });

    it('supports zero start values', () => {
      const { getState } = setup([{ start: 0, end: 1000 }]);

      expect(urlStateReducers.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 1000 },
      ]);
    });
  });
});

describe('url upgrading', function() {
  describe('version 1: legacy URL serialized call tree filters', function() {
    /**
     * Originally transform stacks were called call tree filters. This test asserts that
     * the upgrade process works correctly.
     */
    it('can upgrade callTreeFilters to transforms', function() {
      const { getState } = _getStoreWithURL({
        search:
          '?callTreeFilters=prefix-012~prefixjs-123~postfix-234~postfixjs-345',
        v: false,
      });
      const transforms = selectedThreadSelectors.getTransformStack(getState());
      expect(transforms).toEqual([
        {
          type: 'focus-subtree',
          callNodePath: [0, 1, 2],
          implementation: 'combined',
          inverted: false,
        },
        {
          type: 'focus-subtree',
          callNodePath: [1, 2, 3],
          implementation: 'js',
          inverted: false,
        },
        {
          type: 'focus-subtree',
          callNodePath: [2, 3, 4],
          implementation: 'combined',
          inverted: true,
        },
        {
          type: 'focus-subtree',
          callNodePath: [3, 4, 5],
          implementation: 'js',
          inverted: true,
        },
      ]);
    });
  });

  describe('version 2: split apart timeline tab', function() {
    it('switches to the stack chart when given a timeline tab', function() {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/timeline/',
        v: 1,
      });
      expect(urlStateReducers.getSelectedTab(getState())).toBe('stack-chart');
    });

    it('switches to the marker-table when given a markers tab', function() {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/markers/',
        v: false,
      });
      expect(urlStateReducers.getSelectedTab(getState())).toBe('marker-table');
    });
  });

  describe('version 3: remove platform only option', function() {
    it('switches to the stack chart when given a timeline tab', function() {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/timeline/',
        search: '?hidePlatformDetails',
        v: 2,
      });
      expect(urlStateReducers.getImplementationFilter(getState())).toBe('js');
    });
  });

  describe('version 4: Add relevantForJs frames to JS callNodePaths', function() {
    it('can upgrade a simple stack with one relevantForJs frame in the middle', function() {
      const {
        profile,
        funcNamesDictPerThread: [funcNamesDictPerThread],
      } = getProfileFromTextSamples(`
        A
        B.js
        C.js
        DrelevantForJs
        E
        F
        G.js
      `);

      profile.threads[0].funcTable.relevantForJS[
        funcNamesDictPerThread.DrelevantForJs
      ] = true;

      const callNodePathBefore = [
        funcNamesDictPerThread['B.js'],
        funcNamesDictPerThread['C.js'],
        funcNamesDictPerThread['G.js'],
      ];

      // Upgrader
      const callNodeString = uintArrayToString(callNodePathBefore);
      // focus-subtree transform with js implementation filter.
      const transformString = 'f-js-' + callNodeString;
      const { query } = upgradeLocationToCurrentVersion(
        {
          pathname: '',
          hash: '',
          query: {
            thread: '0',
            implementation: 'js',
            transforms: transformString,
            v: '3',
          },
        },
        profile
      );

      const callNodePathAfter = [
        funcNamesDictPerThread['B.js'],
        funcNamesDictPerThread['C.js'],
        funcNamesDictPerThread.DrelevantForJs,
        funcNamesDictPerThread['G.js'],
      ];

      const newTransformNodeString =
        'f-js-' + uintArrayToString(callNodePathAfter);
      expect(query.transforms).toEqual(newTransformNodeString);
    });

    it('can upgrade a simple stack with one relevantForJs frame in the front', function() {
      const {
        profile,
        funcNamesDictPerThread: [funcNamesDictPerThread],
      } = getProfileFromTextSamples(`
        A
        BrelevantForJs
        C.js
        D
        E.js
      `);

      profile.threads[0].funcTable.relevantForJS[
        funcNamesDictPerThread.BrelevantForJs
      ] = true;

      const callNodePathBefore = [
        funcNamesDictPerThread['C.js'],
        funcNamesDictPerThread['E.js'],
      ];

      // Upgrader
      const callNodeString = uintArrayToString(callNodePathBefore);
      // focus-subtree transform with js implementation filter.
      const transformString = 'f-js-' + callNodeString;
      const { query } = upgradeLocationToCurrentVersion(
        {
          pathname: '',
          hash: '',
          query: {
            thread: '0',
            implementation: 'js',
            transforms: transformString,
            v: '3',
          },
        },
        profile
      );

      const callNodePathAfter = [
        funcNamesDictPerThread.BrelevantForJs,
        funcNamesDictPerThread['C.js'],
        funcNamesDictPerThread['E.js'],
      ];

      const newTransformNodeString =
        'f-js-' + uintArrayToString(callNodePathAfter);
      expect(query.transforms).toEqual(newTransformNodeString);
    });

    it('can upgrade a simple stack with relevantForJs and native frames in the middle', function() {
      const {
        profile,
        funcNamesDictPerThread: [funcNamesDictPerThread],
      } = getProfileFromTextSamples(`
        A
        BrelevantForJs
        C
        D.js
        E
        F.js
      `);

      profile.threads[0].funcTable.relevantForJS[
        funcNamesDictPerThread.BrelevantForJs
      ] = true;

      const callNodePathBefore = [
        funcNamesDictPerThread['D.js'],
        funcNamesDictPerThread['F.js'],
      ];

      // Upgrader
      const callNodeString = uintArrayToString(callNodePathBefore);
      // focus-subtree transform with js implementation filter.
      const transformString = 'f-js-' + callNodeString;
      const { query } = upgradeLocationToCurrentVersion(
        {
          pathname: '',
          hash: '',
          query: {
            thread: '0',
            implementation: 'js',
            transforms: transformString,
            v: '3',
          },
        },
        profile
      );

      const callNodePathAfter = [
        funcNamesDictPerThread.BrelevantForJs,
        funcNamesDictPerThread['D.js'],
        funcNamesDictPerThread['F.js'],
      ];

      const newTransformNodeString =
        'f-js-' + uintArrayToString(callNodePathAfter);
      expect(query.transforms).toEqual(newTransformNodeString);
    });

    it('can upgrade the callNodePath in the second branch of the call tree', function() {
      const {
        profile,
        funcNamesDictPerThread: [funcNamesDictPerThread],
      } = getProfileFromTextSamples(`
        A               A
        B.js            B.js
        H               CrelevantForJs
        D               D
        G.js            E.js
      `);

      profile.threads[0].funcTable.relevantForJS[
        funcNamesDictPerThread.CrelevantForJs
      ] = true;

      const callNodePathBefore = [
        funcNamesDictPerThread['B.js'],
        funcNamesDictPerThread['E.js'],
      ];

      // Upgrader
      const callNodeString = uintArrayToString(callNodePathBefore);
      // focus-subtree transform with js implementation filter.
      const transformString = 'f-js-' + callNodeString;
      const { query } = upgradeLocationToCurrentVersion(
        {
          pathname: '',
          hash: '',
          query: {
            thread: '0',
            implementation: 'js',
            transforms: transformString,
            v: '3',
          },
        },
        profile
      );

      const callNodePathAfter = [
        funcNamesDictPerThread['B.js'],
        funcNamesDictPerThread.CrelevantForJs,
        funcNamesDictPerThread['E.js'],
      ];

      const newTransformNodeString =
        'f-js-' + uintArrayToString(callNodePathAfter);
      expect(query.transforms).toEqual(newTransformNodeString);
    });

    it('can upgrade the callNodePath in the second branch of the call tree with relevantForJs frame first', function() {
      const {
        profile,
        funcNamesDictPerThread: [funcNamesDictPerThread],
      } = getProfileFromTextSamples(`
        A               A
        BrelevantForJs  BrelevantForJs
        H               C.js
        D               D
        G.js            E.js
      `);

      profile.threads[0].funcTable.relevantForJS[
        funcNamesDictPerThread.BrelevantForJs
      ] = true;

      const callNodePathBefore = [
        funcNamesDictPerThread['C.js'],
        funcNamesDictPerThread['E.js'],
      ];

      // Upgrader
      const callNodeString = uintArrayToString(callNodePathBefore);
      // focus-subtree transform with js implementation filter.
      const transformString = 'f-js-' + callNodeString;
      const { query } = upgradeLocationToCurrentVersion(
        {
          pathname: '',
          hash: '',
          query: {
            thread: '0',
            implementation: 'js',
            transforms: transformString,
            v: '3',
          },
        },
        profile
      );

      const callNodePathAfter = [
        funcNamesDictPerThread.BrelevantForJs,
        funcNamesDictPerThread['C.js'],
        funcNamesDictPerThread['E.js'],
      ];

      const newTransformNodeString =
        'f-js-' + uintArrayToString(callNodePathAfter);
      expect(query.transforms).toEqual(newTransformNodeString);
    });
  });

  describe('version 5: implement ranges differently', () => {
    it('does not error when there is no range', () => {
      const { getState } = _getStoreWithURL({
        v: 4,
      });
      const committedRanges = urlStateReducers.getAllCommittedRanges(
        getState()
      );
      expect(committedRanges).toEqual([]);
    });

    it('converts when there is only one range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1.451_1.453',
        v: 4,
      });

      const committedRanges = urlStateReducers.getAllCommittedRanges(
        getState()
      );
      expect(committedRanges).toEqual([{ start: 1451, end: 1453 }]);
    });

    it('converts when there are several ranges', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=0.245_18.470~1.451_1.453',
        v: 4,
      });

      const committedRanges = urlStateReducers.getAllCommittedRanges(
        getState()
      );
      expect(committedRanges).toEqual([
        { start: 245, end: 18470 },
        { start: 1451, end: 1453 },
      ]);
    });

    it('supports ranges that start at the zero timestamp too', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=0.0000_0.2772',
        v: 4,
      });

      const committedRanges = urlStateReducers.getAllCommittedRanges(
        getState()
      );
      expect(committedRanges).toEqual([{ start: 0, end: 278 }]);
    });

    it('is permissive with invalid input', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getState } = _getStoreWithURL({
        // The first range has several dots, the second range is fully invalid,
        // only the 3rd range is valid.
        search: '?range=0.24.5_18.470~invalid~1.451_1.453',
        v: 4,
      });

      const committedRanges = urlStateReducers.getAllCommittedRanges(
        getState()
      );
      expect(committedRanges).toEqual([{ start: 1451, end: 1453 }]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  // More general checks
  it("won't run if the current version is specified", function() {
    const { getState } = _getStoreWithURL({
      pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/markers/',
      v: CURRENT_URL_VERSION, // This is the default, but still using it here to make it explicit
    });

    // The conversion process shouldn't run.
    // This is somewhat hacky: because we specified the last version, we expect
    // the v2 converter to not run, and so the selected tab shouldn't be
    // 'marker-table'. Note also that a 'markers' tab is invalid for the current
    // state of the application, so we won't have 'markers' as result.
    // We should change this to something more meaningful when we have eg
    // converters that reuse query names.
    expect(urlStateReducers.getSelectedTab(getState())).not.toBe(
      'marker-table'
    );
  });

  it('throws a specific error if a more recent version is specified', function() {
    expect(() =>
      _getStoreWithURL({
        v: CURRENT_URL_VERSION + 1,
      })
    ).toThrow(UrlUpgradeError);
  });
});

describe('URL serialization of the transform stack', function() {
  const transformString =
    'f-combined-012~mcn-combined-234~f-js-345-i~mf-6~ff-7~cr-combined-8-9~' +
    'rec-combined-10~df-11~cfs-12';
  const { getState } = _getStoreWithURL({
    search: '?transforms=' + transformString,
  });

  it('deserializes focus subtree transforms', function() {
    const transformStack = selectedThreadSelectors.getTransformStack(
      getState()
    );

    // The indexes don't necessarily map to anything logical in the profile fixture.
    expect(transformStack).toEqual([
      {
        type: 'focus-subtree',
        callNodePath: [0, 1, 2],
        implementation: 'combined',
        inverted: false,
      },
      {
        type: 'merge-call-node',
        callNodePath: [2, 3, 4],
        implementation: 'combined',
      },
      {
        type: 'focus-subtree',
        callNodePath: [3, 4, 5],
        implementation: 'js',
        inverted: true,
      },
      {
        type: 'merge-function',
        funcIndex: 6,
      },
      {
        type: 'focus-function',
        funcIndex: 7,
      },
      {
        type: 'collapse-resource',
        resourceIndex: 8,
        collapsedFuncIndex: 9,
        implementation: 'combined',
      },
      {
        type: 'collapse-direct-recursion',
        funcIndex: 10,
        implementation: 'combined',
      },
      {
        type: 'drop-function',
        funcIndex: 11,
      },
      {
        type: 'collapse-function-subtree',
        funcIndex: 12,
      },
    ]);
  });

  it('re-serializes the focus subtree transforms', function() {
    const urlState = urlStateReducers.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);
    expect(queryString).toContain(`transforms=${transformString}`);
  });
});

describe('urlFromState', function() {
  it('outputs no default parameters besides the current URL version', function() {
    const pathname =
      '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree';
    const newUrlState = stateFromLocation({
      pathname: pathname,
      search: '',
      hash: '',
    });
    expect(urlFromState(newUrlState)).toEqual(
      `${pathname}/?v=${CURRENT_URL_VERSION}`
    );
  });
});

describe('compare', function() {
  const url1 = 'http://fake-url.com/hash/1';
  const url2 = 'http://fake-url.com/hash/2';

  it('unserializes profiles URL properly', function() {
    const store = _getStoreWithURL(
      {
        pathname: '/compare/',
        search: oneLineTrim`
          ?profiles[]=${encodeURIComponent(url1)}
          &profiles[]=${encodeURIComponent(url2)}
        `,
      },
      /* no profile */ null
    );

    expect(urlStateReducers.getProfilesToCompare(store.getState())).toEqual([
      url1,
      url2,
    ]);
  });

  it('serializes profiles URL properly', function() {
    const store = _getStoreWithURL(
      { pathname: '/compare/' },
      /* no profile */ null
    );

    const initialUrl = urlFromState(
      urlStateReducers.getUrlState(store.getState())
    );
    expect(initialUrl).toEqual('/compare/');

    store.dispatch(changeProfilesToCompare([url1, url2]));
    const resultingUrl = urlFromState(
      urlStateReducers.getUrlState(store.getState())
    );
    expect(resultingUrl).toMatch(`profiles[]=${encodeURIComponent(url1)}`);
    expect(resultingUrl).toMatch(`profiles[]=${encodeURIComponent(url2)}`);
  });
});

describe('uploaded-recordings', function() {
  it('unserializes uploaded-recordings URLs', () => {
    const store = _getStoreWithURL(
      { pathname: '/uploaded-recordings' },
      /* no profile */ null
    );

    expect(urlStateReducers.getDataSource(store.getState())).toEqual(
      'uploaded-recordings'
    );
  });

  it('serializes uploaded-recordings URLs', () => {
    const store = _getStoreWithURL({ pathname: '/' }, /* no profile */ null);
    const initialUrl = urlFromState(
      urlStateReducers.getUrlState(store.getState())
    );
    expect(initialUrl).toEqual('/');

    store.dispatch(setDataSource('uploaded-recordings'));
    const resultingUrl = urlFromState(
      urlStateReducers.getUrlState(store.getState())
    );
    expect(resultingUrl).toEqual('/uploaded-recordings/');
  });
});

describe('last requested call tree summary strategy', function() {
  const { getLastSelectedCallTreeSummaryStrategy } = urlStateReducers;

  it('defaults to timing', function() {
    const { getState } = _getStoreWithURL();
    expect(getLastSelectedCallTreeSummaryStrategy(getState())).toEqual(
      'timing'
    );
  });

  it('can be js allocations', function() {
    const { getState } = _getStoreWithURL({
      search: '?ctSummary=js-allocations',
    });
    expect(getLastSelectedCallTreeSummaryStrategy(getState())).toEqual(
      'js-allocations'
    );
  });

  it('can be native allocations', function() {
    const { getState } = _getStoreWithURL({
      search: '?ctSummary=native-allocations',
    });
    expect(getLastSelectedCallTreeSummaryStrategy(getState())).toEqual(
      'native-allocations'
    );
  });

  it('will use the default "timing" when an unknown value is received', function() {
    const { getState } = _getStoreWithURL({
      search: '?ctSummary=unknown-value',
    });
    expect(getLastSelectedCallTreeSummaryStrategy(getState())).toEqual(
      'timing'
    );
  });
});
