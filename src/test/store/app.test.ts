/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { storeWithSimpleProfile } from '../fixtures/stores';
import * as UrlStateSelectors from '../../selectors/url-state';
import * as AppSelectors from '../../selectors/app';
import createStore from '../../app-logic/create-store';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';

import * as AppActions from '../../actions/app';

describe('app actions', function () {
  describe('changeSelectedTab', function () {
    it('can change tabs', function () {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(UrlStateSelectors.getSelectedTab(getState())).toEqual('calltree');
      dispatch(AppActions.changeSelectedTab('stack-chart'));
      expect(UrlStateSelectors.getSelectedTab(getState())).toEqual(
        'stack-chart'
      );
    });

    it('records an analytics event when changing tabs', function () {
      withAnalyticsMock((gaMock) => {
        const { dispatch } = storeWithSimpleProfile();
        dispatch(AppActions.changeSelectedTab('stack-chart'));
        expect(gaMock.calls).toEqual([
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

  describe('urlSetupDone', function () {
    it('will remember when url setup is done', function () {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(AppSelectors.getUrlSetupPhase(getState())).toEqual('initial-load');
      dispatch(AppActions.urlSetupDone());
      expect(AppSelectors.getUrlSetupPhase(getState())).toEqual('done');
    });

    it('records analytics events for pageview and datasource', function () {
      withAnalyticsMock((gaMock) => {
        const { dispatch } = storeWithSimpleProfile();
        dispatch(AppActions.urlSetupDone());
        expect(gaMock.calls).toEqual([
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

  describe('show404', function () {
    it('tracks when the route is not found', function () {
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

  describe('isSidebarOpen', function () {
    it('has certain sidebars open by default', function () {
      const { dispatch, getState } = storeWithSimpleProfile();

      dispatch(AppActions.changeSelectedTab('calltree'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(true);

      dispatch(AppActions.changeSelectedTab('flame-graph'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);

      dispatch(AppActions.changeSelectedTab('stack-chart'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);

      dispatch(AppActions.changeSelectedTab('marker-chart'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);

      dispatch(AppActions.changeSelectedTab('marker-table'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(true);

      dispatch(AppActions.changeSelectedTab('network-chart'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);

      dispatch(AppActions.changeSelectedTab('js-tracer'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);
    });

    it('can change the state of the sidebar', function () {
      const { dispatch, getState } = storeWithSimpleProfile();
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(true);
      dispatch(AppActions.changeSidebarOpenState('calltree', false));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);
      dispatch(AppActions.changeSelectedTab('flame-graph'));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(false);
      dispatch(AppActions.changeSidebarOpenState('flame-graph', true));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(true);
      dispatch(AppActions.changeSidebarOpenState('calltree', false));
      expect(AppSelectors.getIsSidebarOpen(getState())).toEqual(true);
    });
  });

  describe('updateUrlState', function () {
    it('can swap out to a different URL state', function () {
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
