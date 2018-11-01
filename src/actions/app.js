/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getAreTooltipsEnabled } from '../reducers/app';
import { getSelectedTab, getDataSource } from '../reducers/url-state';
import { sendAnalytics } from '../utils/analytics';
import type { Action, ThunkAction } from '../types/store';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { ProfileSharingStatus, UrlState } from '../types/reducers';
import type { TooltipReference, MousePosition } from '../types/actions';
import type { CssPixels } from '../types/units';

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

export function setProfileSharingStatus(
  profileSharingStatus: ProfileSharingStatus
): Action {
  return {
    type: 'SET_PROFILE_SHARING_STATUS',
    profileSharingStatus,
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
    dispatch({ type: 'URL_SETUP_DONE' });

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

export function changeSidebarOpenState(tab: TabSlug, isOpen: boolean): Action {
  return { type: 'CHANGE_SIDEBAR_OPEN_STATE', tab, isOpen };
}

export function invalidatePanelLayout(): Action {
  return { type: 'INCREMENT_PANEL_LAYOUT_GENERATION' };
}

/**
 * This function is called when a browser navigation event happens. A new UrlState
 * is generated when the window.location is serialized, or the state is pulled out of
 * the history API.
 */
export function updateUrlState(newUrlState: UrlState): Action {
  return { type: 'UPDATE_URL_STATE', newUrlState };
}

/**
 * Tooltips are created from global Redux state. This action causes one to show
 * up in the UI. The action is ignored if tooltips are currently disabled.
 */
export function viewTooltip(
  mouseX: CssPixels,
  mouseY: CssPixels,
  tooltipReference: TooltipReference
): ThunkAction<void> {
  return (dispatch, getState) => {
    if (getAreTooltipsEnabled(getState())) {
      dispatch({
        type: 'VIEW_TOOLTIP',
        tooltipReference,
        mouse: { mouseX, mouseY },
      });
    }
  };
}

/**
 * Hide the current tooltip.
 */
export function dismissTooltip(): Action {
  return { type: 'DISMISS_TOOLTIP' };
}

/**
 * Re-position the tooltip.
 */
export function moveTooltip(mouse: MousePosition): Action {
  return {
    type: 'MOVE_TOOLTIP',
    mouse,
  };
}

/**
 * Temporarily disable tooltips from showing. This is useful for stopping tooltips
 * from interfering with mouse actions like draggin.
 */
export function disableTooltips(): Action {
  return {
    type: 'DISABLE_TOOLTIPS',
  };
}

/**
 * Re-enable a tooltip after disabling it.
 */
export function enableTooltips(): Action {
  return {
    type: 'ENABLE_TOOLTIPS',
  };
}
