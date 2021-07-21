/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { oneLineTrim } from 'common-tags';
import * as urlStateSelectors from '../selectors/url-state';
import {
  addTransformToStack,
  changeCallTreeSearchString,
  changeImplementationFilter,
  changeMarkersSearchString,
  changeNetworkSearchString,
  changeProfileName,
  changeSelectedThreads,
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
import type {
  Profile,
  StartEndRange,
  Store,
  State,
} from 'firefox-profiler/types';
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
import { encodeUintArrayForUrlComponent } from '../utils/uintarray-encoding';
import {
  getActiveTabGlobalTracks,
  getActiveTabResourceTracks,
} from '../selectors/profile';
import { getView } from '../selectors/app';
import { SYMBOL_SERVER_URL } from '../app-logic/constants';
import { getThreadsKey } from '../profile-logic/profile-data';

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

// Serialize the URL of the current state, and create a new store from that URL.
function _getStoreFromStateAfterUrlRoundtrip(
  state: State,
  profile: Profile | null = getProfile()
): Store {
  const urlState = urlStateSelectors.getUrlState(state);
  const url = urlFromState(urlState);

  const newUrlState = stateFromLocation(
    new URL(url, 'https://profiler.firefox.com')
  );

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
    expect(urlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
      new Set([1])
    );
  });

  it('selects a default thread when a wrong thread has been requested', function() {
    const { getState } = setup(100);

    // "2" is the content process' main tab
    expect(urlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
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
      const { getState } = initWithSearchParams('?globalTrackOrder=10');
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
      const { getState } = initWithSearchParams('?globalTrackOrder=10');
      expect(urlStateSelectors.getGlobalTrackOrder(getState())).toEqual([1, 0]);
    });

    it('will not accept invalid hidden threads', function() {
      const { getState } = initWithSearchParams(
        '?hiddenGlobalTracks=089&thread=1'
      );
      expect(urlStateSelectors.getHiddenGlobalTracks(getState())).toEqual(
        new Set([0])
      );
    });
  });

  describe('local tracks', function() {
    it('can reorder local tracks', function() {
      const { getState } = initWithSearchParams('?localTrackOrderByPid=222-10');
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
    expect(urlStateSelectors.getCurrentSearchString(getState())).toBe('string');
    expect(urlStateSelectors.getSearchStrings(getState())).toEqual(['string']);
  });

  it('properly handles the call tree search string stacks with several items', function() {
    const { getState } = _getStoreWithURL({
      search: '?search=string,foo,%20bar',
    });
    expect(urlStateSelectors.getCurrentSearchString(getState())).toBe(
      'string,foo, bar'
    );
    expect(urlStateSelectors.getSearchStrings(getState())).toEqual([
      'string',
      'foo',
      'bar',
    ]);
  });

  it('properly handles marker search strings', function() {
    const { getState } = _getStoreWithURL({
      search: '?markerSearch=otherString',
    });
    expect(urlStateSelectors.getMarkersSearchString(getState())).toBe(
      'otherString'
    );
  });

  it('properly handles showUserTimings strings', function() {
    const { getState } = _getStoreWithURL({ search: '' });
    expect(urlStateSelectors.getShowUserTimings(getState())).toBe(false);
  });

  it('defaults to not showing user timings', function() {
    const { getState } = _getStoreWithURL();
    expect(urlStateSelectors.getShowUserTimings(getState())).toBe(false);
  });

  it('serializes the call tree search strings in the URL', function() {
    const { getState, dispatch } = _getStoreWithURL();

    const callTreeSearchString = 'some, search, string';

    dispatch(changeCallTreeSearchString(callTreeSearchString));

    ['calltree', 'stack-chart', 'flame-graph'].forEach(tabSlug => {
      dispatch(changeSelectedTab(tabSlug));
      const urlState = urlStateSelectors.getUrlState(getState());
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
      const urlState = urlStateSelectors.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`markerSearch=${markerSearchString}`);
    });
  });

  it('serializes the network search string in the URL', function() {
    const { getState, dispatch } = _getStoreWithURL();

    const networkSearchString = 'abc';

    dispatch(changeNetworkSearchString(networkSearchString));
    dispatch(changeSelectedTab('network-chart'));
    const urlState = urlStateSelectors.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);
    expect(queryString).toContain(`networkSearch=${networkSearchString}`);
  });
});

