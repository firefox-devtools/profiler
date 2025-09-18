/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getSourceViewCode, getSourceCodeCache } from '../../selectors/code';
import { storeWithProfile } from '../fixtures/stores';
import { updateUrlState } from '../../actions/app';
import { stateFromLocation } from '../../app-logic/url-handling';

import type {
  State,
  Store,
  SourceCodeStatus,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';

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

  function createStateWithMockCache(
    store: Store,
    mockCache: Map<IndexIntoSourceTable, SourceCodeStatus>
  ): State {
    return {
      ...store.getState(),
      code: {
        ...store.getState().code,
        sourceCodeCache: mockCache,
      },
    };
  }

  function createMockCache(): Map<IndexIntoSourceTable, SourceCodeStatus> {
    const cache = new Map<IndexIntoSourceTable, SourceCodeStatus>();
    cache.set(0, {
      type: 'AVAILABLE',
      code: 'console.log("Source 0");',
    });
    cache.set(1, {
      type: 'AVAILABLE',
      code: 'function source1() { return "hello"; }',
    });
    cache.set(2, {
      type: 'LOADING',
      source: { type: 'URL', url: 'https://example.com/source2.js' },
    });
    cache.set(3, {
      type: 'ERROR',
      errors: [
        {
          type: 'NETWORK_ERROR',
          url: 'https://example.com/source3.js',
          networkErrorMessage: 'Failed to fetch',
        },
      ],
    });
    return cache;
  }

  it('returns undefined when no source code is cached', function () {
    const store = setupStoreWithSourceIndex(0);
    const sourceViewCode = getSourceViewCode(store.getState());
    expect(sourceViewCode).toBeUndefined();
  });

  it('returns undefined when sourceIndex is null', function () {
    const store = setupStoreWithSourceIndex(null);
    const sourceViewCode = getSourceViewCode(store.getState());
    expect(sourceViewCode).toBeUndefined();
  });

  it('returns undefined when sourceIndex is not in cache', function () {
    const store = setupStoreWithSourceIndex(999); // sourceIndex not in cache
    const cache = createMockCache();
    const state = createStateWithMockCache(store, cache);

    const sourceViewCode = getSourceViewCode(state);
    expect(sourceViewCode).toBeUndefined();
  });

  it('retrieves cached source code for AVAILABLE status', function () {
    const store = setupStoreWithSourceIndex(0);
    const cache = createMockCache();
    const state = createStateWithMockCache(store, cache);

    const sourceViewCode = getSourceViewCode(state);
    expect(sourceViewCode).toEqual({
      type: 'AVAILABLE',
      code: 'console.log("Source 0");',
    });
  });

  it('retrieves cached source code for LOADING status with URL', function () {
    const store = setupStoreWithSourceIndex(2);
    const cache = createMockCache();
    const state = createStateWithMockCache(store, cache);

    const sourceViewCode = getSourceViewCode(state);
    expect(sourceViewCode).toEqual({
      type: 'LOADING',
      source: { type: 'URL', url: 'https://example.com/source2.js' },
    });
  });

  it('retrieves cached source code for ERROR status', function () {
    const store = setupStoreWithSourceIndex(3);
    const cache = createMockCache();
    const state = createStateWithMockCache(store, cache);

    const sourceViewCode = getSourceViewCode(state);
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
    const store = setupStoreWithSourceIndex(4);
    const cache = new Map<IndexIntoSourceTable, SourceCodeStatus>();
    cache.set(4, {
      type: 'LOADING',
      source: { type: 'BROWSER_CONNECTION' },
    });
    const state = createStateWithMockCache(store, cache);

    const sourceViewCode = getSourceViewCode(state);
    expect(sourceViewCode).toEqual({
      type: 'LOADING',
      source: { type: 'BROWSER_CONNECTION' },
    });
  });

  describe('getSourceCodeCache selector', function () {
    it('returns the cache Map directly', function () {
      const store = setupStoreWithSourceIndex(null);
      const cache = createMockCache();
      const state = createStateWithMockCache(store, cache);

      const result = getSourceCodeCache(state);
      expect(result).toBe(cache);
      expect(result.get(0)).toEqual({
        type: 'AVAILABLE',
        code: 'console.log("Source 0");',
      });
    });

    it('returns empty Map when no cache is set', function () {
      const store = setupStoreWithSourceIndex(null);
      const state = store.getState();

      const result = getSourceCodeCache(state);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('edge cases', function () {
    it('handles different SourceCodeStatus types correctly', function () {
      const cache = createMockCache();

      // Test each type of status
      expect(cache.get(0)?.type).toBe('AVAILABLE');
      expect(cache.get(2)?.type).toBe('LOADING');
      expect(cache.get(3)?.type).toBe('ERROR');
    });

    it('handles multiple error types', function () {
      const store = setupStoreWithSourceIndex(5);
      const cache = new Map<IndexIntoSourceTable, SourceCodeStatus>();
      cache.set(5, {
        type: 'ERROR',
        errors: [
          {
            type: 'NETWORK_ERROR',
            url: 'https://example.com/source.js',
            networkErrorMessage: 'Network failed',
          },
          { type: 'NO_KNOWN_CORS_URL' },
        ],
      });
      const state = createStateWithMockCache(store, cache);

      const sourceViewCode = getSourceViewCode(state);
      expect(sourceViewCode).toEqual({
        type: 'ERROR',
        errors: [
          {
            type: 'NETWORK_ERROR',
            url: 'https://example.com/source.js',
            networkErrorMessage: 'Network failed',
          },
          { type: 'NO_KNOWN_CORS_URL' },
        ],
      });
    });
  });
});
