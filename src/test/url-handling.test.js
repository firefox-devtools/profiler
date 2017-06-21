/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
/**
 * @jest-environment jsdom
 */
import * as urlStateReducers from '../content/reducers/url-state';
import { stateFromLocation } from '../content/url-handling';
import { blankStore } from './fixtures/stores';
import exampleProfile from './fixtures/profiles/example-profile';
import { processProfile } from '../content/process-profile';
import { receiveProfileFromStore } from '../content/actions/receive-profile';
import type { Profile } from '../common/types/profile';

describe('selectedThread', function () {
  function storeWithThread(threadIndex) {
    const store = blankStore();
    const urlState = stateFromLocation({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree/',
      search: `?thread=${threadIndex}`,
      hash: '',
    });
    store.dispatch({ type: '@@urlenhancer/updateURLState', urlState });

    return store;
  }

  it('selects the right thread when receiving a profile from web', function () {
    const profile: Profile = processProfile(exampleProfile);

    const store = storeWithThread(1);
    store.dispatch(receiveProfileFromStore(profile));

    expect(urlStateReducers.getSelectedThreadIndex(store.getState())).toBe(1);
  });

  it('selects a default thread when a wrong thread has been requested', function () {
    const profile: Profile = processProfile(exampleProfile);

    const store = storeWithThread(100);
    store.dispatch(receiveProfileFromStore(profile));

    // "2" is the content process' main tab
    expect(urlStateReducers.getSelectedThreadIndex(store.getState())).toBe(2);
  });
});

describe('threadOrder and hiddenThreads', function () {
  const profile: Profile = processProfile(exampleProfile);

  function storeWithSearch(search: string) {
    const urlState = stateFromLocation({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree/',
      search,
      hash: '',
    });
    const store = blankStore();
    store.dispatch({ type: '@@urlenhancer/updateURLState', urlState });
    store.dispatch(receiveProfileFromStore(profile));
    return store;
  }

  it('decides the threadOrder and hiddenThreads without any set parameters', function () {
    const { getState } = storeWithSearch('');
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([0, 2, 1]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([]);
  });

  it('can reorder the threads ', function () {
    const { getState } = storeWithSearch('?threadOrder=1-2-0');
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([1, 2, 0]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([]);
  });

  it('can hide the threads', function () {
    const { getState } = storeWithSearch('?hiddenThreads=1-2');
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([0, 2, 1]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([1, 2]);
  });

  it('will not accept invalid threads in the thread order', function () {
    const { getState } = storeWithSearch('?threadOrder=0-8-2-a-1');
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([0, 2, 1]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([]);
  });

  it('will not accept invalid hidden threads', function () {
    const { getState } = storeWithSearch('?hiddenThreads=0-8-2-a');
    expect(urlStateReducers.getThreadOrder(getState())).toEqual([0, 2, 1]);
    expect(urlStateReducers.getHiddenThreads(getState())).toEqual([0, 2]);
  });
});
