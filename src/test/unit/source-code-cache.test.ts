/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getSourceViewCode,
  getSourceCodeCache,
  getSourceCodeCacheGeneration,
} from '../../selectors/code';
import { blankStore, storeWithProfile } from '../fixtures/stores';
import { updateUrlState } from '../../actions/app';
import { stateFromLocation } from '../../app-logic/url-handling';
import {
  beginLoadingSourceCodeFromUrl,
  beginLoadingSourceCodeFromBrowserConnection,
  finishLoadingSourceCode,
  failLoadingSourceCode,
  fetchSourceCode,
} from '../../actions/code';
import { viewProfile } from '../../actions/receive-profile';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { waitUntilState } from '../fixtures/utils';

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
    return {
      ...store,
      generation: getSourceCodeCacheGeneration(store.getState()),
    };
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
    const { getState, dispatch, generation } = setupStoreWithSourceIndex(999);
    // Add some other source to cache but not index 999
    dispatch(finishLoadingSourceCode(0, 'some code', 'LOCAL', generation));

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toBeUndefined();
  });

  it('retrieves cached source code for AVAILABLE status', function () {
    const { getState, dispatch, generation } = setupStoreWithSourceIndex(0);
    dispatch(
      finishLoadingSourceCode(
        0,
        'console.log("Source 0");',
        'LOCAL',
        generation
      )
    );

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toEqual({
      type: 'AVAILABLE',
      code: 'console.log("Source 0");',
      origin: 'LOCAL',
    });
  });

  it('retrieves cached source code for LOADING status with URL', function () {
    const { getState, dispatch, generation } = setupStoreWithSourceIndex(2);
    dispatch(
      beginLoadingSourceCodeFromUrl(
        2,
        'https://example.com/source2.js',
        generation
      )
    );

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toEqual({
      type: 'LOADING',
      source: { type: 'URL', url: 'https://example.com/source2.js' },
    });
  });

  it('retrieves cached source code for ERROR status', function () {
    const { getState, dispatch, generation } = setupStoreWithSourceIndex(3);
    dispatch(
      failLoadingSourceCode(
        3,
        [
          {
            type: 'NETWORK_ERROR',
            url: 'https://example.com/source3.js',
            networkErrorMessage: 'Failed to fetch',
          },
        ],
        generation
      )
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
    const { getState, dispatch, generation } = setupStoreWithSourceIndex(4);
    dispatch(beginLoadingSourceCodeFromBrowserConnection(4, generation));

    const sourceViewCode = getSourceViewCode(getState());
    expect(sourceViewCode).toEqual({
      type: 'LOADING',
      source: { type: 'BROWSER_CONNECTION' },
    });
  });

  describe('getSourceCodeCache selector', function () {
    it('returns the cache Map with cached entries', function () {
      const { getState, dispatch, generation } =
        setupStoreWithSourceIndex(null);
      dispatch(
        finishLoadingSourceCode(
          0,
          'console.log("Source 0");',
          'LOCAL',
          generation
        )
      );

      const result = getSourceCodeCache(getState());
      expect(result).toBeInstanceOf(Map);
      expect(result.get(0)).toEqual({
        type: 'AVAILABLE',
        code: 'console.log("Source 0");',
        origin: 'LOCAL',
      });
    });

    it('returns empty Map when no cache is set', function () {
      const { getState } = setupStoreWithSourceIndex(null);

      const result = getSourceCodeCache(getState());
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('forgets the cache when another profile is loaded', async function () {
      const { getState, dispatch, generation } =
        setupStoreWithSourceIndex(null);
      dispatch(
        finishLoadingSourceCode(
          0,
          'console.log("Source 0");',
          'LOCAL',
          generation
        )
      );
      expect(getSourceCodeCache(getState()).size).toBe(1);

      // The indexes of the old cache would point at unrelated files in the new
      // profile, so the whole cache has to go.
      const { profile } = getProfileFromTextSamples('A[file:other.js]');
      await dispatch(viewProfile(profile));
      expect(getSourceCodeCache(getState()).size).toBe(0);
    });

    it('ignores loading actions from before another profile was loaded', async function () {
      const { getState, dispatch, generation } =
        setupStoreWithSourceIndex(null);
      const { profile } = getProfileFromTextSamples('A[file:other.js]');
      await dispatch(viewProfile(profile));

      dispatch(
        beginLoadingSourceCodeFromUrl(
          0,
          'https://example.com/test.js',
          generation
        )
      );
      dispatch(beginLoadingSourceCodeFromBrowserConnection(1, generation));
      dispatch(finishLoadingSourceCode(2, 'stale code', 'LOCAL', generation));
      dispatch(
        failLoadingSourceCode(3, [{ type: 'NO_KNOWN_CORS_URL' }], generation)
      );
      expect(getSourceCodeCache(getState()).size).toBe(0);
    });
  });

  describe('state transitions', function () {
    it('can transition from LOADING to AVAILABLE', function () {
      const { getState, dispatch, generation } = setupStoreWithSourceIndex(0);
      dispatch(
        beginLoadingSourceCodeFromUrl(
          0,
          'https://example.com/test.js',
          generation
        )
      );

      let sourceViewCode = getSourceViewCode(getState());
      expect(sourceViewCode?.type).toBe('LOADING');

      dispatch(
        finishLoadingSourceCode(0, 'const result = 42;', 'LOCAL', generation)
      );

      sourceViewCode = getSourceViewCode(getState());
      expect(sourceViewCode).toEqual({
        type: 'AVAILABLE',
        code: 'const result = 42;',
        origin: 'LOCAL',
      });
    });

    it('can transition from LOADING to ERROR', function () {
      const { getState, dispatch, generation } = setupStoreWithSourceIndex(1);
      dispatch(
        beginLoadingSourceCodeFromUrl(
          1,
          'https://example.com/test.js',
          generation
        )
      );

      let sourceViewCode = getSourceViewCode(getState());
      expect(sourceViewCode?.type).toBe('LOADING');

      dispatch(
        failLoadingSourceCode(1, [{ type: 'NO_KNOWN_CORS_URL' }], generation)
      );

      sourceViewCode = getSourceViewCode(getState());
      expect(sourceViewCode).toEqual({
        type: 'ERROR',
        errors: [{ type: 'NO_KNOWN_CORS_URL' }],
      });
    });
  });

  describe('fetchSourceCode', function () {
    const FILE =
      'git:github.com/rust-lang/rust:library/core/src/intrinsics.rs:acbe4443cc4c9695c0b74a7b64b60333c990a400';
    const FILE_URL =
      'https://raw.githubusercontent.com/rust-lang/rust/acbe4443cc4c9695c0b74a7b64b60333c990a400/library/core/src/intrinsics.rs';

    function deferredResponse() {
      let resolve: (response: number | string) => void = () => {};
      const promise = new Promise<number | string>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    }

    it('ignores a fetch that finishes after another profile is loaded', async function () {
      const response = deferredResponse();
      window.fetchMock.get(FILE_URL, () => response.promise);
      const { profile } = getProfileFromTextSamples(`A[file:${FILE}]`);
      const { getState, dispatch } = storeWithProfile(profile);

      const fetchPromise = dispatch(fetchSourceCode(0, new Map()));
      expect(getSourceCodeCache(getState()).get(0)?.type).toBe('LOADING');

      const { profile: otherProfile } =
        getProfileFromTextSamples('B[file:other.js]');
      await dispatch(viewProfile(otherProfile));
      response.resolve('contents of intrinsics.rs');
      await fetchPromise;

      // Index 0 is other.js now, which must not get the contents of
      // intrinsics.rs.
      expect(getSourceCodeCache(getState()).size).toBe(0);
    });

    it('leaves no LOADING entry behind when a stale fetch tries another server', async function () {
      const symbolServerResponse = deferredResponse();
      window.fetchMock
        .post(
          'http://127.0.0.1:8000/source/v1',
          () => symbolServerResponse.promise
        )
        .get(FILE_URL, 'contents of intrinsics.rs');
      const { profile } = getProfileFromTextSamples(
        `A[lib:libA.so][address:30][file:${FILE}]`
      );
      const store = blankStore();
      const { getState, dispatch } = store;
      dispatch(
        updateUrlState(
          stateFromLocation({
            pathname: '/from-browser',
            search: '?symbolServer=http://127.0.0.1:8000',
            hash: '',
          })
        )
      );
      await dispatch(viewProfile(profile));

      const fetchPromise = dispatch(fetchSourceCode(0, new Map()));
      await waitUntilState(store, (state) => getSourceCodeCache(state).has(0));
      expect(getSourceCodeCache(getState()).get(0)).toEqual({
        type: 'LOADING',
        source: { type: 'URL', url: 'http://127.0.0.1:8000/source/v1' },
      });

      const { profile: otherProfile } =
        getProfileFromTextSamples('B[file:other.js]');
      await dispatch(viewProfile(otherProfile));
      // The symbol server fails, so the fetch moves on to the web.
      symbolServerResponse.resolve(500);
      await fetchPromise;

      expect(window.fetchMock.callHistory.called(FILE_URL)).toBe(true);
      expect(getSourceCodeCache(getState()).size).toBe(0);
    });
  });
});
