// @flow
import type { Action } from './types';

export function changeSelectedTab(selectedTab: string): Action {
  return {
    type: 'CHANGE_SELECTED_TAB',
    selectedTab,
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

export function iconHasLoaded(icon): Action {
  return {
    type: 'ICON_HAS_LOADED',
    icon,
  };
}

export function iconIsInError(icon): Action {
  return {
    type: 'ICON_IN_ERROR',
    icon,
  };
}
