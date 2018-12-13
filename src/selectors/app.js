/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';

import { getSelectedTab } from './url-state';
import { tabSlugs } from '../app-logic/tabs-handling';
import { selectedThreadSelectors } from './profile-view';

import type { TabSlug } from '../app-logic/tabs-handling';
import type { State, AppState, AppViewState } from '../types/reducers';

export const getApp = (state: State): AppState => state.app;
export const getView = (state: State): AppViewState => getApp(state).view;
export const getIsUrlSetupDone = (state: State): boolean =>
  getApp(state).isUrlSetupDone;
export const getHasZoomedViaMousewheel = (state: State): boolean => {
  return getApp(state).hasZoomedViaMousewheel;
};
export const getIsSidebarOpen = (state: State): boolean =>
  getApp(state).isSidebarOpenPerPanel[getSelectedTab(state)];
export const getPanelLayoutGeneration = (state: State) =>
  getApp(state).panelLayoutGeneration;
export const getLastVisibleThreadTabSlug = (state: State) =>
  getApp(state).lastVisibleThreadTabSlug;

export const getVisibleTabs = createSelector(
  selectedThreadSelectors.getIsNetworkChartEmptyInFullRange,
  selectedThreadSelectors.getJsTracerTable,
  (isNetworkChartEmpty, jsTracerTable): $ReadOnlyArray<TabSlug> => {
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