describe('profileName', function() {
  it('serializes the profileName in the URL', function() {
    const { getState, dispatch } = _getStoreWithURL();
    const profileName = 'Good Profile';

    dispatch(changeProfileName(profileName));
    const urlState = urlStateSelectors.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);
    expect(queryString).toContain(
      `profileName=${encodeURIComponent(profileName)}`
    );
  });

  it('reflects in the state from URL', function() {
    const { getState } = _getStoreWithURL({
      search: '?profileName=XXX',
    });
    expect(urlStateSelectors.getProfileNameFromUrl(getState())).toBe('XXX');
    expect(urlStateSelectors.getProfileNameWithDefault(getState())).toBe('XXX');
  });

  it('provides default values for when no profile name is given', function() {
    const { getState } = _getStoreWithURL();
    expect(urlStateSelectors.getProfileNameFromUrl(getState())).toBe(null);
    expect(urlStateSelectors.getProfileNameWithDefault(getState())).toBe(
      'Firefox'
    );
  });
});

describe('ctxId', function() {
  it('serializes the ctxId in the URL', function() {
    const { profile } = addActiveTabInformationToProfile(
      getProfileWithNiceTracks()
    );
    const { getState, dispatch } = _getStoreWithURL({}, profile);
    const tabID = 123;

    dispatch(changeTimelineTrackOrganization({ type: 'active-tab', tabID }));
    const urlState = urlStateSelectors.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);
    expect(queryString).toContain(`ctxId=${tabID}`);
  });

  it('reflects in the state from URL', function() {
    const { profile } = addActiveTabInformationToProfile(
      getProfileWithNiceTracks()
    );
    const { getState } = _getStoreWithURL(
      {
        search: '?ctxId=123&view=active-tab',
      },
      profile
    );
    expect(urlStateSelectors.getTimelineTrackOrganization(getState())).toEqual({
      type: 'active-tab',
      tabID: 123,
    });
  });

  it('returns the full view when ctxId is not specified', function() {
    const { profile } = addActiveTabInformationToProfile(
      getProfileWithNiceTracks()
    );
    const { getState } = _getStoreWithURL({}, profile);
    expect(urlStateSelectors.getTimelineTrackOrganization(getState())).toEqual({
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
    const { profile } = addActiveTabInformationToProfile(
      getProfileWithNiceTracks()
    );
    const { getState } = _getStoreWithURL(
      {
        search:
          '?ctxId=123&view=active-tab&globalTrackOrder=3w0&hiddenGlobalTracks=45&hiddenLocalTracksByPid=111-1&thread=0',
      },
      profile
    );

    const newUrl = new URL(
      urlFromState(urlStateSelectors.getUrlState(getState())),
      'https://profiler.firefox.com'
    );
    // The url states that are relevant to full view should be stripped out.
    expect(newUrl.search).toEqual(
      `?ctxId=123&thread=0&v=${CURRENT_URL_VERSION}&view=active-tab`
    );
  });

  it('if not present in the URL, still manages to load the active tab view', function() {
    const { profile } = addActiveTabInformationToProfile(
      getProfileWithNiceTracks()
    );
    const { getState } = _getStoreWithURL(
      {
        search: '?view=active-tab',
      },
      profile
    );

    expect(getView(getState()).phase).toEqual('DATA_LOADED');
    expect(urlStateSelectors.getTimelineTrackOrganization(getState())).toEqual({
      type: 'active-tab',
      tabID: null,
    });
  });
});

describe('committed ranges', function() {
  describe('serialization', () => {
    it('serializes when there is no range', () => {
      const { getState } = _getStoreWithURL();
      const urlState = urlStateSelectors.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).not.toContain(`range=`);
    });

    it('serializes when there is 1 range', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1514.587845, 25300));
      const urlState = urlStateSelectors.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`range=1514m23786`); // 1.514s + 23786ms
    });

    it('serializes when rounding down the start', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1510.58, 1519.59));
      const urlState = urlStateSelectors.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`range=1510m10`); // 1.510s + 10ms
    });

    it('serializes when the duration is 0', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1514, 1514));
      const urlState = urlStateSelectors.getUrlState(getState());
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
      const urlState = urlStateSelectors.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);

      // 1- 1.5145s + 23786ms
      // 2- 1.8s + 100µs
      expect(queryString).toContain(`range=1514m23786~1800000u100`);
    });

    it('serializes when there is a small range', () => {
      const { getState, dispatch } = _getStoreWithURL();
      dispatch(commitRange(1000.08, 1000.09));
      const urlState = urlStateSelectors.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`range=1000080u10`); // 1s and 80µs + 10µs
    });

    it('serializes when there is a very small range', () => {
      const { getState, dispatch } = _getStoreWithURL();
      dispatch(commitRange(1000.00008, 1000.0001));
      const urlState = urlStateSelectors.getUrlState(getState());
      const queryString = getQueryStringFromUrlState(urlState);
      expect(queryString).toContain(`range=1000000080n20`); // 1s and 80ns + 20ns
    });
  });

  describe('parsing', () => {
    it('deserializes when there is no range', () => {
      const { getState } = _getStoreWithURL();
      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([]);
    });

    it('deserializes when there is 1 range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1600m5000',
      });
      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 1600, end: 6600 },
      ]);
    });

    it('deserializes when there are several ranges', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1600m5000~2245m24',
      });
      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 1600, end: 6600 },
        { start: 2245, end: 2269 },
      ]);
    });

    it('deserializes when there is a small range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1678900u100',
      });
      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 1678.9, end: 1679 },
      ]);
    });

    it('deserializes when there is a very small range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1678123900n100',
      });

      const [committedRange] = urlStateSelectors.getAllCommittedRanges(
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
      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([
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

      const urlState = urlStateSelectors.getUrlState(getState());
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

      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 1514, end: 25300 },
        { start: 1800, end: 1800.1 },
        { start: 1800.00008, end: 1800.0001 },
      ]);
    });

    it('will round values near the threshold', () => {
      const { getState } = setup([{ start: 50000, end: 50009.9 }]);

      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 50000, end: 50010 },
      ]);
    });

    it('supports negative start values', () => {
      const { getState } = setup([{ start: -1000, end: 1000 }]);

      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: -1000, end: 1000 },
      ]);
    });

    it('supports zero start values', () => {
      const { getState } = setup([{ start: 0, end: 1000 }]);

      expect(urlStateSelectors.getAllCommittedRanges(getState())).toEqual([
        { start: 0, end: 1000 },
      ]);
    });
  });
});

