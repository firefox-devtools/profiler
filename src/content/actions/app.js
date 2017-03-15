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
