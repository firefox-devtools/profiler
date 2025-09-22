/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getSourceViewCode, getSourceCodeCache } from '../../selectors/code';
import { storeWithProfile } from '../fixtures/stores';
import { updateUrlState } from '../../actions/app';
import { stateFromLocation } from '../../app-logic/url-handling';
import {
  beginLoadingSourceCodeFromUrl,
  beginLoadingSourceCodeFromBrowserConnection,
  finishLoadingSourceCode,
  failLoadingSourceCode,
} from '../../actions/code';

import type { IndexIntoSourceTable } from 'firefox-profiler/types';

describe('source code cache with IndexIntoSourceTable', function () {
  function setupStoreWithSourceIndex(sourceIndex: IndexIntoSourceTable | null) {
    const store = storeWithProfile();
    if (sourceIndex !== null) {
      const urlState = stateFromLocation({
        pathname: '/public/fakehash/',
        search: `?sourceViewIndex=${sourceIndex}`,
        hash: '',
      });
      store.dispatch(updateUrlState(urlState));
    }
    return store;
  }

  it('returns undefined when no source code is cached', function () {
    const { getState } = setupStoreWithSourceIndex(0);
    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toBeUndefined();
  });

  it('returns undefined when sourceIndex is null', function () {
    const { getState } = setupStoreWithSourceIndex(null);
    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toBeUndefined();
  });

  it('returns undefined when sourceIndex is not in cache', function () {
    const { getState, dispatch } = setupStoreWithSourceIndex(999);
    // Add some other source to cache but not index 999
    dispatch(finishLoadingSourceCode(0, 'some code'));

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toBeUndefined();
  });

  it('retrieves cached source code for AVAILABLE status', function () {
    const { getState, dispatch } = setupStoreWithSourceIndex(0);
    dispatch(finishLoadingSourceCode(0, 'console.log("Source 0");'));

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toEqual({
      type: 'AVAILABLE',
      code: 'console.log("Source 0");',
    });
  });

  it('retrieves cached source code for LOADING status with URL', function () {
    const { getState, dispatch } = setupStoreWithSourceIndex(2);
    dispatch(
      beginLoadingSourceCodeFromUrl(2, 'https://example.com/source2.js')
    );

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toEqual({
      type: 'LOADING',
      source: { type: 'URL', url: 'https://example.com/source2.js' },
    });
  });

  it('retrieves cached source code for ERROR status', function () {
    const { getState, dispatch } = setupStoreWithSourceIndex(3);
    dispatch(
      failLoadingSourceCode(3, [
        {
          type: 'NETWORK_ERROR',
          url: 'https://example.com/source3.js',
          networkErrorMessage: 'Failed to fetch',
        },
      ])
    );

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'NETWORK_ERROR',
          url: 'https://example.com/source3.js',
          networkErrorMessage: 'Failed to fetch',
        },
      ],
    });
  });

  it('retrieves cached source code for LOADING status with BROWSER_CONNECTION', function () {
    const { getState, dispatch } = setupStoreWithSourceIndex(4);
    dispatch(beginLoadingSourceCodeFromBrowserConnection(4));

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toEqual({
      type: 'LOADING',
      source: { type: 'BROWSER_CONNECTION' },
    });
  });

  describe('getSourceCodeCache selector', function () {
    it('returns the cache Map with cached entries', function () {
      const { getState, dispatch } = setupStoreWithSourceIndex(null);
      dispatch(finishLoadingSourceCode(0, 'console.log("Source 0");'));

      const result = getSourceCodeCache(getState());
      expect(result).toBeInstanceOf(Map);
      expect(result.get(0)).toEqual({
        type: 'AVAILABLE',
        code: 'console.log("Source 0");',
      });
    });

    it('returns empty Map when no cache is set', function () {
      const { getState } = setupStoreWithSourceIndex(null);

      const result = getSourceCodeCache(getState());
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('state transitions', function () {
    it('can transition from LOADING to AVAILABLE', function () {
      const { getState, dispatch } = setupStoreWithSourceIndex(0);
      dispatch(beginLoadingSourceCodeFromUrl(0, 'https://example.com/test.js'));

      let sourceViewCode = getSourceViewCode(getState());
      expect(sourceViewCode?.type).toBe('LOADING');

      dispatch(finishLoadingSourceCode(0, 'const result = 42;'));

      sourceViewCode = getSourceViewCode(getState());
      expect(sourceViewCode).toEqual({
        type: 'AVAILABLE',
        code: 'const result = 42;',
      });
    });

    it('can transition from LOADING to ERROR', function () {
      const { getState, dispatch } = setupStoreWithSourceIndex(1);
      dispatch(beginLoadingSourceCodeFromUrl(1, 'https://example.com/test.js'));

      let sourceViewCode = getSourceViewCode(getState());
      expect(sourceViewCode?.type).toBe('LOADING');

      dispatch(failLoadingSourceCode(1, [{ type: 'NO_KNOWN_CORS_URL' }]));

      sourceViewCode = getSourceViewCode(getState());
      expect(sourceViewCode).toEqual({
        type: 'ERROR',
        errors: [{ type: 'NO_KNOWN_CORS_URL' }],
      });
    });
  });
});
