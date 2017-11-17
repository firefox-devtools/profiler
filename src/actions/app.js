/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getSelectedTab, getDataSource } from '../reducers/url-state';
import { sendAnalytics } from '../utils/analytics';

import type { Action, ThunkAction } from '../types/store';
import type { TabSlug } from '../types/actions';
import type { UrlState } from '../types/reducers';

export function changeSelectedTab(selectedTab: TabSlug): ThunkAction<void> {
  return (dispatch, getState) => {
    const previousTab = getSelectedTab(getState());
    if (previousTab !== selectedTab) {
      sendAnalytics({
        hitType: 'pageview',
        page: selectedTab,
      });
      dispatch({
        type: 'CHANGE_SELECTED_TAB',
        selectedTab,
      });
    }
  };
}

export function profilePublished(hash: string): Action {
  return {
    type: 'PROFILE_PUBLISHED',
    hash,
  };
}

export function changeTabOrder(tabOrder: number[]): Action {
  return {
    type: 'CHANGE_TAB_ORDER',
    tabOrder,
  };
}

export function urlSetupDone(): ThunkAction<void> {
  return (dispatch, getState) => {
    dispatch({ type: '@@urlenhancer/urlSetupDone' });

    // After the url setup is done, we can successfully query our state about its
    // initial page.
    const dataSource = getDataSource(getState());
    sendAnalytics({
      hitType: 'pageview',
      page: dataSource === 'none' ? 'home' : getSelectedTab(getState()),
    });
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'datasource',
      eventAction: dataSource,
    });
  };
}

export function show404(url: string): Action {
  return { type: 'ROUTE_NOT_FOUND', url };
}

export function updateUrlState(urlState: UrlState): Action {
  return { type: '@@urlenhancer/updateUrlState', urlState };
}
