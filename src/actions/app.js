/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action } from '../types/store';
import type { TabSlug } from '../types/actions';

export function changeSelectedTab(selectedTab: TabSlug): Action {
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
