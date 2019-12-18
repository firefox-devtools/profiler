/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { storeWithSimpleProfile, storeWithProfile } from '../fixtures/stores';
import * as selectors from 'firefox-profiler/selectors';
import createStore from '../../app-logic/create-store';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';
import { isolateProcess } from '../../actions/profile-view';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';

import * as AppActions from '../../actions/app';

describe('app actions', function() {
  describe('changeSelectedTab', function() {
    it('can change tabs', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(selectors.getSelectedTab(getState())).toEqual('calltree');
      dispatch(AppActions.changeSelectedTab('stack-chart'));
      expect(selectors.getSelectedTab(getState())).toEqual('stack-chart');
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

  describe('urlSetupDone', function() {
    it('will remember when url setup is done', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(selectors.getUrlSetupPhase(getState())).toEqual('initial-load');
      dispatch(AppActions.urlSetupDone());
      expect(selectors.getUrlSetupPhase(getState())).toEqual('done');
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
      expect(selectors.getView(getState())).toEqual({
        phase: 'INITIALIZING',
      });
      dispatch(AppActions.show404('http://foobar.com'));
      expect(selectors.getView(getState())).toEqual({
        phase: 'ROUTE_NOT_FOUND',
      });
    });
  });

  describe('isSidebarOpen', function() {
    it('can change the state of the sidebar', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(selectors.getIsSidebarOpen(getState())).toEqual(false);
      dispatch(AppActions.changeSidebarOpenState('calltree', true));
      expect(selectors.getIsSidebarOpen(getState())).toEqual(true);
      dispatch(AppActions.changeSelectedTab('flame-graph'));
      expect(selectors.getIsSidebarOpen(getState())).toEqual(false);
      dispatch(AppActions.changeSidebarOpenState('flame-graph', true));
      expect(selectors.getIsSidebarOpen(getState())).toEqual(true);
      dispatch(AppActions.changeSidebarOpenState('calltree', false));
      expect(selectors.getIsSidebarOpen(getState())).toEqual(true);
    });
  });

  describe('updateUrlState', function() {
    it('can swap out to a different URL state', function() {
      const { dispatch, getState } = storeWithSimpleProfile();

      // The URL state starts out on the calltree tab.
      const originalUrlState = selectors.getUrlState(getState());
      expect(selectors.getSelectedTab(getState())).toEqual('calltree');

      // Change it, and make sure the URL state updates.
      dispatch(AppActions.changeSelectedTab('stack-chart'));
      expect(selectors.getSelectedTab(getState())).toEqual('stack-chart');
      expect(selectors.getUrlState(getState())).not.toBe(originalUrlState);

      // Now revert it to the original, and make sure everything resets.
      dispatch(AppActions.updateUrlState(originalUrlState));
      expect(selectors.getUrlState(getState())).toBe(originalUrlState);
      expect(selectors.getSelectedTab(getState())).toEqual('calltree');
    });
  });

  describe('panelLayoutGeneration', function() {
    it('can be manually updated using an action', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(selectors.getPanelLayoutGeneration(getState())).toBe(0);
      dispatch(AppActions.invalidatePanelLayout());
      expect(selectors.getPanelLayoutGeneration(getState())).toBe(1);
      dispatch(AppActions.invalidatePanelLayout());
      expect(selectors.getPanelLayoutGeneration(getState())).toBe(2);
    });

    it('will be updated when working with the sidebar', function() {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(selectors.getPanelLayoutGeneration(getState())).toBe(0);
      dispatch(AppActions.changeSidebarOpenState('flame-graph', false));
      expect(selectors.getPanelLayoutGeneration(getState())).toBe(1);
    });

    it('will be updated when working with the timeline', function() {
      const { dispatch, getState } = storeWithProfile(
        getProfileWithNiceTracks()
      );
      expect(selectors.getPanelLayoutGeneration(getState())).toBe(0);
      dispatch(isolateProcess(0));
      expect(selectors.getPanelLayoutGeneration(getState())).toBe(1);
    });
  });
});
