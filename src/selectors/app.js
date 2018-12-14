/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';

import { getSelectedTab } from './url-state';
import { tabSlugs } from '../app-logic/tabs-handling';
import { selectedThreadSelectors } from './profile-view';

import type { TabSlug } from '../app-logic/tabs-handling';
import type { AppState, AppViewState } from '../types/state';
import type { Selector } from '../types/store';

/**
 * Simple selectors into the app state.
 */
export const getApp: Selector<AppState> = state => state.app;
export const getView: Selector<AppViewState> = state => getApp(state).view;
export const getIsUrlSetupDone: Selector<boolean> = state =>
  getApp(state).isUrlSetupDone;
export const getHasZoomedViaMousewheel: Selector<boolean> = state => {
  return getApp(state).hasZoomedViaMousewheel;
};
export const getIsSidebarOpen: Selector<boolean> = state =>
  getApp(state).isSidebarOpenPerPanel[getSelectedTab(state)];
export const getPanelLayoutGeneration: Selector<number> = state =>
  getApp(state).panelLayoutGeneration;
export const getLastVisibleThreadTabSlug: Selector<TabSlug> = state =>
  getApp(state).lastVisibleThreadTabSlug;

/**
 * Visible tabs are computed based on the current state of the profile. Some
 * effort is made to not show a tab when there is no data available for it.
 */
export const getVisibleTabs: Selector<$ReadOnlyArray<TabSlug>> = createSelector(
  selectedThreadSelectors.getIsNetworkChartEmptyInFullRange,
  selectedThreadSelectors.getJsTracerTable,
  (isNetworkChartEmpty, jsTracerTable) => {
    let visibleTabs = tabSlugs;
    if (isNetworkChartEmpty) {
      visibleTabs = visibleTabs.filter(tabSlug => tabSlug !== 'network-chart');
    }
    if (!jsTracerTable) {
      visibleTabs = visibleTabs.filter(tabSlug => tabSlug !== 'js-tracer');
    }
    return visibleTabs;
  }
);
