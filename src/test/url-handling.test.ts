/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
  changeGlobalTrackOrder,
  changeLocalTrackOrder,
  commitRange,
  setDataSource,
  updateBottomBoxContentsAndMaybeOpen,
  closeBottomBox,
  changeShowUserTimings,
  changeStackChartSameWidths,
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
import { viewProfile, changeTabFilter } from '../actions/receive-profile';
import type {
  Profile,
  StartEndRange,
  Store,
  State,
  ThreadIndex,
} from 'firefox-profiler/types';
import getNiceProfile from './fixtures/profiles/call-nodes';
import queryString from 'query-string';
import {
  getHumanReadableTracks,
  getProfileWithNiceTracks,
} from './fixtures/profiles/tracks';
import { getProfileFromTextSamples } from './fixtures/profiles/processed-profile';
import { selectedThreadSelectors } from '../selectors/per-thread';
import {
  encodeUintArrayForUrlComponent,
  encodeUintSetForUrlComponent,
} from '../utils/uintarray-encoding';
import { getProfile } from '../selectors/profile';
import { SYMBOL_SERVER_URL } from '../app-logic/constants';
import { getThreadsKey } from '../profile-logic/profile-data';

type StoreUrlSettings = {
  pathname?: string;
  search?: string;
  hash?: string;
  v?: number | false; // If v is false, do not add a v parameter to the search string.
};

