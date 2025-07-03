/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getSourceViewCode } from '../../selectors/code';
import { storeWithProfile } from '../fixtures/stores';
import { updateBottomBoxContentsAndMaybeOpen } from '../../actions/profile-view';

import type { State, SourceCodeStatus } from 'firefox-profiler/types';

describe('source code cache with sourceId', function () {
  describe('source view code selector', function () {
    it('should handle source code with sourceId correctly', function () {
      const store = storeWithProfile();

      // Test that the selector works with sourceId
      store.dispatch(
        updateBottomBoxContentsAndMaybeOpen('calltree', {
          libIndex: 0,
          sourceId: 42,
          sourceFile: 'test-file.js',
          nativeSymbols: [],
        })
      );

      const sourceViewCode = getSourceViewCode(store.getState());

      // The selector should return undefined since there's no cached source code
      expect(sourceViewCode).toBe(undefined);
    });

    it('should handle source code without sourceId', function () {
      const store = storeWithProfile();

      // Test that the selector works without sourceId
      store.dispatch(
        updateBottomBoxContentsAndMaybeOpen('calltree', {
          libIndex: 0,
          sourceId: null,
          sourceFile: 'test-file.js',
          nativeSymbols: [],
        })
      );

      const sourceViewCode = getSourceViewCode(store.getState());

      // The selector should return undefined since there's no cached source code
      expect(sourceViewCode).toBe(undefined);
    });

    it('should create different cache lookups for different sourceIds', function () {
      const store = storeWithProfile();

      // Mock the source code cache to have entries
      const mockCache = new Map();
      mockCache.set('test-file.js', {
        type: 'AVAILABLE',
        code: 'source without sourceId',
      });
      mockCache.set('test-file.js-42', {
        type: 'AVAILABLE',
        code: 'source with sourceId 42',
      });
      mockCache.set('test-file.js-123', {
        type: 'AVAILABLE',
        code: 'source with sourceId 123',
      });

      // First, let's open the bottom box with sourceId
      store.dispatch(
        updateBottomBoxContentsAndMaybeOpen('calltree', {
          libIndex: 0,
          sourceId: 42,
          sourceFile: 'test-file.js',
          nativeSymbols: [],
        })
      );

      // Manually set the cache in the state for testing
      const state = {
        ...store.getState(),
        code: {
          ...store.getState().code,
          sourceCodeCache: mockCache,
        },
      };

      const sourceViewCode = getSourceViewCode(state);

      expect(sourceViewCode).toEqual({
        type: 'AVAILABLE',
        code: 'source with sourceId 42',
      });
    });

    it('should fallback to cache without sourceId when sourceId is null', function () {
      const store = storeWithProfile();

      // Mock the source code cache to have entries
      const mockCache: Map<string, SourceCodeStatus> = new Map();
      mockCache.set('test-file.js', {
        type: 'AVAILABLE',
        code: 'source without sourceId',
      });
      mockCache.set('test-file.js-42', {
        type: 'AVAILABLE',
        code: 'source with sourceId 42',
      });

      // First, let's open the bottom box with null sourceId
      store.dispatch(
        updateBottomBoxContentsAndMaybeOpen('calltree', {
          libIndex: 0,
          sourceId: null,
          sourceFile: 'test-file.js',
          nativeSymbols: [],
        })
      );

      // Manually set the cache in the state for testing
      const state: State = {
        ...store.getState(),
        code: {
          ...store.getState().code,
          sourceCodeCache: mockCache,
        },
      };

      const sourceViewCode = getSourceViewCode(state);

      expect(sourceViewCode).toEqual({
        type: 'AVAILABLE',
        code: 'source without sourceId',
      });
    });
  });
});
