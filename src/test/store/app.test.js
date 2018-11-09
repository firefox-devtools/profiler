/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { storeWithSimpleProfile, storeWithProfile } from '../fixtures/stores';
import * as UrlStateSelectors from '../../reducers/url-state';
import * as AppSelectors from '../../reducers/app';
import createStore from '../../app-logic/create-store';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';
import { isolateProcess } from '../../actions/profile-view';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
  getNetworkMarker,
} from '../fixtures/profiles/make-profile';

import * as AppActions from '../../actions/app';

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

  describe('visibleTabs', function() {
    it('hides the network chart when there are no network markers in a thread', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { getState } = storeWithProfile(profile);
      expect(AppSelectors.getVisibleTabs(getState())).toEqual([
        'calltree',
        'flame-graph',
        'stack-chart',
        'marker-chart',
        'marker-table',
      ]);
    });
    it('shows the network chart when network markers are present in the thread', function() {
      const profile = getProfileWithMarkers([getNetworkMarker(10, 0)]);
      const { getState } = storeWithProfile(profile);
      expect(AppSelectors.getVisibleTabs(getState())).toEqual([
        'calltree',
        'flame-graph',
        'stack-chart',
        'marker-chart',
        'marker-table',
        'network-chart',
      ]);
    });
  });

  describe('urlSetupDone', function() {
    it('will remember when url setup is done', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(AppSelectors.getIsUrlSetupDone(getState())).toEqual(false);
      dispatch(AppActions.urlSetupDone());
      expect(AppSelectors.getIsUrlSetupDone(getState())).toEqual(true);
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

  describe('isSidebarOpen', function() {
    it('can change the state of the sidebar', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);
      dispatch(AppActions.changeSidebarOpenState('calltree', true));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(true);
      dispatch(AppActions.changeSelectedTab('flame-graph'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);
      dispatch(AppActions.changeSidebarOpenState('flame-graph', true));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(true);
      dispatch(AppActions.changeSidebarOpenState('calltree', false));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(true);
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

  describe('panelLayoutGeneration', function() {
    it('can be manually updated using an action', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(AppSelectors.getPanelLayoutGeneration(getState())).toBe(0);
      dispatch(AppActions.invalidatePanelLayout());
      expect(AppSelectors.getPanelLayoutGeneration(getState())).toBe(1);
      dispatch(AppActions.invalidatePanelLayout());
      expect(AppSelectors.getPanelLayoutGeneration(getState())).toBe(2);
    });

    it('will be updated when working with the sidebar', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(AppSelectors.getPanelLayoutGeneration(getState())).toBe(0);
      dispatch(AppActions.changeSidebarOpenState('flame-graph', false));
      expect(AppSelectors.getPanelLayoutGeneration(getState())).toBe(1);
    });

    it('will be updated when working with the timeline', function() {
      const { dispatch, getState } = storeWithProfile(
        getProfileWithNiceTracks()
      );
      expect(AppSelectors.getPanelLayoutGeneration(getState())).toBe(0);
      dispatch(isolateProcess(0));
      expect(AppSelectors.getPanelLayoutGeneration(getState())).toBe(1);
    });
  });
});
