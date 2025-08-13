/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getEmptyResourceTable } from '../../profile-logic/data-structures';
import { stateFromLocation, urlFromState } from '../../app-logic/url-handling';
import * as UrlStateSelectors from '../../selectors/url-state';
import { blankStore } from '../fixtures/stores';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { viewProfile } from '../../actions/receive-profile';
import { updateBottomBoxContentsAndMaybeOpen } from '../../actions/profile-view';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

describe('sourceId functionality', function () {
  describe('resourceTable with sourceId', function () {
    it('should create resourceTable with sourceId correctly', function () {
      const resourceTable = getEmptyResourceTable();

      // Add a resource with sourceId
      resourceTable.lib.push(0);
      resourceTable.name.push(1);
      resourceTable.host.push(2);
      resourceTable.type.push(3);
      resourceTable.sourceId.push(42);
      resourceTable.length++;

      expect(resourceTable.sourceId).toEqual([42]);
      expect(resourceTable.length).toBe(1);
    });

    it('should handle resourceTable with null sourceId', function () {
      const resourceTable = getEmptyResourceTable();

      // Add a resource with null sourceId
      resourceTable.lib.push(0);
      resourceTable.name.push(1);
      resourceTable.host.push(2);
      resourceTable.type.push(3);
      resourceTable.sourceId.push(null);
      resourceTable.length++;

      expect(resourceTable.sourceId).toEqual([null]);
      expect(resourceTable.length).toBe(1);
    });

    it('should handle multiple resources with mixed sourceId values', function () {
      const resourceTable = getEmptyResourceTable();

      // Add multiple resources with different sourceId values
      resourceTable.lib.push(0, 1, 2);
      resourceTable.name.push(1, 2, 3);
      resourceTable.host.push(2, 3, 4);
      resourceTable.type.push(3, 4, 5);
      resourceTable.sourceId.push(42, null, 123);
      resourceTable.length = 3;

      expect(resourceTable.sourceId).toEqual([42, null, 123]);
      expect(resourceTable.length).toBe(3);
    });
  });

  describe('URL state with sourceId', function () {
    it('should handle sourceId in URL state when sourceView is present', function () {
      const urlState = stateFromLocation({
        pathname: '/public/hash/calltree/',
        search: `?sourceView=test.js&sourceId=111-42`,
        hash: '',
      });

      expect(
        urlState.profileSpecific.sourceView.globalJSSourceId
      ).toStrictEqual({
        pid: '111',
        sourceId: 42,
      });
      expect(urlState.profileSpecific.sourceView.sourceFile).toBe('test.js');
    });

    it('should handle null sourceId in URL state when sourceView is present', function () {
      const urlState = stateFromLocation({
        pathname: '/public/hash/calltree/',
        search: `?sourceView=test.js`,
        hash: '',
      });

      expect(urlState.profileSpecific.sourceView.globalJSSourceId).toBe(null);
      expect(urlState.profileSpecific.sourceView.sourceFile).toBe('test.js');
    });

    it('should serialize sourceId to URL correctly', function () {
      const { dispatch, getState } = blankStore();
      const { profile } = getProfileFromTextSamples('A');
      dispatch(viewProfile(profile));
      const newUrlState = stateFromLocation({
        pathname: '/from-browser/',
        search: '',
        hash: '',
      });
      dispatch(updateUrlState(newUrlState));

      dispatch(
        updateBottomBoxContentsAndMaybeOpen('calltree', {
          libIndex: 0,
          globalJSSourceId: { pid: '123', sourceId: 42 },
          sourceFile: 'test.js',
          nativeSymbols: [],
        })
      );

      const url = urlFromState(UrlStateSelectors.getUrlState(getState()));
      expect(url).toContain('sourceId=123-42');
      expect(url).toContain('sourceView=test.js');
    });

    it('should not serialize null sourceId to URL', function () {
      const { dispatch, getState } = blankStore();
      const { profile } = getProfileFromTextSamples('A');
      dispatch(viewProfile(profile));
      const newUrlState = stateFromLocation({
        pathname: '/from-browser/',
        search: '',
        hash: '',
      });
      dispatch(updateUrlState(newUrlState));

      dispatch(
        updateBottomBoxContentsAndMaybeOpen('calltree', {
          libIndex: 0,
          globalJSSourceId: null,
          sourceFile: 'test.js',
          nativeSymbols: [],
        })
      );

      const url = urlFromState(UrlStateSelectors.getUrlState(getState()));
      expect(url).not.toContain('sourceId');
      expect(url).toContain('sourceView=test.js');
    });
  });
});