function _getStoreWithURL(
  settings: StoreUrlSettings = {},
  profile: Profile | null = getNiceProfile()
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

function getQueryStringFromState(state: State) {
  const urlState = urlStateSelectors.getUrlState(state);
  const queryString = getQueryStringFromUrlState(urlState);
  return queryString;
}

// Serialize the URL of the current state, and create a new store from that URL.
function _getStoreFromStateAfterUrlRoundtrip(state: State): Store {
  const profile = getProfile(state);
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

describe('selectedThread', function () {
  function dispatchUrlWithThread(
    store: Store,
    threadIndexSet: Set<ThreadIndex>
  ) {
    const serializedSelectedThreads =
      encodeUintSetForUrlComponent(threadIndexSet);
    const newUrlState = stateFromLocation({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree/',
      search: `?thread=${serializedSelectedThreads}&v=${CURRENT_URL_VERSION}`,
      hash: '',
    });
    store.dispatch({
      type: 'UPDATE_URL_STATE',
      newUrlState,
    });
  }

  function setup(threadIndexSet: Set<ThreadIndex>) {
    const store = blankStore();
    dispatchUrlWithThread(store, threadIndexSet);

    const { profile } = getProfileFromTextSamples('A', 'B', 'C', 'D');
    Object.assign(profile.threads[0], {
      name: 'GeckoMain',
      pid: '123',
    });
    Object.assign(profile.threads[1], {
      name: 'Compositor',
      pid: '123',
    });
    Object.assign(profile.threads[2], {
      name: 'GeckoMain',
      processType: 'tab',
      pid: '246',
    });
    Object.assign(profile.threads[3], {
      name: 'GeckoMain',
      processType: 'tab',
      pid: '789',
    });

    store.dispatch(viewProfile(profile));

    return store;
  }

  it('selects the right thread when receiving a profile from web', function () {
    const { getState } = setup(new Set([1]));
    expect(urlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
      new Set([1])
    );
  });

  it('selects a default thread when a wrong thread has been requested', function () {
    const { getState } = setup(new Set([100]));

    // "2" is the content process' main tab
    expect(urlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
      new Set([2])
    );
  });

  it('selects the right threads (multi selection) when receiving a profile from web', function () {
    const { getState } = setup(new Set([0, 2]));
    expect(urlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
      new Set([0, 2])
    );
  });
});

describe('url handling tracks', function () {
  function initWithSearchParams(search: string) {
    return _getStoreWithURL({ search }, getProfileWithNiceTracks());
  }

  describe('global tracks', function () {
    it('creates tracks without any set search parameters', function () {
      const { getState } = initWithSearchParams('');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can reorder global tracks', function () {
      const { getState } = initWithSearchParams('?globalTrackOrder=10');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain default] SELECTED',
      ]);
    });

    it('can hide tracks', function () {
      const { getState } = initWithSearchParams('?hiddenGlobalTracks=1');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('will not accept invalid tracks in the thread order', function () {
      const { getState } = initWithSearchParams('?globalTrackOrder=102');
      // This will result in being the default order.
      expect(urlStateSelectors.getGlobalTrackOrder(getState())).toEqual([0, 1]);
    });

    it('will not accept invalid hidden threads', function () {
      const { getState } = initWithSearchParams(
        '?hiddenGlobalTracks=089&thread=1'
      );
      expect(urlStateSelectors.getHiddenGlobalTracks(getState())).toEqual(
        new Set([0])
      );
    });

    it('keeps the order at reload', function () {
      // In this test, we want to have indexes greater than 10. So we generate
      // 15 threads with the same information.
      const aLotOfThreads = Array.from({ length: 15 }, () => 'A');
      const { profile } = getProfileFromTextSamples(...aLotOfThreads);

      // Set a different pid for each thread, so that they're only global tracks.
      profile.threads.forEach((thread, i) => {
        thread.pid = `${i}`;
      });

      const store = _getStoreWithURL({}, profile);
      store.dispatch(
        changeGlobalTrackOrder([
          5, 4, 2, 11, 9, 1, 12, 13, 14, 3, 7, 8, 10, 6, 0,
        ])
      );

      const previousOrder = urlStateSelectors.getGlobalTrackOrder(
        store.getState()
      );

      // This simulates a page reload.
      const storeAfterReload = _getStoreFromStateAfterUrlRoundtrip(
        store.getState()
      );
      expect(
        urlStateSelectors.getGlobalTrackOrder(storeAfterReload.getState())
      ).toEqual(previousOrder);
    });
  });

  describe('local tracks', function () {
    it('can reorder local tracks', function () {
      const { dispatch, getState } = initWithSearchParams('');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // The URL parameter for localTrackOrderByPid should be empty.
      expect(getQueryStringFromState(getState())).not.toContain(
        'localTrackOrderByPid='
      );

      // Change the order of Style and DOM Worker
      dispatch(changeLocalTrackOrder('222', [1, 0]));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread Style]',
        '  - show [thread DOM Worker]',
      ]);

      // Now the URL parameter for localTrackOrderByPid should contain this change.
      expect(getQueryStringFromState(getState())).toContain(
        'localTrackOrderByPid=222-10'
      );

      const previousOrder =
        urlStateSelectors.getLocalTrackOrderByPid(getState());
      // This simulates a page reload.
      const storeAfterReload = _getStoreFromStateAfterUrlRoundtrip(getState());
      expect(
        urlStateSelectors.getLocalTrackOrderByPid(storeAfterReload.getState())
      ).toEqual(previousOrder);

      expect(getHumanReadableTracks(storeAfterReload.getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread Style]',
        '  - show [thread DOM Worker]',
      ]);
    });

    it('can hide local tracks', function () {
      const { getState } = initWithSearchParams(
        '?hiddenLocalTracksByPid=222-1'
      );
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    // This is a test for issue https://github.com/firefox-devtools/profiler/issues/1389
    it('can select a local track without mixing track and thread indexes', function () {
      // We're building a very specific profile, where local track indexes and
      // thread indexes could be confused. This is easier if we have local
      // tracks for the first process, because then the thread indexes and the
      // local track indexes are off by one.
      const { profile } = getProfileFromTextSamples('A', 'B', 'C');
      const [thread1, thread2, thread3] = profile.threads;
      thread1.name = 'GeckoMain';
      thread1.isMainThread = true;
      thread1.pid = '111';

      thread2.name = 'DOM Worker';
      thread2.processType = 'tab';
      thread2.pid = '111';

      thread3.name = 'Style';
      thread3.processType = 'tab';
      thread3.pid = '111';

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
        'show [thread GeckoMain default]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });
  });

  describe('legacy thread information', function () {
    it('handles legacy thread ordering', function () {
      // Flip the threads around
      const { getState } = initWithSearchParams('?threadOrder=3-2-1-0');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain tab]',
        '  - show [thread Style]',
        '  - show [thread DOM Worker]',
        'show [thread GeckoMain default] SELECTED',
      ]);
    });

    it('handles legacy thread hiding', function () {
      // Flip the threads around
      const { getState } = initWithSearchParams('?hiddenThreads=0-2');
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });
  });
});

