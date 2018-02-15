/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { storeWithSimpleProfile } from '../fixtures/stores';
import { getZippedProfiles } from '../fixtures/profiles/zip-file';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import * as UrlStateSelectors from '../../reducers/url-state';
import * as AppSelectors from '../../reducers/app';
import createStore from '../../create-store';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';

import * as AppActions from '../../actions/app';
import * as ReceiveProfileActions from '../../actions/receive-profile';
import type { ZipFileTable } from '../../profile-logic/zip-files';

describe('app actions', function() {
  describe('changeSelectedTab', function() {
    it('can change tabs', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(UrlStateSelectors.getSelectedTab(getState())).toEqual('calltree');
      dispatch(AppActions.changeSelectedTab('stack-chart'));
      expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
        'stack-chart'
      );
    });

    it('records an analytics event when changing tabs', function() {
      withAnalyticsMock(() => {
        const { dispatch } = storeWithSimpleProfile();
        dispatch(AppActions.changeSelectedTab('stack-chart'));
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              hitType: 'pageview',
              page: 'stack-chart',
            },
          ],
        ]);
      });
    });
  });

  describe('profilePublished', function() {
    const hash = 'de0ecf545819a95caa4c4d55b7a9cedb';
    it('changes the data source to public', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(UrlStateSelectors.getDataSource(getState())).toBe('none');
      dispatch(AppActions.profilePublished(hash));
      expect(UrlStateSelectors.getDataSource(getState())).toBe('public');
    });

    it('changes the hash', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(UrlStateSelectors.getHash(getState())).toBe('');
      dispatch(AppActions.profilePublished(hash));
      expect(UrlStateSelectors.getHash(getState())).toBe(hash);
    });
  });

  describe('changeTabOrder', function() {
    it('can change the saved tab order', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(ProfileViewSelectors.getTabOrder(getState())).toEqual([
        0,
        1,
        2,
        3,
      ]);
      dispatch(AppActions.changeTabOrder([2, 3, 1, 0]));
      expect(ProfileViewSelectors.getTabOrder(getState())).toEqual([
        2,
        3,
        1,
        0,
      ]);
    });
  });

  describe('urlSetupDone', function() {
    it('will remember when url setup is done', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(AppSelectors.getShouldPushHistoryState(getState())).toEqual(false);
      dispatch(AppActions.urlSetupDone());
      expect(AppSelectors.getShouldPushHistoryState(getState())).toEqual(true);
    });

    it('records analytics events for pageview and datasource', function() {
      withAnalyticsMock(() => {
        const { dispatch } = storeWithSimpleProfile();
        dispatch(AppActions.urlSetupDone());
        expect(self.ga.mock.calls).toEqual([
          [
            'send',
            {
              hitType: 'pageview',
              page: 'home',
            },
          ],
          [
            'send',
            {
              eventAction: 'none',
              eventCategory: 'datasource',
              hitType: 'event',
            },
          ],
        ]);
      });
    });
  });

  describe('show404', function() {
    it('tracks when the route is not found', function() {
      const { dispatch, getState } = createStore();
      expect(AppSelectors.getView(getState())).toEqual({
        phase: 'INITIALIZING',
      });
      dispatch(AppActions.show404('http://foobar.com'));
      expect(AppSelectors.getView(getState())).toEqual({
        phase: 'ROUTE_NOT_FOUND',
      });
    });
  });

  describe('updateUrlState', function() {
    it('can swap out to a different URL state', function() {
      const { dispatch, getState } = storeWithSimpleProfile();

      // The URL state starts out on the calltree tab.
      const originalUrlState = UrlStateSelectors.getUrlState(getState());
      expect(UrlStateSelectors.getSelectedTab(getState())).toEqual('calltree');

      // Change it, and make sure the URL state updates.
      dispatch(AppActions.changeSelectedTab('stack-chart'));
      expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
        'stack-chart'
      );
      expect(UrlStateSelectors.getUrlState(getState())).not.toBe(
        originalUrlState
      );

      // Now revert it to the original, and make sure everything resets.
      dispatch(AppActions.updateUrlState(originalUrlState));
      expect(UrlStateSelectors.getUrlState(getState())).toBe(originalUrlState);
      expect(UrlStateSelectors.getSelectedTab(getState())).toEqual('calltree');
    });
  });

  describe('zipFile', function() {
    /**
     * Transform the zip file data structure into a human readable string to easily
     * assert the tree structure of the table.
     */
    function formatZipFileTable(zipFileTable: ZipFileTable | null): string[] {
      if (!zipFileTable) {
        return [];
      }
      // Remember a computed depth, given an index.
      const indexToDepth = new Map();
      // If no prefix, start at -1, so that the next depth gets computed to 0.
      indexToDepth.set(null, -1);
      const result = [];
      for (let i = 0; i < zipFileTable.length; i++) {
        // Pull out the values
        const prefix = zipFileTable.prefix[i];
        const partName = zipFileTable.partName[i];
        const type = zipFileTable.file[i] ? 'file' : 'dir';

        // Compute the depth and whitespace
        const prefixDepth = indexToDepth.get(prefix);
        const depth = prefixDepth + 1;
        const whitespace = Array(depth * 2 + 1).join(' ');

        // Remember the depth.
        indexToDepth.set(i, depth);
        result.push(`${whitespace}${partName} (${type})`);
      }
      return result;
    }

    async function storeWithZipFile() {
      const { dispatch, getState } = createStore();
      const zippedProfile = await getZippedProfiles();
      dispatch(ReceiveProfileActions.receiveZipFile(zippedProfile));
      return {
        dispatch,
        getState,
        zippedProfile,
      };
    }

    it('can store the zip file in the reducer', async function() {
      const { getState, zippedProfile } = await storeWithZipFile();
      AppSelectors.getZipFileState(getState());
      expect(zippedProfile).toBe(zippedProfile);
    });

    it('can compute a ZipFileTable', async function() {
      const { getState } = await storeWithZipFile();
      const zipFileTable = AppSelectors.getZipFileTable(getState());
      expect(formatZipFileTable(zipFileTable)).toEqual([
        'foo (dir)',
        '  bar (dir)',
        '    profile1.json (file)',
        '  profile2.json (file)',
        '  profile3.json (file)',
        '  profile4.json (file)',
        'baz (dir)',
        '  profile5.json (file)',
      ]);
    });

    it('computes the zip file max depth', async function() {
      const { getState } = await storeWithZipFile();
      expect(AppSelectors.getZipFileMaxDepth(getState())).toEqual(2);
    });

    describe('ZipFileTree', function() {
      async function initStoreAndZipFileTree() {
        const { getState } = await storeWithZipFile();

        const zipFileTree = AppSelectors.getZipFileTree(getState());
        const zipFileTable = AppSelectors.getZipFileTable(getState());
        if (!zipFileTree || !zipFileTable) {
          throw new Error(
            'Both the zip file tree and zip file table should exist.'
          );
        }
        const indexesToPartName = indexes =>
          indexes.map(index => {
            return zipFileTable.partName[index];
          });
        return {
          getState,
          zipFileTree,
          zipFileTable,
          indexesToPartName,
        };
      }

      it('can compute a ZipFileTree', async function() {
        const { getState } = await storeWithZipFile();
        const zipFileTree = AppSelectors.getZipFileTree(getState());
        expect(zipFileTree).toBeTruthy();
      });

      it('can get the tree roots', async function() {
        const {
          zipFileTree,
          indexesToPartName,
        } = await initStoreAndZipFileTree();
        expect(indexesToPartName(zipFileTree.getRoots())).toEqual([
          'foo',
          'baz',
        ]);
      });

      it('can get children', async function() {
        const {
          zipFileTree,
          indexesToPartName,
        } = await initStoreAndZipFileTree();
        const [fooIndex, bazIndex] = zipFileTree.getRoots();
        const fooChildren = indexesToPartName(
          zipFileTree.getChildren(fooIndex)
        );
        const bazChildren = indexesToPartName(
          zipFileTree.getChildren(bazIndex)
        );

        expect(fooChildren).toEqual([
          'bar',
          'profile2.json',
          'profile3.json',
          'profile4.json',
        ]);
        expect(bazChildren).toEqual(['profile5.json']);
      });

      it('can see if a node has children', async function() {
        const { zipFileTree } = await initStoreAndZipFileTree();
        const [fooIndex, bazIndex] = zipFileTree.getRoots();
        const [
          barIndex,
          profile2Index,
          profile3Index,
        ] = zipFileTree.getChildren(fooIndex);

        expect(zipFileTree.hasChildren(fooIndex)).toBe(true);
        expect(zipFileTree.hasChildren(bazIndex)).toBe(true);
        expect(zipFileTree.hasChildren(barIndex)).toBe(true);
        expect(zipFileTree.hasChildren(profile2Index)).toBe(false);
        expect(zipFileTree.hasChildren(profile3Index)).toBe(false);
      });

      it('can get all descendants', async function() {
        const {
          zipFileTree,
          indexesToPartName,
        } = await initStoreAndZipFileTree();
        const [fooIndex] = zipFileTree.getRoots();
        const descendantsOfFoo = indexesToPartName([
          ...zipFileTree.getAllDescendants(fooIndex),
        ]);
        expect(descendantsOfFoo).toEqual([
          'bar',
          'profile1.json',
          'profile2.json',
          'profile3.json',
          'profile4.json',
        ]);
      });

      it('can see if a node has parents', async function() {
        const { zipFileTree } = await initStoreAndZipFileTree();
        const [fooIndex, bazIndex] = zipFileTree.getRoots();
        const [
          barIndex,
          profile2Index,
          profile3Index,
        ] = zipFileTree.getChildren(fooIndex);

        expect(zipFileTree.getParent(fooIndex)).toBe(-1);
        expect(zipFileTree.getParent(bazIndex)).toBe(-1);
        expect(zipFileTree.getParent(barIndex)).toBe(fooIndex);
        expect(zipFileTree.getParent(profile2Index)).toBe(fooIndex);
        expect(zipFileTree.getParent(profile3Index)).toBe(fooIndex);
      });

      it('can get the depth of a node', async function() {
        const { zipFileTree } = await initStoreAndZipFileTree();
        const [fooIndex, bazIndex] = zipFileTree.getRoots();
        const [
          barIndex,
          profile2Index,
          profile3Index,
        ] = zipFileTree.getChildren(fooIndex);

        expect(zipFileTree.getDepth(fooIndex)).toBe(0);
        expect(zipFileTree.getDepth(bazIndex)).toBe(0);
        expect(zipFileTree.getDepth(barIndex)).toBe(1);
        expect(zipFileTree.getDepth(profile2Index)).toBe(1);
        expect(zipFileTree.getDepth(profile3Index)).toBe(1);
      });

      it('can get compute display data', async function() {
        const { zipFileTree } = await initStoreAndZipFileTree();
        const [fooIndex, bazIndex] = zipFileTree.getRoots();
        const [
          barIndex,
          profile2Index,
          profile3Index,
        ] = zipFileTree.getChildren(fooIndex);

        expect(zipFileTree.getDisplayData(fooIndex)).toMatchSnapshot();
        expect(zipFileTree.getDisplayData(bazIndex)).toMatchSnapshot();
        expect(zipFileTree.getDisplayData(barIndex)).toMatchSnapshot();
        expect(zipFileTree.getDisplayData(profile2Index)).toMatchSnapshot();
        expect(zipFileTree.getDisplayData(profile3Index)).toMatchSnapshot();
      });
    });
  });
});
