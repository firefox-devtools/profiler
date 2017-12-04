/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
/**
 * @jest-environment jsdom
 */
import * as urlStateReducers from '../reducers/url-state';
import {
  stateFromLocation,
  urlStateToUrlObject,
  urlFromState,
  CURRENT_URL_VERSION,
} from '../url-handling';
import { blankStore } from './fixtures/stores';
import getGeckoProfile from './fixtures/profiles/gecko-profile';
import { processProfile } from '../profile-logic/process-profile';
import { receiveProfileFromStore } from '../actions/receive-profile';
import { selectedThreadSelectors } from '../reducers/profile-view';
import type { Profile } from '../types/profile';
import getProfile from './fixtures/profiles/call-nodes';

function _getStoreWithURL(
  settings: {
    pathname?: string,
    search?: string,
    hash?: string,
    v?: number | false, // If v is false, do not add a v parameter to the search string.
  },
  profile: Profile = getProfile()
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

  const searchWithVersion =
    v === false ? search : `${search ? search + '&' : '?'}v=${v}`;
  const urlState = stateFromLocation({
    pathname,
    search: searchWithVersion,
    hash,
  });
  const store = blankStore();
  store.dispatch({ type: '@@urlenhancer/updateUrlState', urlState });
  store.dispatch(receiveProfileFromStore(profile));
  return store;
}

describe('selectedThread', function() {
  function storeWithThread(threadIndex) {
    const store = blankStore();
    const urlState = stateFromLocation({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree/',
      search: `?thread=${threadIndex}`,
      hash: '',
    });
    store.dispatch({ type: '@@urlenhancer/updateUrlState', urlState });

    return store;
  }

  it('selects the right thread when receiving a profile from web', function() {
    const profile: Profile = processProfile(getGeckoProfile());

    const store = storeWithThread(1);
    store.dispatch(receiveProfileFromStore(profile));

    expect(urlStateReducers.getSelectedThreadIndex(store.getState())).toBe(1);
  });

  it('selects a default thread when a wrong thread has been requested', function() {
    const profile: Profile = processProfile(getGeckoProfile());

    const store = storeWithThread(100);
    store.dispatch(receiveProfileFromStore(profile));

    // "2" is the content process' main tab
    expect(urlStateReducers.getSelectedThreadIndex(store.getState())).toBe(2);
  });
});

describe('threadOrder and hiddenThreads', function() {
  const profileWithThreads: Profile = processProfile(getGeckoProfile());

  it('decides the threadOrder and hiddenThreads without any set parameters', function() {
    const { getState } = _getStoreWithURL({ search: '' }, profileWithThreads);
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([0, 2, 1]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([]);
  });

  it('can reorder the threads ', function() {
    const { getState } = _getStoreWithURL(
      { search: '?threadOrder=1-2-0' },
      profileWithThreads
    );
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([1, 2, 0]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([]);
  });

  it('can hide the threads', function() {
    const { getState } = _getStoreWithURL(
      { search: '?hiddenThreads=1-2' },
      profileWithThreads
    );
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([0, 2, 1]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([1, 2]);
  });

  it('will not accept invalid threads in the thread order', function() {
    const { getState } = _getStoreWithURL(
      { search: '?threadOrder=0-8-2-a-1' },
      profileWithThreads
    );
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([0, 2, 1]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([]);
  });

  it('will not accept invalid hidden threads', function() {
    const { getState } = _getStoreWithURL(
      { search: '?hiddenThreads=0-8-2-a' },
      profileWithThreads
    );
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([0, 2, 1]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([0, 2]);
  });
});

describe('search strings', function() {
  it('properly handles the search string stacks with 1 item', function() {
    const { getState } = _getStoreWithURL({ search: '?search=string' });
    expect(urlStateReducers.getCurrentSearchString(getState())).toBe('string');
    expect(urlStateReducers.getSearchStrings(getState())).toEqual(['string']);
  });

  it('properly handles the search string stacks with several items', function() {
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
});

describe('url upgrading', function() {
  /**
   * Originally transform stacks were called call tree filters. This test asserts that
   * the upgrade process works correctly.
   */
  describe('version 1: legacy URL serialized call tree filters', function() {
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

  // More general checks
  it("won't run if the version is specified", function() {
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
});

describe('URL serialization of the transform stack', function() {
  const transformString =
    'f-combined-012~ms-js-123~mcn-combined-234~f-js-345-i~mf-6~ff-7~cr-combined-8-9~rec-combined-10';
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
        type: 'merge-subtree',
        callNodePath: [1, 2, 3],
        implementation: 'js',
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
    ]);
  });

  it('re-serializes the focus subtree transforms', function() {
    const { query } = urlStateToUrlObject(
      urlStateReducers.getUrlState(getState())
    );
    expect(query.transforms).toBe(transformString);
  });
});

describe('urlFromState', function() {
  it('outputs the current URL version', function() {
    const urlState = stateFromLocation({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree/',
      search: '',
      hash: '',
    });
    expect(urlFromState(urlState)).toMatch(`v=${CURRENT_URL_VERSION}`);
  });
});