describe('search strings', function () {
  it('properly handles the call tree search string stacks with 1 item', function () {
    const { getState } = _getStoreWithURL({ search: '?search=string' });
    expect(urlStateSelectors.getCurrentSearchString(getState())).toBe('string');
    expect(urlStateSelectors.getSearchStrings(getState())).toEqual(['string']);
  });

  it('properly handles the call tree search string stacks with several items', function () {
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

  it('properly handles marker search strings', function () {
    const { getState } = _getStoreWithURL({
      search: '?markerSearch=otherString',
    });
    expect(urlStateSelectors.getMarkersSearchString(getState())).toBe(
      'otherString'
    );
  });

  it('serializes the call tree search strings in the URL', function () {
    const { getState, dispatch } = _getStoreWithURL();

    const callTreeSearchString = 'some, search, string';

    dispatch(changeCallTreeSearchString(callTreeSearchString));

    [
      'calltree' as const,
      'stack-chart' as const,
      'flame-graph' as const,
    ].forEach((tabSlug) => {
      dispatch(changeSelectedTab(tabSlug));
      const queryString = getQueryStringFromState(getState());
      expect(queryString).toContain(
        `search=${encodeURIComponent(callTreeSearchString)}`
      );
    });
  });

  it('serializes the marker search string in the URL', function () {
    const { getState, dispatch } = _getStoreWithURL();

    const markerSearchString = 'abc';

    dispatch(changeMarkersSearchString(markerSearchString));

    ['marker-chart' as const, 'marker-table' as const].forEach((tabSlug) => {
      dispatch(changeSelectedTab(tabSlug));
      const queryString = getQueryStringFromState(getState());
      expect(queryString).toContain(`markerSearch=${markerSearchString}`);
    });
  });

  it('serializes the network search string in the URL', function () {
    const { getState, dispatch } = _getStoreWithURL();

    const networkSearchString = 'abc';

    dispatch(changeNetworkSearchString(networkSearchString));
    dispatch(changeSelectedTab('network-chart'));
    const queryString = getQueryStringFromState(getState());
    expect(queryString).toContain(`networkSearch=${networkSearchString}`);
  });
});

describe('profileName', function () {
  it('serializes the profileName in the URL', function () {
    const { getState, dispatch } = _getStoreWithURL();
    const profileName = 'Good Profile';

    dispatch(changeProfileName(profileName));
    const queryString = getQueryStringFromState(getState());
    expect(queryString).toContain(
      `profileName=${encodeURIComponent(profileName)}`
    );
  });

  it('reflects in the state from URL', function () {
    const { getState } = _getStoreWithURL({
      search: '?profileName=XXX',
    });
    expect(urlStateSelectors.getProfileNameFromUrl(getState())).toBe('XXX');
    expect(urlStateSelectors.getProfileNameWithDefault(getState())).toBe('XXX');
  });

  it('provides default values for when no profile name is given', function () {
    const { getState } = _getStoreWithURL();
    expect(urlStateSelectors.getProfileNameFromUrl(getState())).toBe(null);
    expect(urlStateSelectors.getProfileNameWithDefault(getState())).toBe(
      'Firefox'
    );
  });
});

describe('committed ranges', function () {
  describe('serialization', () => {
    it('serializes when there is no range', () => {
      const { getState } = _getStoreWithURL();
      const queryString = getQueryStringFromState(getState());
      expect(queryString).not.toContain(`range=`);
    });

    it('serializes when there is 1 range', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1514.587845, 25300));
      const queryString = getQueryStringFromState(getState());
      expect(queryString).toContain(`range=1514m23786`); // 1.514s + 23786ms
    });

    it('serializes when rounding down the start', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1510.58, 1519.59));
      const queryString = getQueryStringFromState(getState());
      expect(queryString).toContain(`range=1510m10`); // 1.510s + 10ms
    });

    it('serializes when the duration is 0', () => {
      const { getState, dispatch } = _getStoreWithURL();

      dispatch(commitRange(1514, 1514));
      const queryString = getQueryStringFromState(getState());
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
      const queryString = getQueryStringFromState(getState());

      // 1- 1.5145s + 23786ms
      // 2- 1.8s + 100µs
      expect(queryString).toContain(`range=1514m23786~1800000u100`);
    });

    it('serializes when there is a small range', () => {
      const { getState, dispatch } = _getStoreWithURL();
      dispatch(commitRange(1000.08, 1000.09));
      const queryString = getQueryStringFromState(getState());
      expect(queryString).toContain(`range=1000080u10`); // 1s and 80µs + 10µs
    });

    it('serializes when there is a very small range', () => {
      const { getState, dispatch } = _getStoreWithURL();
      dispatch(commitRange(1000.00008, 1000.0001));
      const queryString = getQueryStringFromState(getState());
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

      const [committedRange] =
        urlStateSelectors.getAllCommittedRanges(getState());
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
      ranges: ReadonlyArray<StartEndRange>
    ): string {
      const { getState, dispatch } = _getStoreWithURL();

      ranges.forEach(({ start, end }) => dispatch(commitRange(start, end)));

      return getQueryStringFromState(getState());
    }

    function setup(ranges: ReadonlyArray<StartEndRange>) {
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

describe('implementation', function () {
  function setup(settings?: StoreUrlSettings, profile?: Profile) {
    const store = _getStoreWithURL(settings, profile);

    function getQueryString() {
      return getQueryStringFromState(store.getState());
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

    it.each(['js' as const, 'cpp' as const])(
      'can serialize the value "%s"',
      (implementationFilter) => {
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
      (implementationFilter) => {
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

describe('url upgrading', function () {
  describe('version 1: legacy URL serialized call tree filters', function () {
    /**
     * Originally transform stacks were called call tree filters. This test asserts that
     * the upgrade process works correctly.
     */
    it('can upgrade callTreeFilters to transforms', function () {
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

  describe('version 2: split apart timeline tab', function () {
    it('switches to the stack chart when given a timeline tab', function () {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/timeline/',
        v: 1,
      });
      expect(urlStateSelectors.getSelectedTab(getState())).toBe('stack-chart');
    });

    it('switches to the marker-table when given a markers tab', function () {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/markers/',
        v: false,
      });
      expect(urlStateSelectors.getSelectedTab(getState())).toBe('marker-table');
    });
  });

  describe('version 3: remove platform only option', function () {
    it('switches to the stack chart when given a timeline tab', function () {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/timeline/',
        search: '?hidePlatformDetails',
        v: 2,
      });
      expect(urlStateSelectors.getImplementationFilter(getState())).toBe('js');
    });
  });

  describe('version 4: Add relevantForJs frames to JS callNodePaths', function () {
    it('can upgrade a simple stack with one relevantForJs frame in the middle', function () {
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

    it('can upgrade a simple stack with one relevantForJs frame in the front', function () {
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

    it('can upgrade a simple stack with relevantForJs and native frames in the middle', function () {
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

    it('can upgrade the callNodePath in the second branch of the call tree', function () {
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

    it('can upgrade the callNodePath in the second branch of the call tree with relevantForJs frame first', function () {
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
      const committedRanges =
        urlStateSelectors.getAllCommittedRanges(getState());
      expect(committedRanges).toEqual([]);
    });

    it('converts when there is only one range', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=1.451_1.453',
        v: 4,
      });

      const committedRanges =
        urlStateSelectors.getAllCommittedRanges(getState());
      expect(committedRanges).toEqual([{ start: 1451, end: 1453 }]);
    });

    it('converts when there are several ranges', () => {
      const { getState } = _getStoreWithURL({
        search: '?range=0.245_18.470~1.451_1.453',
        v: 4,
      });

      const committedRanges =
        urlStateSelectors.getAllCommittedRanges(getState());
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

      const committedRanges =
        urlStateSelectors.getAllCommittedRanges(getState());
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

      const committedRanges =
        urlStateSelectors.getAllCommittedRanges(getState());
      expect(committedRanges).toEqual([{ start: 1451, end: 1453 }]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('version 6: change encoding of fields with TrackIndex lists', function () {
    it('parses version 5 correctly', function () {
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
        5, 0, 1, 2, 3, 4,
      ]);
      expect(urlStateSelectors.getHiddenGlobalTracks(state)).toEqual(
        new Set([3, 4, 5])
      );
      expect(urlStateSelectors.getLocalTrackOrderByPid(state)).toEqual(
        new Map([
          ['1234', [1, 0]],
          ['345', [2, 0, 1]],
        ])
      );
      expect(urlStateSelectors.getLocalTrackOrderByPid(state)).toEqual(
        new Map([
          ['1234', [1, 0]],
          ['345', [2, 0, 1]],
        ])
      );
      expect(urlStateSelectors.getHiddenLocalTracksByPid(state)).toEqual(
        new Map([['678', new Set([0, 2, 3])]])
      );
      expect(urlStateSelectors.getSelectedThreadIndexesOrNull(state)).toEqual(
        new Set([12])
      );
    });

    it('parses version 5 with multiple selected threads (comma-separated)', function () {
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

  describe('version 7: change default timeline type', function () {
    it('removes the explicit cpu-category from the url', function () {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/calltree/',
        search: '?timelineType=cpu-category',
        v: 6,
      });

      expect(urlStateSelectors.getTimelineType(getState())).toBe(
        'cpu-category'
      );

      const newUrl = new URL(
        urlFromState(urlStateSelectors.getUrlState(getState())),
        'https://profiler.firefox.com'
      );
      const query = queryString.parse(newUrl.search.substr(1), {
        arrayFormat: 'bracket',
      });
      expect(query.timelineType).toBeFalsy();
    });

    it('add an explicit category from the url', function () {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/calltree/',
        search: '',
        v: 6,
      });

      expect(urlStateSelectors.getTimelineType(getState())).toBe('category');

      const newUrl = new URL(
        urlFromState(urlStateSelectors.getUrlState(getState())),
        'https://profiler.firefox.com'
      );
      const query = queryString.parse(newUrl.search.substr(1), {
        arrayFormat: 'bracket',
      });
      expect(query.timelineType).toBe('category');
    });

    it('keeps stack category the same', function () {
      const { getState } = _getStoreWithURL({
        pathname: '/public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/calltree/',
        search: '?timelineType=stack',
        v: 6,
      });

      expect(urlStateSelectors.getTimelineType(getState())).toBe('stack');

      const newUrl = new URL(
        urlFromState(urlStateSelectors.getUrlState(getState())),
        'https://profiler.firefox.com'
      );
      const query = queryString.parse(newUrl.search.substr(1), {
        arrayFormat: 'bracket',
      });
      expect(query.timelineType).toBe('stack');
    });
  });

  // More general checks
  it("won't run if the current version is specified", function () {
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

  it('throws a specific error if a more recent version is specified', function () {
    expect(() =>
      _getStoreWithURL({
        v: CURRENT_URL_VERSION + 1,
      })
    ).toThrow(UrlUpgradeError);
  });
});

describe('URL serialization of the transform stack', function () {
  const transformString =
    'f-combined-0w2~mcn-combined-2w4~f-js-3w5-i~mf-6~ff-7~fg-42~cr-combined-8-9~' +
    'drec-combined-10~rec-11~df-12~cfs-13';
  const { getState } = _getStoreWithURL({
    search: '?transforms=' + transformString,
  });

  it('deserializes focus subtree transforms', function () {
    const transformStack =
      selectedThreadSelectors.getTransformStack(getState());

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
        type: 'focus-category',
        category: 42,
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
        type: 'collapse-recursion',
        funcIndex: 11,
      },
      {
        type: 'drop-function',
        funcIndex: 12,
      },
      {
        type: 'collapse-function-subtree',
        funcIndex: 13,
      },
    ]);
  });

  it('re-serializes the focus subtree transforms', function () {
    const queryString = getQueryStringFromState(getState());
    expect(queryString).toContain(`transforms=${transformString}`);
  });
});

describe('URL persistence of transform stacks for a combined thread (multi-thread selection)', function () {
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

  it('persists the transform for thread 0 if thread 0 is selected', function () {
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
    const transformStackForDifferentThread =
      selectedThreadSelectors.getTransformStack(newStore.getState());
    expect(transformStackForDifferentThread).toEqual([]);
  });

  it('persists the transform for thread 1 if thread 1 is selected', function () {
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

  it('persists the transform for thread 2 if thread 2 is selected', function () {
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

  it('persists the transform for the combined thread of 0+1 if threads 0 and 1 are selected', function () {
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

describe('urlFromState', function () {
  it('outputs no default parameters besides the current URL version', function () {
    const pathname =
      '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree';
    const newUrlState = stateFromLocation({
      pathname: pathname,
      search: `?v=${CURRENT_URL_VERSION}`,
      hash: '',
    });
    expect(urlFromState(newUrlState)).toEqual(
      `${pathname}/?v=${CURRENT_URL_VERSION}`
    );
  });
});

describe('compare', function () {
  const url1 = 'http://fake-url.com/hash/1';
  const url2 = 'http://fake-url.com/hash/2';

  it('unserializes profiles URL properly', function () {
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

  it('serializes profiles URL properly', function () {
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
    expect(resultingUrl).toMatch('/calltree/');

    store.dispatch(changeSelectedTab('flame-graph'));
    const newResultingUrl = urlFromState(
      urlStateSelectors.getUrlState(store.getState())
    );
    expect(newResultingUrl).toMatch('/flame-graph/');
  });
});

describe('uploaded-recordings', function () {
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

describe('last requested call tree summary strategy', function () {
  const { getLastSelectedCallTreeSummaryStrategy } = urlStateSelectors;

  it('defaults to timing', function () {
    const { getState } = _getStoreWithURL();
    expect(getLastSelectedCallTreeSummaryStrategy(getState())).toEqual(
      'timing'
    );
  });

  it('can be js allocations', function () {
    const { getState } = _getStoreWithURL({
      search: '?ctSummary=js-allocations',
    });
    expect(getLastSelectedCallTreeSummaryStrategy(getState())).toEqual(
      'js-allocations'
    );
  });

  it('can be native allocations', function () {
    const { getState } = _getStoreWithURL({
      search: '?ctSummary=native-allocations',
    });
    expect(getLastSelectedCallTreeSummaryStrategy(getState())).toEqual(
      'native-allocations'
    );
  });

  it('will use the default "timing" when an unknown value is received', function () {
    const { getState } = _getStoreWithURL({
      search: '?ctSummary=unknown-value',
    });
    expect(getLastSelectedCallTreeSummaryStrategy(getState())).toEqual(
      'timing'
    );
  });
});

describe('stack chart specific queries', function () {
  it('persists the "show user timings" setting to the URL', function () {
    const { getState, dispatch } = _getStoreWithURL({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/stack-chart/',
    });

    const expectedQueryString = 'showUserTimings';
    expect(getQueryStringFromState(getState())).not.toContain(
      expectedQueryString
    );
    dispatch(changeShowUserTimings(true));
    expect(getQueryStringFromState(getState())).toContain(expectedQueryString);

    const storeAfterReload = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getShowUserTimings(storeAfterReload.getState())
    ).toBe(true);
  });

  it('persists the "use same widths" setting to the URL', function () {
    const { getState, dispatch } = _getStoreWithURL({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/stack-chart/',
    });

    const expectedQueryString = 'sameWidths';
    expect(getQueryStringFromState(getState())).not.toContain(
      expectedQueryString
    );
    dispatch(changeStackChartSameWidths(true));
    expect(getQueryStringFromState(getState())).toContain(expectedQueryString);

    const storeAfterReload = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getStackChartSameWidths(storeAfterReload.getState())
    ).toBe(true);
  });
});

describe('symbolServerUrl', function () {
  function setup(search: string) {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getState } = _getStoreWithURL({ search });
    const symbolServerUrl = urlStateSelectors.getSymbolServerUrl(getState());
    const queryString = getQueryStringFromState(getState());

    return {
      symbolServerUrl,
      queryString,
    };
  }

  it('defaults to the Mozilla symbol server', function () {
    const { symbolServerUrl, queryString } = setup('');
    expect(symbolServerUrl).toEqual(SYMBOL_SERVER_URL);
    expect(symbolServerUrl.substr(-1)).not.toEqual('/');
    expect(queryString).not.toContain('symbolServer=');
  });

  it('can be switch to a custom localhost server', function () {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=http://localhost:1234/symbols'
    );
    expect(symbolServerUrl).toEqual('http://localhost:1234/symbols');
    expect(queryString).toContain(
      'symbolServer=http%3A%2F%2Flocalhost%3A1234%2Fsymbols'
    );
  });

  it('removes any trailing slash', function () {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=http://localhost:1234/'
    );
    expect(symbolServerUrl).toEqual('http://localhost:1234');
    expect(queryString).toContain(
      'symbolServer=http%3A%2F%2Flocalhost%3A1234%2F'
    );
  });

  it('will error when switching to an unknown host', function () {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=https://symbolication.services.mozilla.com.example.com/symbols'
    );
    expect(symbolServerUrl).toEqual(SYMBOL_SERVER_URL);
    expect(queryString).toContain(
      'symbolServer=https%3A%2F%2Fsymbolication.services.mozilla.com.example.com%2Fsymbols'
    );
    // @ts-expect-error - Property 'mock' does not exist
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will error when switching to an invalid host', function () {
    const { symbolServerUrl, queryString } = setup('?symbolServer=invalid');
    expect(symbolServerUrl).toEqual(SYMBOL_SERVER_URL);
    expect(queryString).toContain('symbolServer=invalid');
    // @ts-expect-error - Property 'mock' does not exist
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will error when switching to an allowed but non-https host', function () {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=http://symbolication.services.mozilla.com/'
    );
    expect(symbolServerUrl).toEqual(SYMBOL_SERVER_URL);
    expect(queryString).toContain(
      'symbolServer=http%3A%2F%2Fsymbolication.services.mozilla.com%2F'
    );
    // @ts-expect-error - Property 'mock' does not exist
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will allow an allowed https host', function () {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=https://symbolication.services.mozilla.com'
    );
    expect(symbolServerUrl).toEqual(
      'https://symbolication.services.mozilla.com'
    );
    expect(queryString).toContain(
      'symbolServer=https%3A%2F%2Fsymbolication.services.mozilla.com'
    );
    // @ts-expect-error - Property 'mock' does not exist
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will strip the trailing slash on an allowed https host', function () {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=https://symbolication.services.mozilla.com/'
    );
    expect(symbolServerUrl).toEqual(
      'https://symbolication.services.mozilla.com'
    );
    expect(queryString).toContain(
      'symbolServer=https%3A%2F%2Fsymbolication.services.mozilla.com%2F'
    );
    // @ts-expect-error - Property 'mock' does not exist
    expect(console.error.mock.calls).toMatchSnapshot();
  });

  it('will allow a a subdirectory path on an allowed https host', function () {
    const { symbolServerUrl, queryString } = setup(
      '?symbolServer=https://symbolication.services.mozilla.com/subdir/'
    );
    expect(symbolServerUrl).toEqual(
      'https://symbolication.services.mozilla.com/subdir'
    );
    expect(queryString).toContain(
      'symbolServer=https%3A%2F%2Fsymbolication.services.mozilla.com%2Fsubdir%2F'
    );
    // @ts-expect-error - Property 'mock' does not exist
    expect(console.error.mock.calls).toMatchSnapshot();
  });
});

describe('URL persistence of bottom box (source view and assembly view)', function () {
  function setup() {
    const store = _getStoreWithURL();
    return store;
  }

  it('persists the source file shown in the source view to the URL', function () {
    const { dispatch, getState } = setup();
    expect(urlStateSelectors.getSelectedTab(getState())).toBe('calltree');
    expect(urlStateSelectors.getIsBottomBoxOpen(getState())).toBeFalse();
    expect(urlStateSelectors.getSourceViewFile(getState())).toBeNull();

    // Open the source view for 'xpcom/threads/nsThread.cpp'.
    const sourceFile =
      'hg:hg.mozilla.org/mozilla-central:xpcom/threads/nsThread.cpp:5bb3e281dc9ec8a619c781d52882adb1cacf20bb';
    const bottomBoxInfo = {
      libIndex: 0,
      sourceFile,
      nativeSymbols: [],
    };
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo));
    const newStore = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getIsBottomBoxOpen(newStore.getState())
    ).toBeTrue();
    expect(urlStateSelectors.getSourceViewFile(newStore.getState())).toBe(
      sourceFile
    );
    expect(
      urlStateSelectors.getAssemblyViewIsOpen(newStore.getState())
    ).toBeFalse();
    expect(
      urlStateSelectors.getAssemblyViewNativeSymbol(newStore.getState())
    ).toBeNull();
  });

  it('keeps a closed bottom box closed, even if a source file was loaded before', function () {
    const { dispatch, getState } = setup();
    expect(urlStateSelectors.getSelectedTab(getState())).toBe('calltree');
    expect(urlStateSelectors.getIsBottomBoxOpen(getState())).toBeFalse();
    expect(urlStateSelectors.getSourceViewFile(getState())).toBeNull();

    // Open the source view for 'xpcom/threads/nsThread.cpp'.
    const sourceFile =
      'hg:hg.mozilla.org/mozilla-central:xpcom/threads/nsThread.cpp:5bb3e281dc9ec8a619c781d52882adb1cacf20bb';
    const bottomBoxInfo = {
      libIndex: 0,
      sourceFile,
      nativeSymbols: [],
    };
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo));
    dispatch(closeBottomBox());
    const newStore = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getIsBottomBoxOpen(newStore.getState())
    ).toBeFalse();
  });

  it('persists the native symbol shown in the assembly view to the URL', function () {
    const { dispatch, getState } = setup();
    expect(urlStateSelectors.getSelectedTab(getState())).toBe('calltree');
    expect(urlStateSelectors.getIsBottomBoxOpen(getState())).toBeFalse();
    expect(urlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();

    // Open the assembly view for 'MySymbol'.
    const nativeSymbolInfo = {
      libIndex: 0,
      name: 'MySymbol',
      address: 12345,
      functionSize: 14,
      functionSizeIsKnown: false,
    };
    const bottomBoxInfo = {
      libIndex: 0,
      sourceFile: null,
      nativeSymbols: [nativeSymbolInfo],
    };
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo));
    const newStore = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getIsBottomBoxOpen(newStore.getState())
    ).toBeTrue();
    expect(
      urlStateSelectors.getAssemblyViewIsOpen(newStore.getState())
    ).toBeTrue();
    expect(
      urlStateSelectors.getAssemblyViewNativeSymbol(newStore.getState())
    ).toEqual(nativeSymbolInfo);
  });

  it('only opens the assembly view on reload if it was open before', function () {
    const { dispatch, getState } = setup();
    expect(urlStateSelectors.getSelectedTab(getState())).toBe('calltree');
    expect(urlStateSelectors.getIsBottomBoxOpen(getState())).toBeFalse();
    expect(urlStateSelectors.getSourceViewFile(getState())).toBeNull();
    expect(urlStateSelectors.getAssemblyViewIsOpen(getState())).toBeFalse();

    // Open the source view for 'xpcom/threads/nsThread.cpp' and initialize the
    // assembly view for 'MySymbol', but keep the assembly view closed.
    // The decision to keep the assembly view closed happens in
    // updateBottomBoxContentsAndMaybeOpen: If we have a non-null sourceFile,
    // and the assembly view isn't open already, then we keep the assembly view
    // closed even if we have a native symbol.
    const sourceFile =
      'hg:hg.mozilla.org/mozilla-central:xpcom/threads/nsThread.cpp:5bb3e281dc9ec8a619c781d52882adb1cacf20bb';
    const nativeSymbolInfo = {
      libIndex: 0,
      name: 'MySymbol',
      address: 12345,
      functionSize: 14,
      functionSizeIsKnown: false,
    };
    const bottomBoxInfo = {
      libIndex: 0,
      sourceFile: sourceFile,
      nativeSymbols: [nativeSymbolInfo],
    };
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo));
    const newStore = _getStoreFromStateAfterUrlRoundtrip(getState());

    expect(
      urlStateSelectors.getIsBottomBoxOpen(newStore.getState())
    ).toBeTrue();
    expect(urlStateSelectors.getSourceViewFile(newStore.getState())).toBe(
      sourceFile
    );
    // The assembly view should remain closed.
    expect(
      urlStateSelectors.getAssemblyViewIsOpen(newStore.getState())
    ).toBeFalse();
  });
});

describe('tab selector', function () {
  function setup() {
    const store = _getStoreWithURL();
    return store;
  }

  it('can serialize the tabFilter properly', function () {
    const { dispatch, getState } = setup();

    // Change the tab filter.
    let tabID = 123;
    dispatch(changeTabFilter(tabID));

    // Check if the state update happened properly.
    expect(urlStateSelectors.getTabFilter(getState())).toBe(tabID);
    expect(urlStateSelectors.hasTabFilter(getState())).toBe(true);

    // Check if the URL update happened properly.
    let queryString = getQueryStringFromState(getState());
    expect(queryString).toContain(`tabID=${tabID}`);

    // Change it again and check.
    tabID = 321;
    dispatch(changeTabFilter(tabID));
    expect(urlStateSelectors.getTabFilter(getState())).toBe(tabID);
    expect(urlStateSelectors.hasTabFilter(getState())).toBe(true);
    queryString = getQueryStringFromState(getState());
    expect(queryString).toContain(`tabID=${tabID}`);
  });

  it('null value does not appear in the url', function () {
    const { dispatch, getState } = setup();

    // Change the tab filter.
    const tabID = null;
    dispatch(changeTabFilter(tabID));

    // Check if the URL update happened properly.
    expect(urlStateSelectors.getTabFilter(getState())).toBe(tabID);
    expect(urlStateSelectors.hasTabFilter(getState())).toBe(false);

    // Make sure that null tabID is not present in the URL.
    const queryString = getQueryStringFromState(getState());
    expect(queryString).not.toContain('tabID');
  });

  it('can unserialize the tabFilter from URLs', () => {
    const tabID = 123;
    const { getState } = _getStoreWithURL({ search: `?tabID=${tabID}` });

    expect(urlStateSelectors.getTabFilter(getState())).toEqual(tabID);
    expect(urlStateSelectors.hasTabFilter(getState())).toEqual(true);
  });
});