describe('implementation', function() {
  function setup(settings, profile) {
    const store = _getStoreWithURL(settings, profile);

    function getQueryString() {
      const urlState = urlStateSelectors.getUrlState(store.getState());
      const queryString = getQueryStringFromUrlState(urlState);
      return queryString;
    }

    return {
      ...store,
      getQueryString,
    };
  }

  describe('serializing', () => {
    it('skips the value "combined"', () => {
      const { dispatch, getQueryString } = setup();

      expect(getQueryString()).not.toContain('implementation=');

      dispatch(changeImplementationFilter('combined'));
      expect(getQueryString()).not.toContain('implementation=');
    });

    it.each(['js', 'cpp'])(
      'can serialize the value "%s"',
      implementationFilter => {
        const { getQueryString, dispatch } = setup();
        dispatch(changeImplementationFilter(implementationFilter));
        expect(getQueryString()).toContain(
          `implementation=${implementationFilter}`
        );
      }
    );
  });

  describe('parsing', () => {
    it('deserializes when there is no implementation value', () => {
      const { getState } = setup();
      expect(urlStateSelectors.getImplementationFilter(getState())).toBe(
        'combined'
      );
    });

    it.each(['js', 'cpp'])(
      'deserializes known value %s',
      implementationFilter => {
        const { getState } = setup({
          search: `?implementation=${implementationFilter}`,
        });
        expect(urlStateSelectors.getImplementationFilter(getState())).toBe(
          implementationFilter
        );
      }
    );

    it('deserializes unknown values', () => {
      const { getState } = setup({
        search: '?implementation=foobar',
      });
      expect(urlStateSelectors.getImplementationFilter(getState())).toBe(
        'combined'
      );
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
      expect(urlStateSelectors.getSelectedTab(getState())).toBe('stack-chart');
    });

    it('switches to the marker-table when given a markers tab', function() {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/markers/',
        v: false,
      });
      expect(urlStateSelectors.getSelectedTab(getState())).toBe('marker-table');
    });
  });

  describe('version 3: remove platform only option', function() {
    it('switches to the stack chart when given a timeline tab', function() {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/timeline/',
        search: '?hidePlatformDetails',
        v: 2,
      });
      expect(urlStateSelectors.getImplementationFilter(getState())).toBe('js');
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
      const callNodeString = encodeUintArrayForUrlComponent(callNodePathBefore);
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
        'f-js-' + encodeUintArrayForUrlComponent(callNodePathAfter);
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
      const callNodeString = encodeUintArrayForUrlComponent(callNodePathBefore);
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
        'f-js-' + encodeUintArrayForUrlComponent(callNodePathAfter);
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
      const callNodeString = encodeUintArrayForUrlComponent(callNodePathBefore);
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
        'f-js-' + encodeUintArrayForUrlComponent(callNodePathAfter);
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
      const callNodeString = encodeUintArrayForUrlComponent(callNodePathBefore);
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
        'f-js-' + encodeUintArrayForUrlComponent(callNodePathAfter);
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
      const callNodeString = encodeUintArrayForUrlComponent(callNodePathBefore);
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
        'f-js-' + encodeUintArrayForUrlComponent(callNodePathAfter);
      expect(query.transforms).toEqual(newTransformNodeString);
    });
  });

  describe('version 5: implement ranges differently', () => {
    it('does not error when there is no range', () => {
      const { getState } = _getStoreWithURL({
        v: 4,
      });
      const committedRanges = urlStateSelectors.getAllCommittedRanges(
        getState()
      );
      expect(committedRanges).toEqual([]);
    });

    it('converts when there is only one range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1.451_1.453',
        v: 4,
      });

      const committedRanges = urlStateSelectors.getAllCommittedRanges(
        getState()
      );
      expect(committedRanges).toEqual([{ start: 1451, end: 1453 }]);
    });

    it('converts when there are several ranges', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=0.245_18.470~1.451_1.453',
        v: 4,
      });

      const committedRanges = urlStateSelectors.getAllCommittedRanges(
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

      const committedRanges = urlStateSelectors.getAllCommittedRanges(
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

      const committedRanges = urlStateSelectors.getAllCommittedRanges(
        getState()
      );
      expect(committedRanges).toEqual([{ start: 1451, end: 1453 }]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('version 6: change encoding of fields with TrackIndex lists', function() {
    it('parses version 5 correctly', function() {
      const { getState } = _getStoreWithURL(
        {
          pathname:
            '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/calltree/',
          search:
            '?globalTrackOrder=5-0-1-2-3-4&hiddenGlobalTracks=5-3-4&localTrackOrderByPid=1234-1-0~345-2-0-1&hiddenLocalTracksByPid=678-2-3-0&thread=12',
          v: 5,
        },
        null
      );
      const state = getState();
      expect(urlStateSelectors.getGlobalTrackOrder(state)).toEqual([
        5,
        0,
        1,
        2,
        3,
        4,
      ]);
      expect(urlStateSelectors.getHiddenGlobalTracks(state)).toEqual(
        new Set([3, 4, 5])
      );
      expect(urlStateSelectors.getLocalTrackOrderByPid(state)).toEqual(
        new Map([
          [1234, [1, 0]],
          [345, [2, 0, 1]],
        ])
      );
      expect(urlStateSelectors.getLocalTrackOrderByPid(state)).toEqual(
        new Map([
          [1234, [1, 0]],
          [345, [2, 0, 1]],
        ])
      );
      expect(urlStateSelectors.getHiddenLocalTracksByPid(state)).toEqual(
        new Map([[678, new Set([0, 2, 3])]])
      );
      expect(urlStateSelectors.getSelectedThreadIndexesOrNull(state)).toEqual(
        new Set([12])
      );
    });

    it('parses version 5 with multiple selected threads (comma-separated)', function() {
      const { getState } = _getStoreWithURL(
        {
          pathname:
            '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/calltree/',
          search: '?thread=3%2C12%2C7',
          v: 5,
        },
        null
      );
      const state = getState();
      expect(urlStateSelectors.getSelectedThreadIndexesOrNull(state)).toEqual(
        new Set([3, 7, 12])
      );
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
    expect(urlStateSelectors.getSelectedTab(getState())).not.toBe(
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
    'f-combined-0w2~mcn-combined-2w4~f-js-3w5-i~mf-6~ff-7~cr-combined-8-9~' +
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
    const urlState = urlStateSelectors.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);
    expect(queryString).toContain(`transforms=${transformString}`);
  });
});

describe('URL persistence of transform stacks for a combined thread (multi-thread selection)', function() {
  function setup() {
    const store = _getStoreWithURL();
    const { dispatch } = store;
    dispatch(
      addTransformToStack(0, {
        type: 'focus-subtree',
        callNodePath: [0, 1, 2],
        implementation: 'combined',
        inverted: false,
      })
    );
    dispatch(
      addTransformToStack(1, {
        type: 'collapse-resource',
        resourceIndex: 8,
        collapsedFuncIndex: 9,
        implementation: 'combined',
      })
    );
    dispatch(
      addTransformToStack(getThreadsKey(new Set([0, 2])), {
        type: 'drop-function',
        funcIndex: 11,
      })
    );
    return store;
  }

  it('persists the transform for thread 0 if thread 0 is selected', function() {
    const { dispatch, getState } = setup();
    dispatch(changeSelectedThreads(new Set([0])));
    const newStore = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getSelectedThreadIndexesOrNull(newStore.getState())
    ).toEqual(new Set([0]));

    const transformStack = selectedThreadSelectors.getTransformStack(
      newStore.getState()
    );
    expect(transformStack).toEqual([
      {
        type: 'focus-subtree',
        callNodePath: [0, 1, 2],
        implementation: 'combined',
        inverted: false,
      },
    ]);

    newStore.dispatch(changeSelectedThreads(new Set([1])));
    const transformStackForDifferentThread = selectedThreadSelectors.getTransformStack(
      newStore.getState()
    );
    expect(transformStackForDifferentThread).toEqual([]);
  });

  it('persists the transform for thread 1 if thread 1 is selected', function() {
    const { dispatch, getState } = setup();
    dispatch(changeSelectedThreads(new Set([1])));
    const newStore = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getSelectedThreadIndexesOrNull(newStore.getState())
    ).toEqual(new Set([1]));

    const transformStack = selectedThreadSelectors.getTransformStack(
      newStore.getState()
    );
    expect(transformStack).toEqual([
      {
        type: 'collapse-resource',
        resourceIndex: 8,
        collapsedFuncIndex: 9,
        implementation: 'combined',
      },
    ]);
  });

  it('persists the transform for thread 2 if thread 2 is selected', function() {
    const { dispatch, getState } = setup();
    dispatch(changeSelectedThreads(new Set([2])));
    const newStore = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getSelectedThreadIndexesOrNull(newStore.getState())
    ).toEqual(new Set([2]));

    const transformStack = selectedThreadSelectors.getTransformStack(
      newStore.getState()
    );
    expect(transformStack).toEqual([]);
  });

  it('persists the transform for the combined thread of 0+1 if threads 0 and 1 are selected', function() {
    const { dispatch, getState } = setup();
    dispatch(changeSelectedThreads(new Set([0, 2])));
    const newStore = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getSelectedThreadIndexesOrNull(newStore.getState())
    ).toEqual(new Set([0, 2]));

    const transformStack = selectedThreadSelectors.getTransformStack(
      newStore.getState()
    );
    expect(transformStack).toEqual([
      {
        type: 'drop-function',
        funcIndex: 11,
      },
    ]);
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

    expect(urlStateSelectors.getProfilesToCompare(store.getState())).toEqual([
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
      urlStateSelectors.getUrlState(store.getState())
    );
    expect(initialUrl).toEqual('/compare/');

    store.dispatch(changeProfilesToCompare([url1, url2]));
    const resultingUrl = urlFromState(
      urlStateSelectors.getUrlState(store.getState())
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

    expect(urlStateSelectors.getDataSource(store.getState())).toEqual(
      'uploaded-recordings'
    );
  });

  it('serializes uploaded-recordings URLs', () => {
    const store = _getStoreWithURL({ pathname: '/' }, /* no profile */ null);
    const initialUrl = urlFromState(
      urlStateSelectors.getUrlState(store.getState())
    );
    expect(initialUrl).toEqual('/');

    store.dispatch(setDataSource('uploaded-recordings'));
    const resultingUrl = urlFromState(
      urlStateSelectors.getUrlState(store.getState())
    );
    expect(resultingUrl).toEqual('/uploaded-recordings/');
  });
});

describe('last requested call tree summary strategy', function() {
  const { getLastSelectedCallTreeSummaryStrategy } = urlStateSelectors;

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

describe('symbolServerUrl', function() {
  function setup(search: string) {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getState } = _getStoreWithURL({ search });
    const symbolServerUrl = urlStateSelectors.getSymbolServerUrl(getState());
    const urlState = urlStateSelectors.getUrlState(getState());
    const queryString = getQueryStringFromUrlState(urlState);

    return {
      symbolServerUrl,
      queryString,
    };
  }

  it('defaults to the Mozilla symbol server', function() {
    const { symbolServerUrl, queryString } = setup('');
    expect(symbolServerUrl).toEqual(SYMBOL_SERVER_URL);
    expect(symbolServerUrl.substr(-1)).not.toEqual('/');
    expect(queryString).not.toContain('symbolServer=');
  });

  it('can be switch to a custom localhost server', function() {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=http://localhost:1234/symbols'
    );
    expect(symbolServerUrl).toEqual('http://localhost:1234/symbols');
    expect(queryString).toContain(
      'symbolServer=http%3A%2F%2Flocalhost%3A1234%2Fsymbols'
    );
  });

  it('removes any trailing slash', function() {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=http://localhost:1234/'
    );
    expect(symbolServerUrl).toEqual('http://localhost:1234');
    expect(queryString).toContain(
      'symbolServer=http%3A%2F%2Flocalhost%3A1234%2F'
    );
  });

  it('will error when switching to an unknown host', function() {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=https://symbols.mozilla.org.example.com/symbols'
    );
    expect(symbolServerUrl).toEqual(SYMBOL_SERVER_URL);
    expect(queryString).toContain(
      'symbolServer=https%3A%2F%2Fsymbols.mozilla.org.example.com%2Fsymbols'
    );
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will error when switching to an invalid host', function() {
    const { symbolServerUrl, queryString } = setup('?symbolServer=invalid');
    expect(symbolServerUrl).toEqual(SYMBOL_SERVER_URL);
    expect(queryString).toContain('symbolServer=invalid');
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will error when switching to an allowed but non-https host', function() {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=http://symbols.mozilla.org/'
    );
    expect(symbolServerUrl).toEqual(SYMBOL_SERVER_URL);
    expect(queryString).toContain(
      'symbolServer=http%3A%2F%2Fsymbols.mozilla.org%2F'
    );
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will allow an allowed https host', function() {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=https://symbolication.stage.mozaws.net'
    );
    expect(symbolServerUrl).toEqual('https://symbolication.stage.mozaws.net');
    expect(queryString).toContain(
      'symbolServer=https%3A%2F%2Fsymbolication.stage.mozaws.net'
    );
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will strip the trailing slash on an allowed https host', function() {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=https://symbolication.stage.mozaws.net/'
    );
    expect(symbolServerUrl).toEqual('https://symbolication.stage.mozaws.net');
    expect(queryString).toContain(
      'symbolServer=https%3A%2F%2Fsymbolication.stage.mozaws.net%2F'
    );
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will allow a a subdirectory path on an allowed https host', function() {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=https://symbolication.stage.mozaws.net/subdir/'
    );
    expect(symbolServerUrl).toEqual(
      'https://symbolication.stage.mozaws.net/subdir'
    );
    expect(queryString).toContain(
      'symbolServer=https%3A%2F%2Fsymbolication.stage.mozaws.net%2Fsubdir%2F'
    );
    expect(console.error.mock.calls).toMatchSnapshot();
  });
});
