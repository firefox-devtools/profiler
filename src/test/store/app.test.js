/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { storeWithSimpleProfile } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import * as UrlStateSelectors from '../../reducers/url-state';
import * as AppSelectors from '../../reducers/app';
import createStore from '../../create-store';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';

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
});
